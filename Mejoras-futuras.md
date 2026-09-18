# Mejoras Futuras

---

## Pendientes

- [ ] Analytics de Fundas (tab bloqueado en `analytics/index.html`)
- [ ] Agregar el conector `hidrogel-mcp` en claude.ai y sus instrucciones en el proyecto (ver `hidrogel-mcp/README.md`)
- [ ] Analytics de micas: exigir tipo (9D/9H/Privacidad) al agregar; sin tipo no aparece en la lista ni en ranking/dona/tendencia
- [ ] Analytics de micas: aplicar `aliases.csv` al leer en el visor (hoy solo se aplica al guardar y no corrige registros viejos)
- [ ] Analytics de micas: avisar si falla `registrarCompraMica` (hoy solo `console.error`)

---

## Completado

- [x] Pestaña Hidrogel (`analytics/#hidrogel`) + conector de Claude `hidrogel-mcp`: cotizaciones a Firestore y mensaje de pedido para KASR
- [x] `hidrogel-mcp` desplegado en la VM de Oracle: `https://hidrogel.alejandrogmota.com/mcp/<token>` (Docker + nginx + certbot)
- [x] Analytics de micas — implementado (`analytics/index.html` + `analytics/analytics.js`)
- [x] Exportar lista como PDF (`window.print()` + `@media print`)
- [x] Feedback de error en Firestore (toast cuando falla `saveProducts`)
- [x] Rediseñar `fundas-lanzadas.html` — migrado a `secondary-styles.css`
- [x] Unificar estilos de catálogos en `secondary-styles.css`
- [x] Paleta unificada `#023265` en todo el repo
- [x] Responsive mejorado en `style.css` y `secondary-styles.css`
- [x] Extraer CSS a `style.css` y JS a `app.js`
- [x] Rediseño UI luxury minimalist (Playfair Display + Inter, cards, glassmorphism)
- [x] Implementar toast notifications (reemplazar `alert`)
- [x] Feedback de error en Firestore
- [x] go.mod en scrapers — desactivado cache, corregido `working-directory`
- [x] Workflow BuyTiti — actualización automática cada lunes (10 workers, 100ms delay)
- [x] Workflow my-shop.mx — actualización manual desde Actions
- [x] Migrar `localStorage` a Firebase Firestore
- [x] Firebase config en GitHub Secret (`FIREBASE_CONFIG`)
- [x] Deploy automático con GitHub Actions
- [x] Scraper BuyTiti (API WooCommerce)
- [x] Scraper my-shop.mx (HTML scraping sobre Odoo)
