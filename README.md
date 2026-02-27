# Lista de Accesorios

> Sistema de gestión de inventario y lista de compras para accesorios de celulares

[![Deployment](https://img.shields.io/badge/deployed-accesories.alejandrogmota.com-blue)](https://accesories.alejandrogmota.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 📋 Descripción

Sistema web para gestionar inventario y listas de compras de accesorios para dispositivos móviles. Permite agregar productos con propiedades específicas, calcular totales por categoría y mantener la persistencia de datos mediante localStorage.

**URL del proyecto:** [accesories.alejandrogmota.com](https://accesories.alejandrogmota.com)

## ✨ Características

- ✅ Gestión de productos por categorías
- ✅ Propiedades personalizables según tipo de producto
- ✅ Cálculo automático de subtotales y total general
- ✅ Persistencia de datos con localStorage
- ✅ Interfaz responsive y amigable
- ✅ Eliminación de productos con recálculo automático
- ✅ Sin dependencias externas (Vanilla JavaScript)

## 🛠️ Tecnologías Utilizadas

- **HTML5** - Estructura semántica
- **CSS3** - Diseño responsive con Flexbox
- **JavaScript (Vanilla)** - Lógica de aplicación
- **localStorage** - Persistencia de datos

### Sin frameworks ni librerías externas

El proyecto está desarrollado completamente con tecnologías web fundamentales:
- No requiere Node.js ni npm
- No utiliza React, Vue o Angular
- No utiliza Bootstrap o Tailwind CSS
- No requiere proceso de build

## 📁 Estructura del Proyecto

```
Accesorios-compras/
├── index.html                  # Aplicación principal (565 líneas)
├── Compras-accesorios.html     # Versión alternativa simplificada
├── CNAME                       # Configuración de dominio personalizado
└── README.md                   # Este archivo
```

## 🎯 Categorías de Productos

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

## 🚀 Instalación y Uso

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

## 💾 Almacenamiento de Datos

Los datos se guardan automáticamente en el navegador usando `localStorage`:

```javascript
// Estructura de datos
{
  "name": "Mica 9D iPhone 13",
  "price": 150,
  "quantity": 2,
  "category": "Micas",
  "type": "9D"
}
```

**Nota:** Los datos persisten incluso al cerrar el navegador, pero se almacenan localmente en cada dispositivo.

## 🎨 Diseño y Estilos

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

## 📊 Historial de Versiones

Basado en los commits del repositorio:

- **cd42f04** - Update index.html
- **f4944e3** - Create index.html
- **4bcd171** - Create CNAME
- **68a18ea** - Feat: hidrogel screen protector list
- **0696adf** - First commit

### Ramas
- `main` - Rama principal (producción)
- `dev` - Rama de desarrollo (actual)

## 🌐 Deployment

El proyecto está configurado para GitHub Pages con un dominio personalizado:

**Dominio:** accesories.alejandrogmota.com

Configuración en archivo `CNAME`:
```
accesories.alejandrogmota.com
```

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Para cambios importantes:

1. Fork del proyecto
2. Crear una rama (`git checkout -b feature/NuevaCaracteristica`)
3. Commit de cambios (`git commit -m 'Agregar nueva característica'`)
4. Push a la rama (`git push origin feature/NuevaCaracteristica`)
5. Abrir un Pull Request

## 📝 Notas Técnicas

### Compatibilidad
- Navegadores modernos (Chrome, Firefox, Safari, Edge)
- Requiere soporte para localStorage
- Requiere JavaScript habilitado

### Limitaciones
- Datos solo en navegador local (no hay backend)
- Sin sincronización entre dispositivos
- Capacidad limitada por localStorage (~5-10MB)

## 🐛 Solución de Problemas

### Los datos no se guardan
- Verificar que JavaScript esté habilitado
- Comprobar que localStorage no esté deshabilitado
- Revisar el modo incógnito (puede deshabilitar localStorage)

### La página no carga correctamente
- Limpiar caché del navegador
- Verificar la consola del navegador (F12) para errores
- Asegurar conexión a internet (para fuentes externas si las hay)

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.

## 👤 Autor

Alejandro G. Mota

- Sitio web: [alejandrogmota.com](https://alejandrogmota.com)
- Proyecto: [accesories.alejandrogmota.com](https://accesories.alejandrogmota.com)

---

**Última actualización:** 2024

⭐ Si este proyecto te fue útil, considera darle una estrella en GitHub




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