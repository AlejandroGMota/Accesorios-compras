package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// --- Output JSON schema ---

type Product struct {
	Nombre         string   `json:"nombre"`
	Precio         float64  `json:"precio"`
	PrecioOriginal float64  `json:"precioOriginal"`
	EnOferta       bool     `json:"enOferta"`
	Stock          string   `json:"stock"`
	Imagen         string   `json:"imagen"`
	Imagen64       string   `json:"imagen64"`
	Link           string   `json:"link"`
	Categoria      string   `json:"categoria"`
	Subcategorias  []string `json:"subcategorias"`
}

// --- WooCommerce Store API response ---

type APIProduct struct {
	Name              string            `json:"name"`
	Permalink         string            `json:"permalink"`
	OnSale            bool              `json:"on_sale"`
	Prices            APIPrices         `json:"prices"`
	Images            []APIImage        `json:"images"`
	Categories        []APICategory     `json:"categories"`
	StockAvailability APIStockAvail     `json:"stock_availability"`
}

type APIPrices struct {
	Price             string `json:"price"`
	RegularPrice      string `json:"regular_price"`
	SalePrice         string `json:"sale_price"`
	CurrencyMinorUnit int    `json:"currency_minor_unit"`
}

type APIImage struct {
	Src    string `json:"src"`
	Srcset string `json:"srcset"`
}

type APICategory struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Parent int    `json:"parent"`
	Count  int    `json:"count"`
}

type APIStockAvail struct {
	Text  string `json:"text"`
	Class string `json:"class"`
}

// --- Task for the worker pool ---

type task struct {
	slug         string
	categoryName string
	page         int
}

// --- Configuration ---

const (
	apiBase       = "https://buytiti.com/wp-json/wc/store/v1/products"
	categoriesAPI = "https://buytiti.com/wp-json/wc/store/v1/products/categories"
	maxRetries    = 3
	perPage       = 20
)

// Slugs to ignore when fetching categories automatically
var ignoreSlugs = map[string]bool{
	"uncategorized": true,
}

// fetchCategories obtains all root categories (parent=0) from the WooCommerce API.
func fetchCategories(client *http.Client) (map[string]string, error) {
	categories := make(map[string]string)
	page := 1

	for {
		url := fmt.Sprintf("%s?per_page=100&page=%d", categoriesAPI, page)
		log.Printf("[CATS]   Fetching categorías pág %d...", page)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("error creando request de categorías: %w", err)
		}
		req.Header.Set("User-Agent", "BuyTitiCatalogScraper/1.0")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("error de red al obtener categorías: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("error leyendo body de categorías: %w", err)
		}

		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("HTTP %d al obtener categorías", resp.StatusCode)
		}

		var cats []APICategory
		if err := json.Unmarshal(body, &cats); err != nil {
			return nil, fmt.Errorf("error parsing categorías: %w", err)
		}

		if len(cats) == 0 {
			break
		}

		for _, c := range cats {
			if c.Parent == 0 && c.Count > 0 && !ignoreSlugs[c.Slug] {
				categories[c.Name] = c.Slug
			}
		}

		page++
	}

	return categories, nil
}

var (
	flagOutput  string
	flagDelay   time.Duration
	flagWorkers int
	flagVerbose bool
)

func init() {
	_, srcFile, _, _ := runtime.Caller(0)
	defaultOutput := filepath.Join(filepath.Dir(srcFile), "..", "productos.json")
	flag.StringVar(&flagOutput, "output", defaultOutput, "Ruta del archivo JSON de salida")
	flag.DurationVar(&flagDelay, "delay", 500*time.Millisecond, "Delay entre requests por worker")
	flag.IntVar(&flagWorkers, "workers", 3, "Número de goroutines workers")
	flag.BoolVar(&flagVerbose, "verbose", false, "Logging detallado")
}

// fetchPage makes a GET request to the WooCommerce Store API for a single page.
// Returns the parsed products or an error. Retries with exponential backoff.
func fetchPage(client *http.Client, t task) ([]APIProduct, error) {
	url := fmt.Sprintf("%s?category=%s&page=%d&per_page=%d", apiBase, t.slug, t.page, perPage)

	var lastErr error
	for attempt := range maxRetries {
		if attempt > 0 {
			backoff := time.Duration(math.Pow(2, float64(attempt))) * time.Second
			log.Printf("[RETRY]  %s pág %d — intento %d/%d (espera %v)", t.categoryName, t.page, attempt+1, maxRetries, backoff)
			time.Sleep(backoff)
		}

		if flagVerbose {
			log.Printf("[HTTP]   GET %s", url)
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("error creando request: %w", err)
		}
		req.Header.Set("User-Agent", "BuyTitiCatalogScraper/1.0")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("error de red: %w", err)
			log.Printf("[ERROR]  %s pág %d — error de red: %v", t.categoryName, t.page, err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("error leyendo body: %w", err)
			log.Printf("[ERROR]  %s pág %d — error leyendo respuesta: %v", t.categoryName, t.page, err)
			continue
		}

		if resp.StatusCode == 429 {
			backoff := time.Duration(math.Pow(3, float64(attempt+1))) * time.Second
			log.Printf("[WARN]   %s pág %d — Rate limited (429), espera %v", t.categoryName, t.page, backoff)
			time.Sleep(backoff)
			lastErr = fmt.Errorf("HTTP 429 rate limited")
			continue
		}

		if resp.StatusCode != 200 {
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body[:min(200, len(body))]))
			log.Printf("[ERROR]  %s pág %d — HTTP %d", t.categoryName, t.page, resp.StatusCode)
			continue
		}

		var products []APIProduct
		if err := json.Unmarshal(body, &products); err != nil {
			lastErr = fmt.Errorf("error parsing JSON: %w", err)
			log.Printf("[ERROR]  %s pág %d — JSON inválido: %v", t.categoryName, t.page, err)
			continue
		}

		return products, nil
	}

	return nil, fmt.Errorf("[%s] página %d falló después de %d intentos: %w", t.categoryName, t.page, maxRetries, lastErr)
}

// convertPrice converts a WooCommerce minor-unit price string to float64.
// e.g. "2700" with minorUnit=2 -> 27.00
func convertPrice(priceStr string, minorUnit int) float64 {
	if priceStr == "" {
		return 0.0
	}
	val, err := strconv.Atoi(priceStr)
	if err != nil {
		log.Printf("[WARN]   Precio inválido %q, usando 0.0", priceStr)
		return 0.0
	}

	divisor := math.Pow(10, float64(minorUnit))
	return math.Round(float64(val)/divisor*100) / 100
}

// extractSrcsetURL extracts a URL for a specific width descriptor from a srcset string.
// e.g. extractSrcsetURL("...img-64x64.jpg 64w, ...img-100x100.jpg 100w", "64w") returns the 64w URL.
func extractSrcsetURL(srcset string, width string) string {
	for entry := range strings.SplitSeq(srcset, ",") {
		parts := strings.Fields(strings.TrimSpace(entry))
		if len(parts) == 2 && parts[1] == width {
			return parts[0]
		}
	}
	return ""
}

// parseProducts transforms API products into the output JSON format.
func parseProducts(apiProducts []APIProduct, categoryName string) []Product {
	products := make([]Product, 0, len(apiProducts))
	for _, ap := range apiProducts {
		imagen := ""
		imagen64 := ""
		if len(ap.Images) > 0 {
			imagen = ap.Images[0].Src
			imagen64 = extractSrcsetURL(ap.Images[0].Srcset, "100w")
			if imagen64 == "" {
				imagen64 = imagen
			}
		} else {
			log.Printf("[WARN]   Producto sin imagen: %q", ap.Name)
		}

		// Price: use sale_price if on sale, otherwise price
		precio := convertPrice(ap.Prices.Price, ap.Prices.CurrencyMinorUnit)
		if ap.OnSale && ap.Prices.SalePrice != "" {
			precio = convertPrice(ap.Prices.SalePrice, ap.Prices.CurrencyMinorUnit)
		}
		precioOriginal := convertPrice(ap.Prices.RegularPrice, ap.Prices.CurrencyMinorUnit)

		// Subcategories from API
		var subcategorias []string
		for _, cat := range ap.Categories {
			subcategorias = append(subcategorias, cat.Name)
		}

		products = append(products, Product{
			Nombre:         ap.Name,
			Precio:         precio,
			PrecioOriginal: precioOriginal,
			EnOferta:       ap.OnSale,
			Stock:          ap.StockAvailability.Text,
			Imagen:         imagen,
			Imagen64:       imagen64,
			Link:           ap.Permalink,
			Categoria:      categoryName,
			Subcategorias:  subcategorias,
		})
	}
	return products
}

// worker reads tasks from the tasks channel, fetches and parses products,
// sends results to the results channel. If a page returns products,
// it enqueues the next page as a new task.
func worker(id int, client *http.Client, tasks <-chan task, results chan<- []Product, tasksCh chan<- task, pending *atomic.Int32, wg *sync.WaitGroup, delay time.Duration) {
	defer wg.Done()

	for t := range tasks {
		log.Printf("[W%d]     Fetch %s pág %d", id, t.categoryName, t.page)

		apiProducts, err := fetchPage(client, t)
		if err != nil {
			log.Printf("[W%d]     ERROR: %v", id, err)
			pending.Add(-1)
			continue
		}

		if len(apiProducts) == 0 {
			log.Printf("[DONE]   %s completada (pág %d vacía)", t.categoryName, t.page)
			pending.Add(-1)
			continue
		}

		products := parseProducts(apiProducts, t.categoryName)
		results <- products

		log.Printf("[W%d]     %s pág %d → %d productos", id, t.categoryName, t.page, len(products))

		// Enqueue next page for this category
		pending.Add(1)
		tasksCh <- task{
			slug:         t.slug,
			categoryName: t.categoryName,
			page:         t.page + 1,
		}

		// Mark current task done
		pending.Add(-1)

		time.Sleep(delay)
	}
}

// run orchestrates the scraping: creates channels, launches workers,
// seeds initial tasks, collects results, and writes JSON incrementally.
func run(cats map[string]string, numWorkers int, delay time.Duration, outputPath string) error {
	tasksCh := make(chan task, 100)
	results := make(chan []Product, 100)
	var pending atomic.Int32
	var wg sync.WaitGroup

	client := &http.Client{Timeout: 30 * time.Second}

	// Launch workers
	// Reset JSON file at start
	if err := writeJSON([]Product{}, outputPath); err != nil {
		return fmt.Errorf("error reseteando JSON: %w", err)
	}
	log.Printf("[RESET]  JSON reiniciado: %s", outputPath)

	log.Printf("[START]  Lanzando %d workers...", numWorkers)
	for i := range numWorkers {
		wg.Add(1)
		go worker(i+1, client, tasksCh, results, tasksCh, &pending, &wg, delay)
	}

	// Seed initial tasks (page 1 for each category)
	for name, slug := range cats {
		pending.Add(1)
		log.Printf("[QUEUE]  Encolando %s (slug: %s) pág 1", name, slug)
		tasksCh <- task{slug: slug, categoryName: name, page: 1}
	}

	// Monitor: close tasks channel when all work is done
	go func() {
		for {
			time.Sleep(200 * time.Millisecond)
			if pending.Load() <= 0 {
				close(tasksCh)
				return
			}
		}
	}()

	// Wait for workers to finish, then close results
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results incrementally and write JSON after each batch
	var allProducts []Product
	var mu sync.Mutex
	counts := make(map[string]int)
	totalBatches := 0

	for batch := range results {
		mu.Lock()
		allProducts = append(allProducts, batch...)
		for _, p := range batch {
			counts[p.Categoria]++
		}
		totalBatches++
		currentTotal := len(allProducts)
		mu.Unlock()

		// Write JSON incrementally after each batch
		if err := writeJSON(allProducts, outputPath); err != nil {
			log.Printf("[ERROR]  Error escribiendo JSON incremental: %v", err)
		} else if flagVerbose {
			log.Printf("[WRITE]  JSON actualizado: %d productos totales", currentTotal)
		}
	}

	// Final summary
	fmt.Println()
	log.Printf("[RESUMEN] ─────────────────────────────")
	for name := range cats {
		log.Printf("[RESUMEN] %s: %d productos", name, counts[name])
	}
	log.Printf("[RESUMEN] ─────────────────────────────")
	log.Printf("[RESUMEN] Total: %d productos en %d batches", len(allProducts), totalBatches)

	// Final sorted write (sort by category, then name)
	sort.Slice(allProducts, func(i, j int) bool {
		if allProducts[i].Categoria != allProducts[j].Categoria {
			return allProducts[i].Categoria < allProducts[j].Categoria
		}
		return allProducts[i].Nombre < allProducts[j].Nombre
	})
	if err := writeJSON(allProducts, outputPath); err != nil {
		return fmt.Errorf("error en escritura final: %w", err)
	}
	log.Printf("[WRITE]  JSON final escrito (ordenado por categoría y nombre)")

	return nil
}

// writeJSON writes the product list to a JSON file with 4-space indentation.
func writeJSON(products []Product, fpath string) error {
	data, err := json.MarshalIndent(products, "", "    ")
	if err != nil {
		return fmt.Errorf("error serializando JSON: %w", err)
	}

	if err := os.WriteFile(fpath, data, 0644); err != nil {
		return fmt.Errorf("error escribiendo archivo: %w", err)
	}

	return nil
}

func main() {
	flag.Parse()

	log.SetFlags(log.Ltime)

	// Resolve output path relative to the working directory
	output := flagOutput
	if !filepath.IsAbs(output) {
		execDir, err := os.Getwd()
		if err != nil {
			log.Fatalf("Error obteniendo directorio actual: %v", err)
		}
		output = filepath.Join(execDir, output)
	}

	log.Printf("[CONFIG] Output:  %s", output)
	log.Printf("[CONFIG] Workers: %d", flagWorkers)
	log.Printf("[CONFIG] Delay:   %v", flagDelay)

	// Fetch categories dynamically from the API
	client := &http.Client{Timeout: 30 * time.Second}
	categories, err := fetchCategories(client)
	if err != nil {
		log.Fatalf("[FATAL]  Error obteniendo categorías: %v", err)
	}
	if len(categories) == 0 {
		log.Fatalf("[FATAL]  No se encontraron categorías")
	}

	log.Printf("[CONFIG] Categorías: %d", len(categories))
	for name, slug := range categories {
		log.Printf("[CONFIG]   %s → %s", name, slug)
	}
	fmt.Println()

	start := time.Now()
	if err := run(categories, flagWorkers, flagDelay, output); err != nil {
		log.Fatalf("[FATAL]  %v", err)
	}
	elapsed := time.Since(start)

	log.Printf("[FIN]    Escrito en: %s", output)
	log.Printf("[FIN]    Tiempo total: %v", elapsed.Round(time.Millisecond))
}
