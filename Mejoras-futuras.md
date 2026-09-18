# Mejoras Futuras

---

## Pendientes

- [ ] Analytics de Fundas (tab bloqueado en `analytics/index.html`)
- [ ] Agregar el conector `hidrogel-mcp` en claude.ai y sus instrucciones en el proyecto (ver `hidrogel-mcp/README.md`)
- [ ] Analytics de micas: corregir un producto (borrarlo y volver a agregarlo) lo registra dos veces en `micas_compras`
- [ ] Analytics de micas: revisar en Firestore los registros de `a07` 9D (28 cajas = 280 pzs; ¿se capturaron piezas en vez de cajas?)

---

## Completado

- [x] Analytics de micas: 9D/9H por caja de 10 pzs y Privacidad por pieza (totales, ranking, dona, tendencia y proyección)
- [x] Analytics de micas: normalizar nombres al leer (aliases + convención iPhone/Samsung/OPPO) y ranking ordenado de mayor a menor
- [x] Analytics de micas: exigir tipo y un modelo por renglón al agregar; avisar si falla `registrarCompraMica`; mostrar micas sin tipo en la lista
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
