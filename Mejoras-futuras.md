# Mejoras Futuras

Lista de mejoras pendientes y deuda técnica del proyecto.

---

## Pendientes

- [ ] Extraer el CSS inline de `index.html` a un archivo separado
- [ ] Modularizar el JavaScript en funciones bien definidas
- [x] Implementar notificaciones de usuario accesibles (reemplazar `alert`)
- [ ] Agregar función para actualizar el catálogo de BuyTiti desde la interfaz principal (el sitio está en GitHub Pages con Firestore como base de datos)

## Completado

- [x] Migrar persistencia de `localStorage` a Firebase Firestore para sincronización entre dispositivos
- [x] Mover la configuración de Firebase a un GitHub Secret (`FIREBASE_CONFIG`) para no exponerla en el repositorio
- [x] Crear workflow de GitHub Actions que inyecta el secret durante el deploy a GitHub Pages
- [x] Agregar scraper de BuyTiti (API WooCommerce) con visor de catálogo
- [x] Agregar scraper de my-shop.mx (HTML scraping sobre Odoo)
