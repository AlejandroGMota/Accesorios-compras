# Mejoras Futuras

Lista de mejoras pendientes y deuda técnica del proyecto.

---

## Pendientes

- [x] Extraer el CSS inline de `index.html` a `style.css`
- [x] Modularizar el JavaScript en `app.js` con funciones bien definidas
- [x] Mejorar la estética general (diseño moderno, Inter font, pill selectors, cards)

## Completado

- [x] Implementar notificaciones de usuario accesibles (reemplazar `alert`)
- [x] Agregar workflow para actualizar el catálogo de BuyTiti automáticamente cada lunes (también ejecutable manualmente desde Actions)
- [x] Migrar persistencia de `localStorage` a Firebase Firestore para sincronización entre dispositivos
- [x] Mover la configuración de Firebase a un GitHub Secret (`FIREBASE_CONFIG`) para no exponerla en el repositorio
- [x] Crear workflow de GitHub Actions que inyecta el secret durante el deploy a GitHub Pages
- [x] Agregar scraper de BuyTiti (API WooCommerce) con visor de catálogo
- [x] Agregar scraper de my-shop.mx (HTML scraping sobre Odoo)
