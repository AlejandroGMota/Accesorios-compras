# Lista de Accesorios

> Sistema de gestión de inventario y lista de compras para accesorios de celulares

[![Deployment](https://img.shields.io/badge/deployed-accesories.alejandrogmota.com-blue)](https://accesories.alejandrogmota.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 📋 Descripción

Sistema web para gestionar inventario y listas de compras de accesorios para dispositivos móviles. Permite agregar productos con propiedades específicas, calcular totales por categoría y mantener la persistencia de datos mediante localStorage.

**URL del proyecto:** [accesories.alejandrogmota.com](https://accesories.alejandrogmota.com)

## Características

- ✅ Gestión de productos por categorías
- ✅ Propiedades personalizables según tipo de producto
- ✅ Cálculo automático de subtotales y total general
- ✅ Sincronización en tiempo real con Firebase Firestore
- ✅ Interfaz responsive y amigable
- ✅ Eliminación de productos con recálculo automático
- ✅ Sin dependencias externas (Vanilla JavaScript)
- ✅ Deploy automático vía GitHub Actions con secrets seguros

## Tecnologías Utilizadas

- **HTML5** - Estructura semántica
- **CSS3** - Diseño responsive con Flexbox
- **JavaScript (Vanilla)** - Lógica de aplicación
- **Firebase Firestore** - Persistencia y sincronización en tiempo real
- **GitHub Actions** - CI/CD para deploy automático a GitHub Pages

### Sin frameworks ni librerías externas

El proyecto está desarrollado completamente con tecnologías web fundamentales:
- No requiere Node.js ni npm
- No utiliza React, Vue o Angular
- No utiliza Bootstrap o Tailwind CSS
- El proceso de build lo maneja GitHub Actions

## Estructura del Proyecto

```
Accesorios-compras/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Pipeline de CI/CD para GitHub Pages
├── catalogo-buytiti/           # Catálogo scrapeado de BuyTiti
├── catalogo-myshop/            # Catálogo scrapeado de my-shop.mx
├── index.html                  # Aplicación principal
├── fundas-lanzadas.html        # Vista de fundas lanzadas
├── CNAME                       # Dominio personalizado de GitHub Pages
└── README.md                   # Este archivo
```

## Categorías de Productos

### 1. **Micas**
Opciones disponibles:
- 9D
- 9H
- Privacidad
- Hidrogel

### 2. **Hidrogel**
Opciones disponibles:
- Matte
- Privacidad
- HD
- Blueray

### 3. **Fundas**
Opciones disponibles:
- **Colores:** Rojo, Azul, Menta, Lila, Negro, Rosa
- **Tipos:** Magsafe, Transparente, 3 piezas, Diseño, Uso rudo

### 4. **Fundas Nuevas**
Prioridades:
- Muy nuevo
- Difícil de vender
- Urgente

### 5. **1 Hora**
Accesorios rápidos:
- Audífonos BT
- Cables 50cm
- Cargador Completo
- Cables 2M

### 6. **Refacciones**
Productos de refacción general

### 7. **Otros**
Categoría miscelánea

## Instalación y Uso

### Opción 1: Abrir directamente
```bash
# Clonar el repositorio
git clone [URL_DEL_REPOSITORIO]

# Navegar al directorio
cd Accesorios-compras

# Abrir en navegador
open index.html
# o simplemente hacer doble clic en index.html
```

### Opción 2: Servidor local
```bash
# Con Python 3
python -m http.server 8000

# Con Node.js (si tienes http-server instalado)
npx http-server

# Luego visitar: http://localhost:8000
```

### Opción 3: Visitar la versión en línea
Acceder directamente a: [accesories.alejandrogmota.com](https://accesories.alejandrogmota.com)

## 📖 Guía de Uso

### Agregar un Producto

1. Seleccionar la **categoría** del producto
2. Ingresar el **nombre** del producto
3. Especificar el **precio** (en pesos)
4. Indicar la **cantidad**
5. Seleccionar opciones específicas según la categoría:
   - Para Micas: tipo (9D, 9H, etc.)
   - Para Fundas: colores y tipos
   - Para Hidrogel: tipo de protector
6. Hacer clic en **"Añadir producto"**

### Eliminar un Producto

- Hacer clic en el botón **"Eliminar"** (rojo) junto al producto
- Los totales se recalculan automáticamente

### Visualizar Totales

- **Subtotales** por categoría se muestran en verde
- **Total General** se muestra al final en azul

## Almacenamiento de Datos

Los datos se sincronizan en tiempo real con **Firebase Firestore**, lo que permite acceder a la lista desde cualquier dispositivo.

```javascript
// Estructura de un documento en Firestore
{
  "name": "Mica 9D iPhone 13",
  "price": 150,
  "quantity": 2,
  "category": "Micas",
  "type": "9D"
}
```

**Nota:** La configuración de Firebase nunca se almacena en el repositorio; se inyecta durante el deploy a través de GitHub Secrets.

## Diseño y Estilos

### Paleta de Colores

- **Primario:** #0056b3 (Azul)
- **Secundario:** #003366 (Azul oscuro)
- **Subtotales:** #27ae60 (Verde)
- **Eliminar:** #ff6666 (Rojo)
- **Fondo:** #f5f5f5 (Gris claro)

### Características Responsivas

- Tipografía fluida con `clamp()`:
  ```css
  font-size: clamp(0.9em, 2.5vw, 1.1em);
  ```
- Layout flexible con Flexbox
- Sombras suaves para profundidad
- Transiciones de 0.3s para interactividad

## 🔧 Funcionalidades Técnicas

### Persistencia
```javascript
// Guardar productos
localStorage.setItem('products', JSON.stringify(products));

// Cargar productos al iniciar
const savedProducts = JSON.parse(localStorage.getItem('products')) || [];
```

### Cálculo de Totales
```javascript
function updateTotalPrice() {
    const total = savedProducts.reduce(
        (sum, product) => sum + product.price * product.quantity,
        0
    );
    // Actualizar DOM
}
```

### Validación Dinámica
- Las opciones cambian según la categoría seleccionada
- Validación de campos numéricos
- Prevención de valores negativos

## Historial de Versiones

Basado en los commits del repositorio:

- **cd42f04** - Update index.html
- **f4944e3** - Create index.html
- **4bcd171** - Create CNAME
- **68a18ea** - Feat: hidrogel screen protector list
- **0696adf** - First commit

### Ramas
- `main` - Rama principal (producción)
- `dev` - Rama de desarrollo (actual)

## Deployment

El proyecto tiene dos workflows de GitHub Actions:

### Deploy del sitio (`deploy.yml`)

Se dispara en cada push a `main`:

1. Inyecta la configuración de Firebase desde los secrets del repositorio
2. Publica el sitio en GitHub Pages

**Dominio:** [accesories.alejandrogmota.com](https://accesories.alejandrogmota.com)

### Actualización del catálogo BuyTiti (`update-catalogo-buytiti.yml`)

Corre el scraper de Go y hace commit del `productos.json` actualizado. Se ejecuta:

- **Automáticamente** cada lunes a las 6am UTC
- **Manualmente** desde Actions → Actualizar catálogo BuyTiti → Run workflow

### Secrets requeridos en GitHub Actions

El pipeline necesita el siguiente secret configurado en **Settings → Secrets and variables → Actions**:

| Secret | Descripción |
|--------|-------------|
| `FIREBASE_CONFIG` | Objeto JSON con la configuración del proyecto de Firebase |

**Estructura del valor:**

```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "tu-proyecto.firebaseapp.com",
  "projectId": "tu-proyecto",
  "storageBucket": "tu-proyecto.firebasestorage.app",
  "messagingSenderId": "000000000000",
  "appId": "1:000000000000:web:abc123"
}
```

Puedes obtener este objeto desde la consola de Firebase en **Configuración del proyecto → Tus apps → SDK setup and configuration**.

> Asegúrate de cambiar la fuente de Pages a **GitHub Actions** en Settings → Pages.

## Contribuciones

Las contribuciones son bienvenidas. Para cambios importantes:

1. Fork del proyecto
2. Crear una rama (`git checkout -b feature/NuevaCaracteristica`)
3. Commit de cambios (`git commit -m 'Agregar nueva característica'`)
4. Push a la rama (`git push origin feature/NuevaCaracteristica`)
5. Abrir un Pull Request

## Notas Técnicas

### Compatibilidad
- Navegadores modernos (Chrome, Firefox, Safari, Edge)
- Requiere soporte para localStorage
- Requiere JavaScript habilitado

### Limitaciones
- Requiere conexión a internet para sincronizar con Firestore
- La configuración de Firebase debe estar correctamente seteada en los secrets del repo para que el deploy funcione

## Solución de Problemas

### Los datos no se guardan
- Verificar que JavaScript esté habilitado
- Comprobar conexión a internet (Firestore la requiere)
- Revisar la consola del navegador por errores de autenticación de Firebase

### La página no carga correctamente
- Limpiar caché del navegador
- Verificar la consola del navegador (F12) para errores
- Asegurar conexión a internet (para fuentes externas si las hay)

## Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.

## Autor

Alejandro G. Mota

- Sitio web: [alejandrogmota.com](https://alejandrogmota.com)
- Proyecto: [accesories.alejandrogmota.com](https://accesories.alejandrogmota.com)

---

**Última actualización:** 2024

Si este proyecto te fue útil, considera darle una estrella en GitHub




                                                                                                                                          catalogos mayoristas          

  ┌────────────┬────────────────────────────┬─────────────────────────────┐
  │            │          BuyTiti           │         my-shop.mx          │
  ├────────────┼────────────────────────────┼─────────────────────────────┤
  │ API        │ JSON REST (WooCommerce)    │ HTML scraping (Odoo)        │
  ├────────────┼────────────────────────────┼─────────────────────────────┤
  │ Categorías │ Dinámicas desde API        │ Dinámicas desde sidebar     │
  ├────────────┼────────────────────────────┼─────────────────────────────┤
  │ Estrategia │ 1 fase (API por categoría) │ 2 fases (listing → detalle) │
  ├────────────┼────────────────────────────┼─────────────────────────────┤
  │ Dedup      │ Por link en collect        │ Por link en collect         │
  └────────────┴────────────────────────────┴─────────────────────────