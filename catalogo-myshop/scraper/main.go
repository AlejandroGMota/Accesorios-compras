package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	baseURL    = "https://www.my-shop.mx"
	shopURL    = baseURL + "/shop"
	maxRetries = 3
)

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

type productEntry struct {
	url      string
	imagen64 string
	category string
}

var (
	flagOutput  string
	flagDelay   time.Duration
	flagWorkers int
	flagVerbose bool

	// Regex patterns for HTML parsing
	reProductHref = regexp.MustCompile(`href="(/shop/[^"?]+\-(\d+))(?:\?[^"]*)?"\s*`)
	reCatHref     = regexp.MustCompile(`href="(/shop/category/([^"]+))"`)
	reImgSrc      = regexp.MustCompile(`src="(/web/image/product[^"]*)"`)
	reH1          = regexp.MustCompile(`<h1[^>]*>(.*?)</h1>`)
	rePrice       = regexp.MustCompile(`\$\s*([\d,]+\.?\d*)`)
	reHiddenPrice = regexp.MustCompile(`itemprop="price"[^>]*>\s*([\d.]+)\s*<`)
	reListPrice   = regexp.MustCompile(`oe_default_price[^>]*>.*?oe_currency_value">([\d,.]+)<`)
	reBreadcrumb  = regexp.MustCompile(`<li[^>]*class="breadcrumb-item[^"]*"[^>]*>(?:<a[^>]*>)?([^<]+)`)
	reItempName   = regexp.MustCompile(`itemprop="name"[^>]*>([^<]+)<`)
	reAddToCart   = regexp.MustCompile(`id="add_to_cart"`)
	reCombNoExist = regexp.MustCompile(`Esta combinación no existe`)
)

func init() {
	_, srcFile, _, _ := runtime.Caller(0)
	defaultOutput := filepath.Join(filepath.Dir(srcFile), "..", "productos.json")
	flag.StringVar(&flagOutput, "output", defaultOutput, "Ruta del archivo JSON de salida")
	flag.DurationVar(&flagDelay, "delay", 500*time.Millisecond, "Delay entre requests")
	flag.IntVar(&flagWorkers, "workers", 3, "Número de goroutines workers")
	flag.BoolVar(&flagVerbose, "verbose", false, "Logging detallado")
}

func fetchHTML(client *http.Client, rawURL string) (string, error) {
	var lastErr error
	for attempt := range maxRetries {
		if attempt > 0 {
			backoff := time.Duration(math.Pow(2, float64(attempt))) * time.Second
			log.Printf("[RETRY]  %s — intento %d/%d (espera %v)", rawURL, attempt+1, maxRetries, backoff)
			time.Sleep(backoff)
		}

		req, err := http.NewRequest("GET", rawURL, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", "MyShopCatalogScraper/1.0")
		req.Header.Set("Accept", "text/html")
		req.Header.Set("Accept-Language", "es-MX,es;q=0.9")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			log.Printf("[ERROR]  %s — red: %v", rawURL, err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode == 429 {
			backoff := time.Duration(math.Pow(3, float64(attempt+1))) * time.Second
			log.Printf("[WARN]   Rate limited (429), espera %v", backoff)
			time.Sleep(backoff)
			lastErr = fmt.Errorf("HTTP 429")
			continue
		}
		if resp.StatusCode != 200 {
			lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
			log.Printf("[ERROR]  %s — HTTP %d", rawURL, resp.StatusCode)
			continue
		}

		return string(body), nil
	}
	return "", fmt.Errorf("falló después de %d intentos: %w", maxRetries, lastErr)
}

func absURL(rel string) string {
	if rel == "" || strings.HasPrefix(rel, "http") {
		return rel
	}
	return baseURL + rel
}

func parsePrice(s string) float64 {
	s = strings.ReplaceAll(s, ",", "")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

// fetchCategories discovers categories from the shop sidebar
func fetchCategories(client *http.Client) (map[string]string, error) {
	body, err := fetchHTML(client, shopURL)
	if err != nil {
		return nil, err
	}

	cats := make(map[string]string)
	// Find category links and their labels
	// Pattern: <div ... data-link-href="/shop/category/name-id"> ... <label>Name</label>
	reLabel := regexp.MustCompile(`data-link-href="(/shop/category/[^"]+)"[^>]*>[\s\S]*?<label[^>]*>([^<]+)</label>`)
	for _, m := range reLabel.FindAllStringSubmatch(body, -1) {
		catURL := m[1]
		name := strings.TrimSpace(m[2])
		if name != "" {
			cats[name] = absURL(catURL)
		}
	}

	// Fallback: simpler pattern
	if len(cats) == 0 {
		for _, m := range reCatHref.FindAllStringSubmatch(body, -1) {
			path := m[1]
			slug := m[2]
			// Convert slug to name: "belleza-1" -> "Belleza"
			parts := strings.Split(slug, "-")
			if len(parts) >= 2 {
				name := strings.Title(strings.Join(parts[:len(parts)-1], " "))
				cats[name] = absURL(path)
			}
		}
	}

	return cats, nil
}

// collectFromCategory scrapes all pages of a category to collect product URLs
func collectFromCategory(client *http.Client, catName, catURL string, delay time.Duration) []productEntry {
	var entries []productEntry
	seen := make(map[string]bool)

	for page := 1; ; page++ {
		pageURL := catURL
		if page > 1 {
			sep := "?"
			if strings.Contains(catURL, "?") {
				sep = "&"
			}
			pageURL = fmt.Sprintf("%s%spage=%d", catURL, sep, page)
		}

		log.Printf("[CAT]    %s pág %d...", catName, page)
		body, err := fetchHTML(client, pageURL)
		if err != nil {
			log.Printf("[ERROR]  %s pág %d: %v", catName, page, err)
			break
		}

		found := 0
		// Find all product links: href="/shop/slug-ID?category=N"
		for _, m := range reProductHref.FindAllStringSubmatch(body, -1) {
			path := m[1] // /shop/slug-ID (without query string)
			if strings.Contains(path, "/category/") || strings.Contains(path, "/cart") || strings.Contains(path, "/wishlist") {
				continue
			}
			fullURL := absURL(path)
			if seen[fullURL] {
				continue
			}
			seen[fullURL] = true

			// Try to find nearby image
			imagen64 := ""
			idx := strings.Index(body, m[0])
			if idx >= 0 {
				// Look for product image within ~500 chars around this link
				start := max(0, idx-500)
				end := min(len(body), idx+500)
				chunk := body[start:end]
				if imgMatch := reImgSrc.FindStringSubmatch(chunk); imgMatch != nil {
					imagen64 = absURL(imgMatch[1])
				}
			}

			entries = append(entries, productEntry{
				url:      fullURL,
				imagen64: imagen64,
				category: catName,
			})
			found++
		}

		log.Printf("[CAT]    %s pág %d → %d nuevos (total: %d)", catName, page, found, len(entries))
		if found == 0 {
			break
		}

		// Check if next page link exists
		nextPage := fmt.Sprintf("page=%d", page+1)
		if !strings.Contains(body, nextPage) {
			break
		}
		time.Sleep(delay)
	}

	return entries
}

// scrapeProduct fetches a product detail page and parses it
func scrapeProduct(client *http.Client, entry productEntry) (Product, error) {
	body, err := fetchHTML(client, entry.url)
	if err != nil {
		return Product{}, err
	}

	p := Product{
		Link:     entry.url,
		Imagen64: entry.imagen64,
	}

	// Name — try itemprop="name" first, then <h1>
	if m := reItempName.FindStringSubmatch(body); m != nil {
		p.Nombre = html.UnescapeString(strings.TrimSpace(m[1]))
	} else if m := reH1.FindStringSubmatch(body); m != nil {
		// Strip HTML tags inside h1
		name := regexp.MustCompile(`<[^>]+>`).ReplaceAllString(m[1], "")
		p.Nombre = html.UnescapeString(strings.TrimSpace(name))
	}

	// Price — Odoo hides the machine-readable price in:
	// <span itemprop="price" style="display:none;">15.0</span>
	if m := reHiddenPrice.FindStringSubmatch(body); m != nil {
		p.Precio = parsePrice(m[1])
	} else if m := rePrice.FindStringSubmatch(body); m != nil {
		p.Precio = parsePrice(m[1])
	}

	// Original/list price — Odoo renders it in a span with class "oe_default_price"
	// (hidden with d-none when not on sale)
	if m := reListPrice.FindStringSubmatch(body); m != nil {
		listPrice := parsePrice(m[1])
		if listPrice > p.Precio {
			p.PrecioOriginal = listPrice
			p.EnOferta = true
		} else {
			p.PrecioOriginal = p.Precio
		}
	} else {
		p.PrecioOriginal = p.Precio
	}

	// Stock — check for add-to-cart button vs "no existe" message
	switch {
	case reCombNoExist.MatchString(body):
		p.Stock = "Agotado"
	case reAddToCart.MatchString(body):
		p.Stock = "Disponible"
	default:
		p.Stock = "Desconocido"
	}

	// Image — high-res from detail page
	if m := reImgSrc.FindStringSubmatch(body); m != nil {
		p.Imagen = absURL(m[1])
	}
	if p.Imagen == "" {
		p.Imagen = p.Imagen64
	}
	if p.Imagen64 == "" {
		p.Imagen64 = p.Imagen
	}

	// Categories from breadcrumb
	var subcats []string
	for _, m := range reBreadcrumb.FindAllStringSubmatch(body, -1) {
		name := html.UnescapeString(strings.TrimSpace(m[1]))
		if name != "" && !strings.EqualFold(name, "inicio") && !strings.EqualFold(name, "home") {
			subcats = append(subcats, name)
		}
	}
	// Last breadcrumb is product name — remove
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
		log.Printf("[W%d]     OK  %q — $%.2f | %s | %s", id, p.Nombre, p.Precio, p.Stock, p.Categoria)
		results <- p
		time.Sleep(delay)
	}
}

func writeJSON(products []Product, fpath string) error {
	data, err := json.MarshalIndent(products, "", "    ")
	if err != nil {
		return err
	}
	return os.WriteFile(fpath, data, 0644)
}

func resolveOutput() string {
	output := flagOutput
	if !filepath.IsAbs(output) {
		wd, _ := os.Getwd()
		output = filepath.Join(wd, output)
	}

	// Decode percent-encoded path segments (e.g. from runtime.Caller)
	if decoded, err := url.PathUnescape(output); err == nil {
		output = decoded
	}

	return output
}

func run(numWorkers int, delay time.Duration, outputPath string) error {
	client := &http.Client{Timeout: 30 * time.Second}

	// Phase 1: discover categories
	log.Printf("[CATS]   Obteniendo categorías...")
	cats, err := fetchCategories(client)
	if err != nil {
		return fmt.Errorf("error obteniendo categorías: %w", err)
	}
	log.Printf("[CATS]   %d categorías:", len(cats))
	for name, u := range cats {
		log.Printf("[CATS]     %s → %s", name, u)
	}
	fmt.Println()

	// Phase 2: collect product URLs per category
	log.Printf("[LIST]   Recolectando URLs de productos...")
	seen := make(map[string]bool)
	var allEntries []productEntry
	for name, u := range cats {
		entries := collectFromCategory(client, name, u, delay)
		for _, e := range entries {
			if seen[e.url] {
				continue
			}
			seen[e.url] = true
			allEntries = append(allEntries, e)
		}
		time.Sleep(delay)
	}
	log.Printf("[LIST]   %d URLs únicas", len(allEntries))
	fmt.Println()

	// Phase 3: scrape detail pages with worker pool
	log.Printf("[START]  %d workers scraping detalle...", numWorkers)
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

	sort.Slice(products, func(i, j int) bool {
		if products[i].Categoria != products[j].Categoria {
			return products[i].Categoria < products[j].Categoria
		}
		return products[i].Nombre < products[j].Nombre
	})

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

	output := resolveOutput()

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
