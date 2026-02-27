package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const (
	baseURL    = "https://www.my-shop.mx"
	shopURL    = baseURL + "/shop"
	maxRetries = 3
)

// Product matches the BuyTiti output schema
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

// productEntry holds data collected during the listing phase
type productEntry struct {
	url      string
	imagen64 string // thumbnail from listing page
	category string
}

var (
	flagOutput  string
	flagDelay   time.Duration
	flagWorkers int
	flagVerbose bool
	reFirstNum  = regexp.MustCompile(`\d[\d,]*\.?\d*`)
)

func init() {
	_, srcFile, _, _ := runtime.Caller(0)
	defaultOutput := filepath.Join(filepath.Dir(srcFile), "..", "productos.json")
	flag.StringVar(&flagOutput, "output", defaultOutput, "Ruta del archivo JSON de salida")
	flag.DurationVar(&flagDelay, "delay", 500*time.Millisecond, "Delay entre requests")
	flag.IntVar(&flagWorkers, "workers", 3, "Número de goroutines workers")
	flag.BoolVar(&flagVerbose, "verbose", false, "Logging detallado")
}

func fetchDoc(client *http.Client, rawURL string) (*goquery.Document, error) {
	var lastErr error
	for attempt := range maxRetries {
		if attempt > 0 {
			backoff := time.Duration(math.Pow(2, float64(attempt))) * time.Second
			log.Printf("[RETRY]  %s — intento %d/%d (espera %v)", rawURL, attempt+1, maxRetries, backoff)
			time.Sleep(backoff)
		}

		req, err := http.NewRequest("GET", rawURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "MyShopCatalogScraper/1.0")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		req.Header.Set("Accept-Language", "es-MX,es;q=0.9")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			log.Printf("[ERROR]  %s — error de red: %v", rawURL, err)
			continue
		}

		if resp.StatusCode == 429 {
			backoff := time.Duration(math.Pow(3, float64(attempt+1))) * time.Second
			log.Printf("[WARN]   Rate limited (429), espera %v", backoff)
			resp.Body.Close()
			time.Sleep(backoff)
			lastErr = fmt.Errorf("HTTP 429")
			continue
		}
		if resp.StatusCode != 200 {
			resp.Body.Close()
			lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
			log.Printf("[ERROR]  %s — HTTP %d", rawURL, resp.StatusCode)
			continue
		}

		doc, err := goquery.NewDocumentFromReader(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		return doc, nil
	}
	return nil, fmt.Errorf("falló después de %d intentos: %w", maxRetries, lastErr)
}

func absURL(rel string) string {
	if rel == "" || strings.HasPrefix(rel, "http") {
		return rel
	}
	return baseURL + rel
}

// parsePrice extracts the first valid price from strings like "$ 30.00 30.0 MXN"
func parsePrice(s string) float64 {
	s = strings.ReplaceAll(s, ",", "")
	m := reFirstNum.FindString(s)
	if m == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(m, 64)
	return v
}

// isProductURL returns true if href looks like a product page (ends with numeric ID)
func isProductURL(href string) bool {
	if !strings.HasPrefix(href, "/shop/") {
		return false
	}
	if strings.Contains(href, "/category/") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(href, "/shop/"), "-")
	if len(parts) < 2 {
		return false
	}
	_, err := strconv.Atoi(parts[len(parts)-1])
	return err == nil
}

// fetchCategories scrapes the shop sidebar to get all category URLs
func fetchCategories(client *http.Client) (map[string]string, error) {
	doc, err := fetchDoc(client, shopURL)
	if err != nil {
		return nil, err
	}
	cats := make(map[string]string) // name -> full URL
	doc.Find("a[href^='/shop/category/']").Each(func(_ int, s *goquery.Selection) {
		href, _ := s.Attr("href")
		name := strings.TrimSpace(s.Text())
		if name != "" && href != "" {
			cats[name] = absURL(href)
		}
	})
	return cats, nil
}

// collectFromCategory scrapes all pages of a category and returns product entries
func collectFromCategory(client *http.Client, catName, catURL string, delay time.Duration) []productEntry {
	var entries []productEntry
	seen := make(map[string]bool)

	for page := 1; ; page++ {
		pageURL := catURL
		if page > 1 {
			pageURL = fmt.Sprintf("%s?page=%d", catURL, page)
		}

		log.Printf("[CAT]    %s pág %d...", catName, page)
		doc, err := fetchDoc(client, pageURL)
		if err != nil {
			log.Printf("[ERROR]  %s pág %d: %v", catName, page, err)
			break
		}

		found := 0
		doc.Find("a[href]").Each(func(_ int, s *goquery.Selection) {
			href, _ := s.Attr("href")
			if !isProductURL(href) {
				return
			}
			fullURL := absURL(href)
			if seen[fullURL] {
				return
			}
			seen[fullURL] = true

			imgSrc, _ := s.Find("img").First().Attr("src")
			entries = append(entries, productEntry{
				url:      fullURL,
				imagen64: absURL(imgSrc),
				category: catName,
			})
			found++
		})

		log.Printf("[CAT]    %s pág %d → %d nuevos (total: %d)", catName, page, found, len(entries))
		if found == 0 {
			break
		}

		// Check if next page exists
		nextExists := doc.Find(fmt.Sprintf("a[href*='page=%d']", page+1)).Length() > 0
		if !nextExists {
			break
		}
		time.Sleep(delay)
	}

	return entries
}

// scrapeProduct fetches a product detail page and returns a Product
func scrapeProduct(client *http.Client, entry productEntry) (Product, error) {
	doc, err := fetchDoc(client, entry.url)
	if err != nil {
		return Product{}, err
	}

	p := Product{
		Link:     entry.url,
		Imagen64: entry.imagen64,
	}

	// Name
	p.Nombre = strings.TrimSpace(doc.Find("h1").First().Text())

	// Price — try itemprop="price" content attribute first (machine-readable)
	priceStr, hasMeta := doc.Find("[itemprop='price']").First().Attr("content")
	if hasMeta && priceStr != "" {
		p.Precio, _ = strconv.ParseFloat(priceStr, 64)
	} else {
		// Fallback: parse visible price text
		priceText := ""
		doc.Find("#product_price, .o_product_price, .oe_price, [id*='price']").Each(func(_ int, s *goquery.Selection) {
			if priceText == "" {
				priceText = strings.TrimSpace(s.Text())
			}
		})
		if priceText == "" {
			// Last resort: find any short text containing "$ ... MXN"
			doc.Find("span, div, p").Each(func(_ int, s *goquery.Selection) {
				t := strings.TrimSpace(s.Text())
				if priceText == "" && strings.Contains(t, "$") && strings.Contains(t, "MXN") && len(t) < 60 {
					priceText = t
				}
			})
		}
		p.Precio = parsePrice(priceText)
	}

	// Original price (if on sale — look for strikethrough)
	delText := strings.TrimSpace(doc.Find("del, .oe_price_strikethrough, .text-decoration-line-through").First().Text())
	if delText != "" {
		p.PrecioOriginal = parsePrice(delText)
		p.EnOferta = p.PrecioOriginal > p.Precio
	} else {
		p.PrecioOriginal = p.Precio
	}

	// Stock — try specific selectors, fallback to body text analysis
	stockText := ""
	doc.Find(".availability_message, .o_not_available, [itemprop='availability'], .in_stock, .out_of_stock, .oe_website_sale_stock").Each(func(_ int, s *goquery.Selection) {
		if stockText == "" {
			if t := strings.TrimSpace(s.Text()); t != "" {
				stockText = t
			}
		}
	})
	if stockText == "" {
		body := doc.Find("body").Text()
		switch {
		case strings.Contains(body, "Esta combinación no existe"):
			stockText = "Agotado"
		case strings.Contains(body, "Añadir al carrito"), strings.Contains(body, "Agregar al carrito"):
			stockText = "Disponible"
		default:
			stockText = "Desconocido"
		}
	}
	p.Stock = stockText

	// Image — prefer high-res from detail page
	imgSrc, _ := doc.Find("img[src*='/web/image/product']").First().Attr("src")
	if imgSrc != "" {
		p.Imagen = absURL(imgSrc)
	} else {
		p.Imagen = p.Imagen64
	}
	if p.Imagen64 == "" {
		p.Imagen64 = p.Imagen
	}

	// Categories — breadcrumb + category from listing phase
	var subcats []string
	doc.Find("ol.breadcrumb li, nav[aria-label='breadcrumb'] li").Each(func(_ int, s *goquery.Selection) {
		t := strings.TrimSpace(s.Text())
		if t != "" && !strings.EqualFold(t, "home") && !strings.EqualFold(t, "inicio") {
			subcats = append(subcats, t)
		}
	})
	// Remove last item (product name itself)
	if len(subcats) > 0 {
		subcats = subcats[:len(subcats)-1]
	}

	if entry.category != "" {
		p.Categoria = entry.category
		if len(subcats) == 0 {
			subcats = []string{entry.category}
		}
	} else if len(subcats) > 0 {
		p.Categoria = subcats[len(subcats)-1]
	} else {
		p.Categoria = "General"
		subcats = []string{"General"}
	}
	p.Subcategorias = subcats

	return p, nil
}

func worker(id int, client *http.Client, jobs <-chan productEntry, results chan<- Product, wg *sync.WaitGroup, delay time.Duration) {
	defer wg.Done()
	for entry := range jobs {
		p, err := scrapeProduct(client, entry)
		if err != nil {
			log.Printf("[W%d]     ERROR %s: %v", id, entry.url, err)
			continue
		}
		log.Printf("[W%d]     OK  %q — %.2f MXN | %s | %s", id, p.Nombre, p.Precio, p.Stock, p.Categoria)
		results <- p
		time.Sleep(delay)
	}
}

func writeJSON(products []Product, fpath string) error {
	data, err := json.MarshalIndent(products, "", "    ")
	if err != nil {
		return fmt.Errorf("error serializando JSON: %w", err)
	}
	return os.WriteFile(fpath, data, 0644)
}

func run(numWorkers int, delay time.Duration, outputPath string) error {
	client := &http.Client{Timeout: 30 * time.Second}

	// Phase 1: discover categories from shop sidebar
	log.Printf("[CATS]   Obteniendo categorías...")
	cats, err := fetchCategories(client)
	if err != nil {
		return fmt.Errorf("error obteniendo categorías: %w", err)
	}
	log.Printf("[CATS]   %d categorías:", len(cats))
	for name, url := range cats {
		log.Printf("[CATS]     %s → %s", name, url)
	}
	fmt.Println()

	// Phase 2: collect product URLs per category
	log.Printf("[LIST]   Recolectando URLs de productos por categoría...")
	seen := make(map[string]bool)
	var allEntries []productEntry
	for name, url := range cats {
		entries := collectFromCategory(client, name, url, delay)
		for _, e := range entries {
			if seen[e.url] {
				continue
			}
			seen[e.url] = true
			allEntries = append(allEntries, e)
		}
		time.Sleep(delay)
	}
	log.Printf("[LIST]   %d URLs únicas encontradas", len(allEntries))
	fmt.Println()

	// Phase 3: scrape each product detail page
	log.Printf("[START]  Lanzando %d workers para scraping de detalle...", numWorkers)
	jobs := make(chan productEntry, len(allEntries))
	results := make(chan Product, len(allEntries))
	var wg sync.WaitGroup

	for i := range numWorkers {
		wg.Add(1)
		go worker(i+1, client, jobs, results, &wg, delay)
	}
	for _, e := range allEntries {
		jobs <- e
	}
	close(jobs)

	go func() {
		wg.Wait()
		close(results)
	}()

	var products []Product
	counts := make(map[string]int)
	for p := range results {
		products = append(products, p)
		counts[p.Categoria]++
	}

	// Sort by category then name
	sort.Slice(products, func(i, j int) bool {
		if products[i].Categoria != products[j].Categoria {
			return products[i].Categoria < products[j].Categoria
		}
		return products[i].Nombre < products[j].Nombre
	})

	// Summary
	fmt.Println()
	log.Printf("[RESUMEN] ─────────────────────────────")
	for cat, n := range counts {
		log.Printf("[RESUMEN] %s: %d productos", cat, n)
	}
	log.Printf("[RESUMEN] ─────────────────────────────")
	log.Printf("[RESUMEN] Total: %d productos", len(products))

	return writeJSON(products, outputPath)
}

func main() {
	flag.Parse()
	log.SetFlags(log.Ltime)

	output := flagOutput
	if !filepath.IsAbs(output) {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatalf("Error obteniendo directorio actual: %v", err)
		}
		output = filepath.Join(wd, output)
	}

	log.Printf("[CONFIG] Output:  %s", output)
	log.Printf("[CONFIG] Workers: %d", flagWorkers)
	log.Printf("[CONFIG] Delay:   %v", flagDelay)
	fmt.Println()

	start := time.Now()
	if err := run(flagWorkers, flagDelay, output); err != nil {
		log.Fatalf("[FATAL]  %v", err)
	}

	log.Printf("[FIN]    Escrito en: %s", output)
	log.Printf("[FIN]    Tiempo total: %v", time.Since(start).Round(time.Millisecond))
}
