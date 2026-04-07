# Plan técnico: Sistema de Analytics de Micas

**Proyecto:** Accesorios-compras  
**Fecha del plan:** 2026-04-07  
**Stack:** Sitio estático en GitHub Pages · Firebase Firestore · Vanilla JS · Chart.js (CDN)

---

## Índice

1. [Estructura de archivos](#1-estructura-de-archivos)
2. [Estructura de Firestore](#2-estructura-de-firestore)
3. [Formato del CSV de aliases](#3-formato-del-csv-de-aliases)
4. [Modificación a app.js](#4-modificación-a-appjs)
5. [Vistas del visor](#5-vistas-del-visor-indexhtml-en-analytics)
6. [Cómo cargar datos](#6-cómo-cargar-datos)
7. [Reglas de Firestore](#7-reglas-de-firestore)
8. [Integración con index.html principal](#8-integración-con-indexhtml-principal)
9. [Deploy](#9-deploy)

---

## 1. Estructura de archivos

```
analytics/
  index.html     ← visor principal (tabs, gráficas, tabla de ranking)
  analytics.js   ← lógica de visualización, proyecciones y carga de datos
  aliases.csv    ← diccionario de normalización de modelos
  PLAN.md        ← este archivo
```

La carpeta `analytics/` vive en la raíz del repositorio, al mismo nivel que `catalogo-buytiti/` y `catalogo-myshop/`. No requiere servidor ni build step; todos los archivos son servidos directamente por GitHub Pages.

---

## 2. Estructura de Firestore

### Colección: `micas_compras`

Cada documento representa **una compra registrada** (una fila del formulario de app.js cuando la categoría es "Micas"). Los documentos se generan con ID automático (`addDoc`).

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | `string` | Nombre normalizado usando aliases.csv (ej. `"iPhone 15 Pro"`) |
| `nombre_original` | `string` | Texto exacto que escribió el usuario (ej. `"ip15pro"`) |
| `tipo` | `string` | `"9D"` \| `"9H"` \| `"Privacidad"` |
| `precio` | `number` | Precio unitario en pesos |
| `cantidad` | `number` | Unidades compradas |
| `fecha` | `Timestamp` | `serverTimestamp()` — hora UTC del servidor |
| `mes` | `number` | Mes como entero 1–12 (extraído en cliente antes de escribir) |
| `año` | `number` | Año de 4 dígitos (extraído en cliente antes de escribir) |

**Ejemplo de documento:**

```json
{
  "nombre": "iPhone 15 Pro",
  "nombre_original": "ip15pro",
  "tipo": "9D",
  "precio": 60,
  "cantidad": 3,
  "fecha": "2026-04-07T15:32:00Z",
  "mes": 4,
  "año": 2026
}
```

### Por qué guardar `mes` y `año` como campos separados

Firestore no indexa subcampos de un `Timestamp` automáticamente. Para filtrar por mes o año con `where()` necesitarías un índice compuesto sobre `fecha` + otro campo, lo que requiere configuración manual en la consola de Firebase y genera lecturas más caras.

Al guardar `mes` y `año` como números planos:

- `getDocs(query(collection(db, 'micas_compras'), where('año', '==', 2026), where('mes', '==', 4)))` funciona con índices simples que Firestore crea automáticamente.
- Permite queries baratos sin índices compuestos para los filtros más frecuentes (por mes, por año).
- El costo en escritura es trivial (2 campos extra por documento).

En la implementación actual se hace una sola lectura completa al cargar el visor, así que los campos `mes` y `año` sirven también para filtrar **en memoria** sin queries adicionales, lo que es igualmente eficiente.

---

## 3. Formato del CSV de aliases

### Archivo: `analytics/aliases.csv`

```csv
alias,nombre_normalizado
iphone 15 pro,iPhone 15 Pro
ip15pro,iPhone 15 Pro
ip 15 pro,iPhone 15 Pro
iphone15pro,iPhone 15 Pro
15 pro,iPhone 15 Pro
iphone 15,iPhone 15
ip15,iPhone 15
iphone 14 pro,iPhone 14 Pro
ip14pro,iPhone 14 Pro
s24,Samsung Galaxy S24
galaxy s24,Samsung Galaxy S24
samsung s24,Samsung Galaxy S24
s24 ultra,Samsung Galaxy S24 Ultra
galaxy s24 ultra,Samsung Galaxy S24 Ultra
a55,Samsung Galaxy A55
moto g,Motorola Moto G
redmi note 13,Xiaomi Redmi Note 13
```

**Reglas del CSV:**

- Columnas exactas: `alias` y `nombre_normalizado` (primera fila = encabezado, se descarta).
- Los `alias` van en minúsculas sin acentos para facilitar la comparación.
- `nombre_normalizado` es el nombre canónico que se escribe en Firestore.
- Un mismo `nombre_normalizado` puede tener múltiples filas de alias.
- Para agregar un modelo nuevo basta con añadir filas al CSV; no se toca código.

### Cómo se carga (en `analytics.js` y en `app.js`)

```js
// Cache en memoria para no hacer fetch múltiples veces
let _aliasMap = null;

async function cargarAliases() {
  if (_aliasMap) return _aliasMap;

  const resp = await fetch('../analytics/aliases.csv');   // desde app.js en raíz
  // desde analytics/analytics.js usar: fetch('./aliases.csv')
  const text = await resp.text();

  _aliasMap = new Map();
  const lineas = text.trim().split('\n').slice(1); // omitir encabezado
  for (const linea of lineas) {
    const [alias, nombre] = linea.split(',').map(s => s.trim());
    if (alias && nombre) _aliasMap.set(alias.toLowerCase(), nombre);
  }
  return _aliasMap;
}
```

### Cómo se usa para normalizar

```js
function normalizarNombre(nombreOriginal, aliasMap) {
  const clave = nombreOriginal.trim().toLowerCase();
  return aliasMap.get(clave) ?? nombreOriginal.trim();
  // Si no hay alias, se guarda el nombre tal como está (capitalizado por el usuario)
}
```

---

## 4. Modificación a app.js

### Función a agregar: `registrarCompraMica(product)`

Esta función se llama **solo** cuando `category === 'Micas'`, dentro del handler del botón `addProductBtn`, **después** de que `saveProducts()` haya tenido éxito. Es fire-and-forget: no bloquea el flujo principal.

```js
// ========== Analytics: registro de compra de mica ==========

let _aliasMap = null;

async function cargarAliases() {
  if (_aliasMap) return _aliasMap;
  try {
    const resp = await fetch('./analytics/aliases.csv');
    const text = await resp.text();
    _aliasMap = new Map();
    text.trim().split('\n').slice(1).forEach(linea => {
      const [alias, nombre] = linea.split(',').map(s => s.trim());
      if (alias && nombre) _aliasMap.set(alias.toLowerCase(), nombre);
    });
  } catch (e) {
    console.warn('aliases.csv no disponible, se usará nombre original:', e);
    _aliasMap = new Map(); // mapa vacío = pasar el nombre sin normalizar
  }
  return _aliasMap;
}

async function registrarCompraMica(product) {
  try {
    const aliasMap  = await cargarAliases();
    const nombre    = normalizarNombre(product.name, aliasMap);
    const ahora     = new Date();

    await db.collection('micas_compras').add({
      nombre,
      nombre_original: product.name,
      tipo:            product.type,        // "9D" | "9H" | "Privacidad"
      precio:          product.price,
      cantidad:        product.quantity,
      fecha:           firebase.firestore.FieldValue.serverTimestamp(),
      mes:             ahora.getMonth() + 1, // getMonth() es 0-based
      año:             ahora.getFullYear(),
    });
  } catch (err) {
    // No mostrar toast al usuario; analytics es secundario al flujo principal
    console.error('Error registrando analytics de mica:', err);
  }
}

function normalizarNombre(nombreOriginal, aliasMap) {
  const clave = nombreOriginal.trim().toLowerCase();
  return aliasMap.get(clave) ?? nombreOriginal.trim();
}
```

### Dónde insertar la llamada en el handler existente

Localizar este bloque en `app.js` (líneas ~205-207 actuales):

```js
currentProducts.push(product);
await saveProducts(currentProducts);
showToast('Producto agregado', 'success');
```

Modificarlo a:

```js
currentProducts.push(product);
await saveProducts(currentProducts);
showToast('Producto agregado', 'success');

// Fire and forget: no await, no bloquea el flujo
if (category === 'Micas') {
  registrarCompraMica(product).catch(() => {});
}
```

**Notas importantes:**

- El `.catch(() => {})` al final del call site es redundante con el try/catch interno, pero hace explícita la intención fire-and-forget y suprime warnings de promesas no capturadas en algunos entornos.
- `registrarCompraMica` no debe usar `await` en el call site para que el formulario responda inmediatamente.
- La función `normalizarNombre` es pura y puede ser reutilizada en `analytics.js` para normalizar datos ya guardados con nombre_original inconsistente.

---

## 5. Vistas del visor (`analytics/index.html`)

### Estructura general del HTML

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics · Accesorios</title>
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../secondary-styles.css">
  <!-- Chart.js vía jsDelivr (funciona en estático sin build) -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
</head>
<body>
  <header>
    <div>
      <h1>Analytics</h1>
      <p class="header-subtitle">Historial de compras de micas</p>
    </div>
    <nav>
      <a href="../index.html">← Volver</a>
    </nav>
  </header>

  <div class="container">

    <!-- Tabs de categoría (solo Micas activo en v1) -->
    <div class="tab-bar">
      <button class="tab active">Micas</button>
      <button class="tab locked" disabled title="Próximamente">Fundas 🔒</button>
      <button class="tab locked" disabled title="Próximamente">Hidrogel 🔒</button>
    </div>

    <!-- Vista A: Dashboard resumen -->
    <section id="vista-dashboard" class="card">
      <h2>Resumen</h2>
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">Micas vendidas</span>
          <span class="stat-value" id="stat-total">—</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total invertido</span>
          <span class="stat-value" id="stat-invertido">—</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Modelo más vendido</span>
          <span class="stat-value" id="stat-modelo">—</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Tipo más vendido</span>
          <span class="stat-value" id="stat-tipo">—</span>
        </div>
      </div>
    </section>

    <!-- Vista B: Ranking por modelo -->
    <section id="vista-ranking" class="card">
      <h2>Ranking por modelo</h2>
      <div class="table-wrapper">
        <table id="tabla-ranking">
          <thead>
            <tr>
              <th data-col="nombre">Modelo</th>
              <th data-col="9D">9D</th>
              <th data-col="9H">9H</th>
              <th data-col="Privacidad">Privacidad</th>
              <th data-col="total">Total</th>
              <th data-col="pct">% del total</th>
            </tr>
          </thead>
          <tbody id="tbody-ranking"></tbody>
        </table>
      </div>
    </section>

    <!-- Vista C: Donut por tipo -->
    <section id="vista-donut" class="card">
      <h2>Distribución por tipo</h2>
      <div class="chart-container">
        <canvas id="chart-donut"></canvas>
      </div>
    </section>

    <!-- Vista D: Tendencia mensual -->
    <section id="vista-tendencia" class="card">
      <h2>Tendencia mensual</h2>
      <p class="chart-note">Una línea por tipo. Con pocos meses de datos, la línea mostrará los puntos disponibles sin interpolación artificial.</p>
      <div class="chart-container">
        <canvas id="chart-lineas"></canvas>
      </div>
    </section>

    <!-- Vista E: Proyecciones -->
    <section id="vista-proyecciones" class="card">
      <h2>Proyección del próximo mes</h2>
      <div id="proyecciones-contenido"></div>
    </section>

  </div>

  <!-- Firebase (mismo patrón que index.html: placeholder reemplazado en deploy) -->
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
  <script>
    firebase.initializeApp(%%FIREBASE_CONFIG%%);
    const db = firebase.firestore();
  </script>
  <script src="./analytics.js"></script>
</body>
</html>
```

### Vista A: Dashboard resumen

Métricas calculadas en `analytics.js` tras cargar todos los documentos:

| Métrica | Cálculo |
|---|---|
| Total de micas vendidas | `sum(doc.cantidad)` sobre todos los documentos |
| Total invertido | `sum(doc.precio * doc.cantidad)` |
| Modelo más vendido | `nombre` con mayor `sum(cantidad)` al agrupar por nombre |
| Tipo más vendido | `tipo` con mayor `sum(cantidad)` al agrupar por tipo |

### Vista B: Ranking por modelo

Tabla ordenable (clic en encabezado de columna alterna asc/desc). Columnas:

```
Modelo | 9D | 9H | Privacidad | Total | % del total
```

El porcentaje es `(total_modelo / total_global) * 100`, redondeado a 1 decimal.

La tabla se genera dinámicamente en `analytics.js` escribiendo `<tr>` al `tbody-ranking`. El ordenamiento se maneja con un comparador sobre el array en memoria; no se rehacen queries a Firestore.

### Vista C: Gráfica de dona (Chart.js)

```js
new Chart(document.getElementById('chart-donut'), {
  type: 'doughnut',
  data: {
    labels: ['9D', '9H', 'Privacidad'],
    datasets: [{
      data: [total9D, total9H, totalPrivacidad],
      backgroundColor: ['#6c63ff', '#48bfe3', '#f4a261'],
      borderWidth: 0,
    }]
  },
  options: {
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.raw} uds`
        }
      }
    }
  }
});
```

### Vista D: Gráfica de líneas — Tendencia mensual (Chart.js)

El eje X son los meses con datos (no todos los 12 meses). Si solo hay 1 o 2 meses, la línea muestra esos puntos sin intentar rellenar meses vacíos.

```js
// mesesConDatos: array de strings ["2026-04", "2026-05", ...]
// serie9D, serie9H, seriePrivacidad: arrays paralelos de cantidades por mes

new Chart(document.getElementById('chart-lineas'), {
  type: 'line',
  data: {
    labels: mesesConDatos,
    datasets: [
      {
        label: '9D',
        data: serie9D,
        borderColor: '#6c63ff',
        backgroundColor: 'rgba(108,99,255,0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: '9H',
        data: serie9H,
        borderColor: '#48bfe3',
        backgroundColor: 'rgba(72,191,227,0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Privacidad',
        data: seriePrivacidad,
        borderColor: '#f4a261',
        backgroundColor: 'rgba(244,162,97,0.1)',
        tension: 0.3,
        fill: true,
      },
    ]
  },
  options: {
    spanGaps: false,  // no interpolar meses sin datos
    plugins: { legend: { position: 'top' } },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1 } }
    }
  }
});
```

**Diseño con pocos datos:** Al usar `spanGaps: false` y construir el eje X solo con los meses que tienen al menos un documento, la gráfica se ve limpia incluso con 1 o 2 puntos. No se muestran meses futuros vacíos.

### Vista E: Proyecciones del próximo mes

**Algoritmo paso a paso:**

1. Obtener los meses distintos ordenados cronológicamente que hay en la colección.
2. Si hay **menos de 2 meses** de datos:
   - Mostrar: `"Acumulando datos... Las proyecciones estarán disponibles cuando haya al menos 2 meses de historial."`
3. Si hay **2 o más meses**:
   - Tomar los últimos 2 meses.
   - Para cada par `(modelo, tipo)`, calcular el promedio de `cantidad` en esos 2 meses.
   - Si el mes proyectado es **diciembre** (`mes === 12`): multiplicar la proyección por `1.3`.
   - Ordenar las recomendaciones por proyección descendente.
   - Mostrar las 5 principales como: `"Comprar ~X unidades de [Modelo] tipo [Tipo]"`.

```js
function calcularProyecciones(docs) {
  const meses = [...new Set(docs.map(d => `${d.año}-${String(d.mes).padStart(2,'0')}`))]
    .sort();

  if (meses.length < 2) {
    return null; // señal para mostrar mensaje de "acumulando datos"
  }

  const ultimosDos = meses.slice(-2);
  const esDiciembre = (new Date().getMonth() + 2) % 12 === 0; // mes siguiente
  const factorEstacional = esDiciembre ? 1.3 : 1.0;

  // Agrupar por (nombre, tipo) filtrando solo los últimos 2 meses
  const agrupado = {};
  for (const doc of docs) {
    const claveMes = `${doc.año}-${String(doc.mes).padStart(2,'0')}`;
    if (!ultimosDos.includes(claveMes)) continue;
    const clave = `${doc.nombre}||${doc.tipo}`;
    agrupado[clave] = (agrupado[clave] ?? 0) + doc.cantidad;
  }

  // Promedio (suma de 2 meses / 2) y aplicar factor estacional
  return Object.entries(agrupado)
    .map(([clave, suma]) => {
      const [nombre, tipo] = clave.split('||');
      const proyeccion = Math.ceil((suma / 2) * factorEstacional);
      return { nombre, tipo, proyeccion };
    })
    .sort((a, b) => b.proyeccion - a.proyeccion)
    .slice(0, 5);
}
```

**Renderizado:**

```js
function renderProyecciones(proyecciones) {
  const contenedor = document.getElementById('proyecciones-contenido');
  if (!proyecciones) {
    contenedor.innerHTML = '<p class="muted">Acumulando datos... Las proyecciones estarán disponibles con al menos 2 meses de historial.</p>';
    return;
  }
  contenedor.innerHTML = proyecciones
    .map(p => `<div class="recomendacion">Comprar ~<strong>${p.proyeccion}</strong> uds de <strong>${p.nombre}</strong> tipo <strong>${p.tipo}</strong></div>`)
    .join('');
}
```

---

## 6. Cómo cargar datos

Se usa una **lectura única** al iniciar `analytics.js`. No se usan listeners en tiempo real porque los datos de analytics son históricos y no cambian mientras el usuario ve el visor.

```js
async function cargarDatos() {
  const snap = await db.collection('micas_compras').get();
  const docs = snap.docs.map(d => d.data());
  // docs es un array de objetos planos con todos los campos
  return docs;
}

window.addEventListener('DOMContentLoaded', async () => {
  const docs = await cargarDatos();
  renderDashboard(docs);
  renderRanking(docs);
  renderDonut(docs);
  renderTendencia(docs);
  renderProyecciones(calcularProyecciones(docs));
});
```

**Consideraciones de escala:**

- Con cientos de documentos (escenario realista para un negocio chico), la lectura completa es rápida y el procesamiento en memoria es inmediato.
- Si la colección crece a miles de documentos, se puede añadir un filtro `where('año', '==', añoActual)` para limitar la lectura sin cambiar el resto de la lógica.
- No se usan índices compuestos en esta versión; los campos `mes` y `año` permiten filtrar en cliente sin costo adicional.

---

## 7. Reglas de Firestore

Las reglas de seguridad de Firestore ya están configuradas en el proyecto. No se requiere ninguna acción adicional en este módulo. La colección `micas_compras` hereda las reglas existentes que permiten escritura autenticada y lectura desde el cliente web del proyecto.

Solo documentar que la colección `micas_compras` debe estar **permitida en escritura** para el mismo origen que puede escribir `app/productos`. Si en algún momento las reglas se restringen por colección, agregar:

```
match /micas_compras/{docId} {
  allow read, write: if true; // ajustar según política de autenticación del proyecto
}
```

---

## 8. Integración con index.html principal

Agregar un enlace "Analytics" en el `<header>` de `/index.html`. El header actual es:

```html
<header>
  <div>
    <h1>Lista de Accesorios</h1>
    <p class="header-subtitle">Gestión de inventario y compras</p>
  </div>
</header>
```

Modificar a:

```html
<header>
  <div>
    <h1>Lista de Accesorios</h1>
    <p class="header-subtitle">Gestión de inventario y compras</p>
  </div>
  <nav class="header-nav">
    <a href="analytics/index.html" class="header-link">Analytics</a>
  </nav>
</header>
```

Si `style.css` ya tiene estilos para `.header-nav` y `.header-link` (usados en otros catálogos), reutilizarlos. Si no, agregar mínimo en `style.css`:

```css
.header-nav {
  margin-top: 0.5rem;
}

.header-link {
  color: var(--accent, #6c63ff);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
}

.header-link:hover {
  text-decoration: underline;
}
```

---

## 9. Deploy

El archivo `.github/workflows/deploy.yml` actualiza GitHub Pages en cada push a `main` para los paths listados en el trigger `on.push.paths`. Agregar los paths del módulo de analytics:

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'index.html'
      - 'style.css'
      - 'app.js'
      - 'secondary-styles.css'
      - 'fundas-lanzadas.html'
      - 'catalogo-buytiti/index.html'
      - 'catalogo-buytiti/productos.json'
      - 'catalogo-myshop/index.html'
      - 'catalogo-myshop/productos.json'
      - 'analytics/index.html'       # ← agregar
      - 'analytics/analytics.js'     # ← agregar
      - 'analytics/aliases.csv'      # ← agregar
      - 'CNAME'
```

### Inject Firebase config en analytics/index.html

El paso "Inject Firebase config" del workflow actual solo reemplaza el placeholder en `index.html`. Hay que extenderlo para cubrir también `analytics/index.html`:

```yaml
- name: Inject Firebase config
  env:
    FIREBASE_CONFIG: ${{ secrets.FIREBASE_CONFIG }}
  run: |
    python3 -c "
    import os
    config = os.environ['FIREBASE_CONFIG'].strip()
    targets = ['index.html', 'analytics/index.html']
    for path in targets:
        with open(path, 'r') as f:
            content = f.read()
        content = content.replace('%%FIREBASE_CONFIG%%', config)
        with open(path, 'w') as f:
            f.write(content)
    "
```

El artefacto se sube con `path: .` (directorio raíz completo), por lo que `analytics/` ya queda incluido automáticamente en el upload. Solo es necesario el cambio en paths del trigger y la extensión del paso de inject.

---

## Resumen de orden de implementación

| Paso | Archivo | Acción |
|---|---|---|
| 1 | `analytics/aliases.csv` | Crear con modelos iniciales |
| 2 | `app.js` | Agregar `cargarAliases`, `normalizarNombre`, `registrarCompraMica` y llamada en el handler |
| 3 | `analytics/analytics.js` | Implementar carga de datos, procesamiento y renderizado de vistas |
| 4 | `analytics/index.html` | Crear visor con tabs, secciones y scripts |
| 5 | `index.html` | Agregar link "Analytics" en el header |
| 6 | `style.css` | Agregar estilos faltantes (stat-grid, tab-bar, chart-container, recomendacion) |
| 7 | `.github/workflows/deploy.yml` | Extender paths del trigger y el paso de inject |
| 8 | Firestore console | Verificar que la colección `micas_compras` tiene permisos de escritura |

Los pasos 1 y 2 son independientes entre sí. El paso 3 depende de que la colección tenga al menos un documento para probar; se puede poblar manualmente en la consola de Firestore para desarrollar el visor antes de que haya datos reales.
