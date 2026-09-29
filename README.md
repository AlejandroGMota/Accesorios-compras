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
- **CSS3** - Diseño responsive con variables CSS y Flexbox (`style.css`)
- **JavaScript (Vanilla)** - Lógica modularizada en funciones (`app.js`)
- **Firebase Firestore** - Persistencia y sincronización en tiempo real
- **GitHub Actions** - CI/CD para deploy automático a GitHub Pages
- **Inter** - Tipografía (Google Fonts)

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
│       ├── deploy.yml                    # Deploy a GitHub Pages
│       ├── update-catalogo-buytiti.yml   # Actualización semanal BuyTiti
│       └── update-catalogo-myshop.yml    # Actualización manual my-shop.mx
├── catalogo-buytiti/                     # Catálogo scrapeado de BuyTiti
│   ├── index.html
│   ├── productos.json
│   └── scraper/main.go
├── catalogo-myshop/                      # Catálogo scrapeado de my-shop.mx
│   ├── index.html
│   ├── productos.json
│   └── scraper/main.go
├── analytics/                            # Visor de analytics (Micas · Hidrogel)
│   ├── index.html
│   ├── analytics.js                      # Micas: ranking, tendencia, proyecciones
│   ├── hidrogel.js                       # Hidrogel: pedido a KASR
│   ├── hidrogel-core.js                  # Lógica compartida con hidrogel-mcp
│   └── aliases.csv
├── hidrogel-mcp/                         # Conector de Claude en la VM de Oracle → ver su README
├── index.html                            # Lista del tianguis (la de siempre)
├── app.js                                # Arranque de la lista del tianguis
├── lista-core.js                         # Lógica compartida por las listas
├── local.html / local.js                 # Lista de un local  ·  ?id=<idDelLocal>
├── locales.html / locales.js             # Índice de locales con su liga
├── admin.html / admin.js                 # Crear y editar locales (pide login)
├── global.html / global.js               # Todo junto para comprar (pide login)
├── migrar.html / migrar.js               # Migración de una sola vez, no va en el menú
├── auth.js                               # Candado de admin y de la lista global
├── firestore.rules                       # Reglas de Firestore (hay que pegarlas en la consola)
├── dev.py                                # Genera .local/ con la config real para probar
├── style.css                             # Estilos globales
├── fundas-lanzadas.html                  # Vista de fundas lanzadas
├── CNAME                                 # Dominio personalizado de GitHub Pages
└── README.md                             # Este archivo
```

### Las listas y los locales

Cada punto de venta tiene su propia lista y su propia liga. El **tianguis** es un
local más (`tianguis`), pero conserva la URL de siempre y es el único que muestra
precios y totales.

| Página | Para qué | Pide login |
|---|---|---|
| `/` | Lista del tianguis | No |
| `/local.html?id=<id>` | Lista de un local, sin precios | No |
| `/locales.html` | Índice con la liga de cada local | No |
| `/admin.html` | Crear, renombrar, desactivar y borrar locales | Sí |
| `/global.html` | Todo junto para ir a comprar | Sí |

Los locales se crean en caliente desde el admin, así que no pueden ser carpetas:
harían falta un commit y un deploy por cada uno. Por eso la liga lleva el local
en `?id=`.

En la lista global lo importante es la vista **«junto por producto»**: suma el
mismo modelo de todos los locales, porque no se compran 1 caja del local A y 1
del B, se compran 2 y luego se reparten. La columna *Reparto* dice a quién le
toca cada cuánto. La vista **«separado por local»** es la del regreso.

Palomear un producto en la global lo marca en **todos** los locales que lo
pidieron, para que quien anotó vea que ya viene en camino.

## Categorías de Productos

### 1. **Micas**
Opciones disponibles:
- 9D — por caja de 10 pzs (cantidad y precio son por caja)
- 9H — por caja de 10 pzs (cantidad y precio son por caja)
- Privacidad — por pieza

Cómo capturar el nombre para que Analytics lo agrupe bien:
- Un modelo por renglón (la app rechaza "17, 11, 13, 15").
- iPhone: `13`, `ip 13` e `iphone 13` son lo mismo; `16pm` = `16 pro max`.
- Samsung a secas: `a24`, `s23 fe`. OPPO con prefijo: `oppo a58` u `op a38`.
- Las micas que sirven para varios modelos se agrupan en `analytics/aliases.csv` (ej. `a15`, `a24` y `a34` → "Samsung Galaxy A15/A24/A34"; `a16`, `a17` y `a26` → "Samsung Galaxy A16/A17/A26").

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

Cada producto es **un documento** de la colección `items`:

```javascript
// items/{itemId}
{
  "local":    "tianguis",        // de qué lista es
  "name":     "Mica 9D iPhone 13",
  "price":    150,
  "quantity": 2,
  "category": "Micas",
  "type":     "9D",
  "comprada": null,              // fecha en ms cuando se palomea
  "creado":   1759000000000      // orden dentro de la lista
}
```

```javascript
// locales/{localId}
{ "nombre": "Local Centro", "activo": true, "creado": 1759000000000 }
```

Antes toda la lista vivía como un array dentro de un solo documento
(`app/productos`) que se reescribía entero en cada cambio. Con una sola persona
nunca se notó, pero al palomear desde la lista global mientras alguien anota en
su local, la última escritura borraba la otra sin avisar. Un documento por
producto quita ese problema y de paso hace que los botones de borrar y palomear
apunten al id del documento y no a la posición en el array.

El documento viejo **no se borra**: queda como respaldo.

**Nota:** La configuración de Firebase nunca se almacena en el repositorio; se inyecta durante el deploy a través de GitHub Secrets. Ojo: lo que se inyecta queda visible en el HTML publicado, así que ahí solo puede ir lo que puede ser público — una contraseña nunca.

### Cerrar el acceso a la base con App Check

La `apiKey` de Firebase viaja en el HTML y es pública por diseño: lo que protege los datos son las reglas de Firestore. Con App Check, Firestore solo acepta peticiones que vengan de este sitio, sin que haya que iniciar sesión.

El código ya está puesto (`firebase.appCheck().activate(...)` en `index.html` y `analytics/index.html`) y no hace nada mientras no exista el secret. **El orden importa**: si se publican las reglas antes de los pasos 1 a 5, el sitio y el conector dejan de escribir.

1. **Crear la llave en Google Cloud Console → Seguridad → reCAPTCHA** (el panel clásico `google.com/recaptcha/admin` ya no permite crear llaves nuevas desde 2024; las viejas siguen sirviendo):
   - Tipo **sitio web**, con **puntuación** (dejar sin marcar la casilla de verificación).
   - Dominio: `accesories.alejandrogmota.com`.
   - Copiar el **ID de la llave**, que es la *site key* pública.
2. **Firebase Console → App Check → Apps:** registrar la app web cuyo App ID coincida con el del sitio (`1:341527541112:web:b095…`), proveedor **reCAPTCHA Enterprise**, y pegar ahí el **ID de la llave**. Si no se distingue cuál de las dos apps es, registrar las dos con la misma llave.
3. **GitHub → Settings → Secrets → Actions:** `APPCHECK_SITE_KEY` con el ID de la llave y `APPCHECK_PROVIDER` con el valor `enterprise`. Volver a desplegar.

   Según el tipo de llave que se tenga a la mano, los valores cambian de lugar:

   | Lo que muestra la llave | Proveedor en App Check | Se pega en App Check | `APPCHECK_SITE_KEY` | `APPCHECK_PROVIDER` |
   |---|---|---|---|---|
   | ID de la clave (sin secreta) | reCAPTCHA Enterprise | ID de la clave | ID de la clave | `enterprise` |
   | Clave de sitio + clave secreta | reCAPTCHA (clásico) | Clave **secreta** | Clave **de sitio** | *(sin secret)* |

   Las dos empiezan con `6L…` y se parecen; lo que distingue a la clásica es que trae una clave secreta aparte.
4. **Comprobar** en App Check → Cloud Firestore que aparezcan peticiones *verificadas* al usar el sitio.
5. **Cuenta de servicio para el conector**, que no pasa por App Check:
   - Console → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.
   - En la VM, en `~/hidrogel-mcp/.env`: `FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'` (el JSON completo en una línea).
   - `hidrogel-mcp/deploy.sh` y probar una cotización.
6. **Publicar las reglas** (Firestore → Reglas):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Solo peticiones verificadas por App Check. El conector entra con cuenta de
    // servicio, que no pasa por las reglas.
    match /app/{documento}       { allow read, write: if request.app != null; }
    match /micas_compras/{id}    { allow read, write: if request.app != null; }
    match /hidrogel_ventas/{id}  { allow read, write: if request.app != null; }
    match /hidrogel_pedidos/{id} { allow read, write: if request.app != null; }
  }
}
```

7. **Activar la restricción** en App Check → Cloud Firestore → *Enforce*, una vez que el paso 4 muestre tráfico verificado.

Si algo falla, quitar el secret `APPCHECK_SITE_KEY`, volver a desplegar y regresar las reglas a `if true` deja todo como antes.

**Por qué Enterprise y no reCAPTCHA v3:** desde el tercer trimestre de 2024 Google ya no deja crear llaves clásicas nuevas, y en el primer trimestre de 2026 terminó de migrar las existentes a Google Cloud ([migración de reCAPTCHA](https://docs.cloud.google.com/recaptcha/docs/migration-overview)). El proveedor «reCAPTCHA» del panel de App Check solo sirve para llaves viejas; para una configuración nueva hay que usar Enterprise.

La cuota gratis es de **10,000 evaluaciones al mes**; pasando de ahí hay que habilitar facturación en el proyecto de Cloud. Sin cuenta de facturación, reCAPTCHA entrega 4 niveles de puntuación en vez de 11, suficiente para App Check.

El sitio soporta los dos proveedores: con `APPCHECK_PROVIDER=enterprise` usa Enterprise y sin ese secret usa el reCAPTCHA clásico, por si algún día se reutiliza una llave vieja.

## Puesta en marcha de los locales

Esto se hace **una sola vez** y hay tres pasos que solo se pueden hacer a mano.
Mientras no estén, `items` y `locales` siguen denegadas y las listas no cargan.

### 1· Publicar las reglas de Firestore

Las reglas viven en `firestore.rules`, pero ese archivo **no se publica solo**:
hay que pegarlo en la consola.

1. Firebase → **Firestore Database** → pestaña **Rules**
2. Pegar el contenido de `firestore.rules` y **Publicar**

Conviene hacerlo cuando puedas comprobar en el momento que la lista del tianguis
sigue cargando; si las reglas quedan mal, deja de funcionar.

### 2· Crear el usuario y darle permiso de admin

1. Firebase → **Authentication** → **Sign-in method** → activar **Email/Password**
2. Pestaña **Users** → **Add user** → un correo y una contraseña
3. Copiar el **UID del usuario** que aparece en esa lista
4. Firestore → crear la colección **`admins`** → un documento cuyo **ID sea ese UID**, sin campos

Quién administra se decide por la colección `admins`, no por el correo: basta
con que exista `admins/<uid>`. Así el repo, que es público, no lleva ningún
dato personal, y dar o quitar permiso no obliga a volver a publicar las reglas.

Si la llave de API tiene restricción por dominio (hoy la tiene), el login solo
funciona desde `accesories.alejandrogmota.com`. Para probarlo en `localhost` hay
que agregarlo en Google Cloud Console → Credentials → la llave → HTTP referrers.

### 3· Migrar los datos que ya existen

Abrir **`/migrar.html`** (no está en el menú, es de un solo uso):

1. **Revisar sin tocar nada** — dice cuántos productos y cuántos registros de
   Analytics se van a mover
2. **Migrar** — pasa `app/productos.items[]` a la colección `items` con
   `local: tianguis`, crea el local «Tianguis» y marca como `tianguis` los
   registros viejos de `micas_compras`

El documento viejo `app/productos` **no se borra**: queda como respaldo, y la
migración deja una bandera para no poder correrse dos veces.

### Qué protege el login y qué no

El login solo cierra **crear y editar locales**; eso lo imponen las reglas. Las
listas se escriben sin cuenta, porque la gente de cada local anota sin
credenciales, así que `items` está abierto: el login de `global.html` esconde la
pantalla, no los datos. Para cerrarlos de verdad hace falta **App Check**
(sección de arriba) o pedir sesión también en las listas de local.

## Probar en local

```bash
python3 dev.py          # genera .local/ y levanta http://localhost:8000
python3 dev.py --build  # solo genera .local/
```

Lee `FIREBASE_CONFIG` de `.env` y hace lo mismo que el paso «Inject Firebase
config» del workflow, pero dejando los archivos con sus nombres de siempre para
que los enlaces entre páginas funcionen. `.local/` está en `.gitignore`.

Ojo: `--build` borra y rehace `.local/`, así que si el servidor estaba corriendo
hay que reiniciarlo.

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