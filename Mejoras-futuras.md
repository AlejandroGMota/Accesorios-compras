# Mejoras Futuras

---

## Pendientes

### Funcional

- [x] **Feedback de error en Firestore** — toast de error cuando falla `saveProducts` (sin conexión, permisos, etc.)

- [ ] **Exportar lista como PDF** — botón en la vista principal que genere un PDF con la lista de productos agrupados por categoría y totales. Usar `window.print()` con estilos `@media print` o librería ligera como `jsPDF`.

- [ ] **go.mod en los scrapers** — agregar `go.mod` a `catalogo-buytiti/scraper/` y `catalogo-myshop/scraper/` para que GitHub Actions pueda cachear el módulo y reducir el tiempo de compilación.

### UX / Estética

- [ ] **Unificar estilos de catálogos** — `catalogo-buytiti/index.html` y `catalogo-myshop/index.html` tienen CSS inline propio. Migrarlos a un `style.css` compartido o al `style.css` global del proyecto.

- [ ] **Rediseñar `fundas-lanzadas.html`** — aún tiene CSS inline y estructura antigua. Migrar al diseño del `style.css` actual.

---

### Analytics de Micas — Planificación detallada

**Concepto:** Cada vez que se agrega una mica a la lista de compras se considera una compra. Registrar ese evento de forma independiente en Firestore para análisis a largo plazo. En una segunda etapa, hacer lo mismo con fundas (no prioritario aún).

#### Estructura de datos en Firestore

Colección separada de los productos para no contaminar el documento principal:

```
analytics/
  micas_compras/          ← colección
    {auto-id}/            ← documento por cada compra registrada
      nombre: string      ← nombre del producto (ej. "iPhone 15 Pro")
      tipo: string        ← "9D" | "9H" | "Privacidad"
      precio: number      ← precio unitario al momento de la compra
      cantidad: number    ← unidades compradas
      fecha: timestamp    ← Firestore server timestamp (no fecha del cliente)
```

> Usar `serverTimestamp()` de Firestore, nunca `new Date()` del cliente, para consistencia entre dispositivos y zonas horarias.

#### Cuándo registrar

- Al ejecutar `addProductBtn` y la categoría es `Micas`, antes o después de guardar en el documento principal, escribir un documento nuevo en `analytics/micas_compras`.
- **No modificar ni eliminar** registros de analytics al borrar un producto de la lista principal — la lista es temporal, el historial es permanente.

#### Visor de micas más vendidas

- Nuevo archivo: `micas-analytics.html`
- Accesible desde un link en `index.html`
- Leer toda la colección `analytics/micas_compras` y agrupar/ordenar en el cliente

**Vistas planeadas:**
1. **Ranking por modelo** — qué nombres de mica se compran más (suma de `cantidad`)
2. **Ranking por tipo** — 9D vs 9H vs Privacidad
3. **Total invertido** — suma de `precio × cantidad` por tipo y general
4. **Historial reciente** — últimas N compras ordenadas por fecha

**Implementación sugerida:**
- Vanilla JS, sin librerías
- Una sola lectura de la colección al cargar (`getDocs`)
- Agrupar y ordenar en memoria en el cliente
- Mismos estilos que `style.css`

#### Reglas de Firestore a agregar

```
match /analytics/{doc}/{compra=**} {
  allow read: if true;
  allow write: if true;   // ajustar si se agrega auth en el futuro
}
```

---

## Completado

- [x] Extraer el CSS inline de `index.html` a `style.css`
- [x] Modularizar el JavaScript en `app.js` con funciones bien definidas
- [x] Mejorar la estética general (diseño moderno, Inter font, pill selectors, cards)
- [x] Implementar notificaciones de usuario accesibles (reemplazar `alert` con toast)
- [x] Agregar workflow para actualizar el catálogo de BuyTiti automáticamente cada lunes
- [x] Agregar workflow manual para actualizar el catálogo de my-shop.mx
- [x] Migrar persistencia de `localStorage` a Firebase Firestore para sincronización entre dispositivos
- [x] Mover la configuración de Firebase a un GitHub Secret (`FIREBASE_CONFIG`)
- [x] Crear workflow de GitHub Actions que inyecta el secret durante el deploy
- [x] Agregar scraper de BuyTiti (API WooCommerce) con visor de catálogo
- [x] Agregar scraper de my-shop.mx (HTML scraping sobre Odoo)
