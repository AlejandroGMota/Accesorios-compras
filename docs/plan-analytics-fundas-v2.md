# Analytics de fundas — diseño de implementación (v2)

Este documento toma el plan por etapas ya aprobado y resuelve lo que dejó
abierto: dónde se captura una venta, el esquema exacto de las colecciones
nuevas, el algoritmo de rotación, qué muestra cada pantalla de Analytics, la
normalización de nombres y el criterio de terminado por etapa. No es un
documento de código: no toca `app.js`, `lista-core.js`, `analytics/analytics.js`,
`index.html`, `firestore.rules` ni ningún otro archivo del repo. Cuando una
decisión implica cambiar algo de eso, se dice explícitamente que es trabajo de
implementación futuro, fuera de este entregable.

## Nota sobre el estado del repo

Al escribir esto, `main` ya contiene el refactor descrito como "solo en la
máquina del dueño": el commit `fb719b1` ("una lista por local, lista global y
panel de admin") ya está en GitHub. `app.js` ya es el shim de 9 líneas,
`lista-core.js` ya existe con `items/{id}` como colección, `firestore.rules`
ya está versionado con el criterio `admins/{uid}`, y `analytics/analytics.js`
ya tiene el patrón completo de micas (ranking, dona, tendencia, previsión,
reposición). Lo que no se puede confirmar leyendo el repo es si esas reglas
ya están publicadas en la consola de Firebase y si ya existe el documento
`admins/{uid}` real — por eso la Etapa 0 sigue teniendo pasos de verificación
en la sección 6, aunque el código ya esté listo.

Todo lo que sigue está escrito contra el código real que se acaba de leer,
no contra una versión hipotética.

---

## 1. Dónde se registra una venta

### Candidatos y por qué se descartan dos

**Modo del panel global (`global.html`)** — descartado. Ese panel vive detrás
de `protegerPagina()` (login con cuenta de Firebase Auth + `admins/{uid}`).
Las ventas ocurren en el mostrador de cada local, las hace quien esté ahí, sin
cuenta. Pedir login para registrar una venta contradice el único requisito
duro (menos de 10 segundos) antes de tocar el primer botón.

**Botón dentro de `local.html`** — descartado, aunque es el candidato más
barato de construir. `local.html` ya tiene una tarea mental distinta: es la
lista de lo que hace falta pedir al proveedor, con un flujo de "agregar
producto" que pide nombre, categoría, colores y tipos. Meter "registrar
venta" en la misma pantalla obliga a distinguir dos acciones con
consecuencias opuestas (una suma a la lista de compra, la otra resta de un
historial de ventas) en el mismo espacio visual, con el mismo patrón de
checkboxes que ya usa fundas para otra cosa. El riesgo real es el clic
equivocado bajo prisa, exactamente el escenario que hay que evitar.

### Elegido: pantalla nueva `venta.html?id=<local>`

Mismo patrón de URL que `local.html?id=<local>` (mismo `LOCAL_ID` tomado de
`URLSearchParams`, mismo criterio de "sin cuenta", misma resolución del
documento en `locales/{id}` para mostrar el nombre y frenar si el local no
existe). Se llega desde un botón fijo y visible en la cabecera de
`local.html`, "Vendí algo", que abre `venta.html?id=<local>` en la misma
pestaña. Es una pantalla dedicada a una sola tarea, así que no compite
visualmente con el formulario de compra y se puede optimizar solo para
velocidad: menos elementos en el DOM, sin precios, sin lista larga que
renderizar.

### La pantalla, paso a paso

**Estado inicial** (al abrir, o justo después de guardar la venta anterior):
un cuadro de búsqueda con foco automático y, debajo, una rejilla de pastillas
(`pill`, el mismo componente visual que ya usan los colores y tipos de funda
en `index.html`) con los 8–10 modelos que más se han comprado como funda
*para ese local* — no en general, para que lo primero que se vea sea lo que
de verdad se vende ahí. Esa lista sale de una agregación de `fundas_compras`
agrupada por modelo (ver Etapa 2), calculada una vez y guardada en
`localStorage` del teléfono, refrescada como mucho una vez al abrir la
pantalla (no en cada venta) para que un pedazo de red lenta no alargue cada
captura.

1. **Tocar el modelo.** Si está en la rejilla, un toque. Si no, escribir 2–3
   letras filtra la lista completa de modelos conocidos (mismo catálogo,
   sin límite de 8–10) y se toca el que aparezca. Si el modelo nunca se ha
   comprado como funda (nunca hay historial), se puede escribir el nombre
   libre y guardarlo tal cual — entra a `fundas_ventas` sin alias todavía y
   queda para revisión manual en `aliases.csv`, igual que ya pasa con micas.
2. La pantalla cambia (sin recargar) a una rejilla de 6 pastillas de color
   (Rojo, Azul, Menta, Lila, Negro, Rosa — los mismos de `index.html`).
   **Tocar el color.**
3. La pantalla cambia a una rejilla de 7 pastillas de tipo (Magsafe,
   Transparente, 3 piezas, Diseño hombre, Diseño mujer, Uso rudo, Color —
   los mismos de `index.html`). **Tocar el tipo.**
4. Al tocar el tipo, la venta se guarda de inmediato con `cantidad: 1`
   (el caso común). No hay botón de "Guardar": el último toque necesario
   para elegir los datos es el mismo que confirma. Aparece un aviso grande
   ("✓ iPhone 15 · Negro · Magsafe") con un enlace "Deshacer" que borra el
   documento si se toca dentro de 5 segundos, y la pantalla vuelve sola al
   estado inicial, lista para la siguiente venta.
5. Si se vendió más de una pieza igual a la vez, un stepper pequeño
   ("+1 / +2 / +3…") vive junto a la rejilla de tipo, visible pero no en el
   camino del toque por defecto: tocar el tipo con el stepper en 1 guarda de
   una vez; subir el stepper antes de tocar el tipo cambia la cantidad.

**Total en el caso común: 3 toques** (modelo, color, tipo) más el toque
inicial en "Vendí algo" desde `local.html`. En un teléfono, cuatro toques con
transiciones simples de pantalla razonablemente caen entre 4 y 7 segundos,
con margen bajo el límite de 10. Esto es una estimación de diseño, no una
medición: el criterio de terminado de la Etapa 3 (sección 6) exige
cronometrarlo con una persona real del local, no con el desarrollador.

### Corrección de errores

Los 5 segundos de "Deshacer" cubren el error que se nota al instante. No
cubren el error que se nota 20 minutos después (alguien revisa y ve que tocó
"Azul" en vez de "Negro"). Por eso `venta.html` debe mostrar, debajo de la
rejilla inicial, una lista corta de las últimas 5–10 ventas de ese local en
esa sesión, cada una con un botón "Borrar" sin confirmación adicional (el
riesgo de borrar una venta real por error es mucho menor que el de dejar
ventas mal capturadas sin forma de arreglarlas). Sin esto, el sistema hereda
el mismo problema que hoy: nada se corrige, y los datos se ensucian en
silencio.

---

## 2. Esquema de `fundas_compras` y `fundas_ventas`

### Requisito previo, fuera de este documento: un tipo por renglón

Hoy, `colors[]` y `fundaTypes[]` en `items` son selección múltiple, y
`quantity` se llena sola contando casillas marcadas de ambos grupos juntos
(2 colores + 1 tipo = cantidad 3), aunque el campo de cantidad sigue siendo
editable a mano. Eso funciona para "algo hay que traer de este modelo" en la
lista de compra — no hace falta precisión ahí, decisión ya tomada — pero es
inservible como dato de analítica: no hay forma de saber cuántas de esas 3
piezas eran Magsafe y cuántas Transparente si se marcan los dos tipos a la
vez.

La pregunta de negocio "qué tipo de funda rota más rápido" necesita
granularidad por tipo. La forma honesta de resolverlo, sin inventar un
reparto arbitrario sobre un número que ya es heurístico, es **cambiar el
tipo de funda a selección única** (radio, como ya funciona para Micas e
Hidrogel) antes de escribir el primer documento de `fundas_compras`. Los
colores siguen siendo multiselección — el color no es parte de ninguna de
las dos preguntas de negocio, solo sirve para la lista de compra y como dato
descriptivo en la venta. Esto es un cambio de un campo en el formulario de
`index.html`/`local.html` y una línea en `buildProductDetails` de
`lista-core.js`; no se hace en este documento, pero la Etapa 1 no debería
arrancar sin él, porque si no, `fundas_compras` hereda la misma ambigüedad
y la Etapa 4 completa se construye sobre ruido.

Con eso resuelto, el campo `type` de `items` para categoría `Fundas` se
comporta exactamente igual que para Micas: un string, no un array.
`fundaTypes[]` deja de escribirse en items nuevos (los documentos viejos que
ya la tienen no se tocan; `buildProductDetails` puede seguir leyendo el array
viejo si existe, para no romper lo ya guardado).

### `fundas_compras/{id}`

Un documento por cada vez que se agrega una funda a una lista de compra
(local o tianguis), igual que `micas_compras`. Se escribe desde
`lista-core.js` al llamar `agregarItem`, y el id vuelve al item como
`analyticsId`, exactamente igual que hace `registrarCompraMica`.

| Campo | Tipo | Obligatorio | Por qué |
|---|---|---|---|
| `modelo` | string | Sí | Nombre normalizado vía `aliases.csv` (sección 5). Es la clave de agrupación del ranking. |
| `nombre_original` | string | Sí | Tal como se escribió. Sirve para depurar aliases y para reintentar la búsqueda del registro si `analyticsId` no llegó a guardarse (mismo patrón que `buscarRegistroMica`). |
| `tipo` | string | Sí | Uno de los 7 tipos de funda. Es la clave de la pregunta de negocio 2 (rotación). Con el cambio de la sección anterior, siempre viene de una selección única, nunca de un array. |
| `colores` | array&lt;string&gt; | No | Los colores marcados en esa línea (puede ser 0 a 6). Descriptivo únicamente: no participa en el emparejamiento FIFO ni en ninguna de las dos preguntas de negocio. Se guarda para no perder el dato y por si algún día se pregunta algo sobre colores. |
| `cantidad` | number | Sí | Unidades de ese modelo y tipo en esa compra. Con tipo de selección única, este número ya no es una heurística: es la cantidad real que la persona escribió (o dejó, editable) para ese renglón. |
| `precio` | number | Sí (puede ser 0) | Precio unitario capturado. En la lista de un local casi siempre es 0 porque el precio se pone al comprar, igual que hoy con fundas y micas sin precio en `local.html`. |
| `local` | string | Sí | Id del local, igual que en `items`. |
| `fecha` | timestamp | Sí | `serverTimestamp()` al escribir, igual que micas. |
| `mes`, `año` | number | Sí | Derivados de `fecha` en el momento de escribir, para agrupar rápido sin tener que convertir timestamps al leer. Igual que micas. |
| `estado` | string enum: `pendiente` \| `comprado` \| `anulado` | Sí | Misma semántica que micas: `pendiente` hasta que se palomea en la lista, `comprado` al palomear, `anulado` si se borra de la lista sin haberla palomeado. Analytics descarta `pendiente` y `anulado`, igual que hoy. |
| `comprado` | timestamp | No (solo si `estado === 'comprado'`) | Fecha real de compra, la que usa el cálculo de rotación como fecha de entrada del lote FIFO. |
| `anulado` | boolean | No (solo si `estado === 'anulado'`) | Igual que micas. |

### `fundas_ventas/{id}`

El esquema base ya lo fijó el dueño: `{modelo, color, tipo, cantidad, local,
fecha}`. Aquí se completa con tipos, obligatoriedad y dos campos que hacen
falta para que el resto del plan funcione.

| Campo | Tipo | Obligatorio | Por qué |
|---|---|---|---|
| `modelo` | string | Sí | Normalizado con el mismo criterio que `fundas_compras` (sección 5). Es la clave para cruzar venta con compra. |
| `color` | string | Sí | Uno de los 6 colores. Dato descriptivo: no entra al emparejamiento FIFO (ver sección 3) porque las compras no traen una cantidad confiable por color, solo la lista `colores[]`. Se guarda para insights futuros ("qué color se vende más"), que no son una de las dos preguntas de negocio actuales pero no cuesta nada capturar ya que la pantalla lo pide de todos modos. |
| `tipo` | string | Sí | Uno de los 7 tipos. Junto con `modelo`, es la clave de emparejamiento FIFO. |
| `cantidad` | number | Sí, default 1 | Unidades vendidas en ese toque. |
| `local` | string | Sí | Viene del parámetro `id` de la URL, igual que `local.js`. |
| `fecha` | timestamp | Sí | `serverTimestamp()`. |
| `mes`, `año` | number | Sí (no estaba en el esquema original) | Mismo motivo que en compras: agrupar rápido sin reprocesar timestamps. Se añaden por consistencia con el resto del sistema, no porque cambien el esquema que decidió el dueño — son metadatos derivados de `fecha`. |
| `anulado` | boolean | No (solo si se borra) | Necesario para el botón "Borrar" de la sección 1 y el "Deshacer" de 5 segundos: una venta corregida no debe desaparecer sin dejar rastro de que existió y se anuló, por si alguna vez hay que auditar por qué un número no cuadra. Se anula, nunca se borra el documento físicamente. |

Deliberadamente **no** se agrega ningún campo de usuario/dispositivo:
el local anota sin cuenta, y meter un identificador ahí contradice esa
decisión ya tomada sin aportar nada a las dos preguntas de negocio.

### Reglas de Firestore

`items` está abierto (`allow read, write: if true`) porque la gente del
local escribe sin cuenta, y eso no cambia aquí. Para las dos colecciones
nuevas:

```
// Historial de compras de fundas: mismo criterio que micas_compras.
match /fundas_compras/{docId} {
  allow read, write: if true;
}

// Ventas de fundas: se escriben sin cuenta desde venta.html, igual que
// items. A diferencia de micas_compras, esto es un historial de negocio
// real (entra directo al cálculo de rotación), así que solo se permite
// crear: nada externo puede reescribir o borrar una venta ya guardada
// desde fuera de la app. Borrar/anular una venta propia lo hace venta.html
// marcando `anulado`, que es un `update`... por eso `update` se deja
// abierto igual que `create`: la restricción real que vale la pena es
// que nadie borre (`delete`) el historial completo desde fuera.
match /fundas_ventas/{docId} {
  allow read, create, update: if true;
  allow delete: if false;
}
```

Esto no cierra el riesgo de que cualquiera con la URL del proyecto escriba
datos falsos — ya es el criterio aceptado hoy para `items` y
`micas_compras` — pero sí evita que un error de cliente o un tercero borre
el historial de ventas completo con una sola llamada, que es el peor
escenario porque no hay forma de recuperarlo (a diferencia de un item mal
puesto en la lista de compra, que no tiene consecuencia si se borra).

---

## 3. Cálculo de rotación (FIFO aproximado)

No se sabe qué unidad física se vendió, así que se asume que se vende
primero lo que se compró primero. El cálculo se hace por separado para cada
combinación `(modelo, tipo)` — no por color, por la razón ya dada en la
sección 2.

### Algoritmo

1. Reunir todas las compras confirmadas (`estado === 'comprado'`) de ese
   `(modelo, tipo)`, ordenadas por `comprado` ascendente. Cada una es un
   **lote**: `{fecha, cantidad, restante: cantidad}`.
2. Reunir todas las ventas de ese `(modelo, tipo)`, ordenadas por `fecha`
   ascendente.
3. Recorrer las ventas en orden. Para una venta de `cantidad` N:
   - Tomar el lote más viejo con `restante > 0`.
   - Consumir `min(N, lote.restante)` unidades de ese lote. Esa porción
     genera un tiempo de rotación = `venta.fecha − lote.fecha`, en días.
   - Si `N` no se cubre con un lote, seguir con el siguiente lote más viejo
     hasta cubrir toda la venta (una venta puede repartirse entre varios
     lotes si vino un lote chico antes).
   - Si se acaban los lotes con `restante > 0` y aún queda cantidad de la
     venta sin cubrir, esa porción se cuenta aparte como **venta sin
     compra emparejada** (ver punto 5) y no genera tiempo de rotación.
4. El tiempo de rotación de cada porción emparejada se guarda en una lista
   por tipo. La métrica que se muestra es la **mediana** de esa lista, no el
   promedio: una sola venta de 20 piezas de un lote viejo no debe mover la
   cifra tanto como si se usara promedio.
5. **Ventas sin compra emparejada**: pasa por dos motivos que hay que
   distinguir en el discurso pero no en el cálculo (ambos se excluyen de la
   mediana igual):
   - Se agotó el historial de compras conocido porque hay más ventas
     registradas que compras — probable si `fundas_ventas` empieza antes de
     que `fundas_compras` tenga suficiente profundidad, o si hay inventario
     que se compró **antes** de que existiera el sistema (todo lo comprado
     antes de la Etapa 1 es invisible: no hay documento que lo represente).
   - Nunca hubo una compra registrada de ese `(modelo, tipo)` en absoluto
     (se vendió algo que nunca pasó por `fundas_compras`).
   
   En ningún caso se inventa una fecha de compra para tapar el hueco. Se
   cuenta cuántas ventas cayeron aquí y se muestra como una cifra aparte:
   "de las N ventas de este tipo, M no se pudieron emparejar con una compra
   conocida (probablemente stock de antes del sistema)".
6. **Cobertura** = (ventas emparejadas) / (ventas totales) de ese
   `(modelo, tipo)`. Es el número que decide si la rotación se muestra
   (sección 4).

### Cómo se le dice al usuario que es una aproximación

Toda cifra de rotación en pantalla lleva, sin excepción, esta nota fija:

> Aproximado: se asume que se vende primero lo que se compró primero. No
> hay forma de saber qué pieza física se llevó cada cliente.

Y junto a cada número, la cobertura como fracción visible ("18 de 22 ventas
emparejadas"), no escondida en un tooltip. Si la cobertura es baja, ver
sección 4 — la cifra no se muestra suelta, se reemplaza por el aviso de
datos insuficientes.

---

## 4. Qué muestra cada vista de Analytics

Las tres vistas que pide la Etapa 4, en una pestaña nueva "Fundas" del
mismo panel de Analytics (reusando el patrón de pestañas que ya existe en
`analytics.js`: `SUBTITULOS`, `mostrarPestana`, hash de la URL). Todas se
calculan client-side sobre `fundas_compras` y `fundas_ventas` completas,
igual que hoy se hace con `micas_compras` — a la escala de este negocio
(unos cuantos miles de documentos como techo razonable) no hace falta
backend ni agregaciones del lado del servidor.

### Vista A — Ranking de modelos (pregunta 1: qué modelos piden más funda)

Columnas: `Modelo | Compradas (pzs) | % del total | Vendidas (pzs) | Última compra`.
Orden por defecto: descendente por "Compradas", con encabezados que ordenan
al hacer clic (mismo patrón `sortable` de la tabla de ranking de micas).

**Sin datos**: "Aún no hay compras de fundas registradas. Se llena solo
según se agreguen fundas a la lista." (mismo tono que el mensaje vacío ya
usado en `analytics.js`).

**Cuántos datos hacen falta**: un conteo siempre es literalmente cierto,
así que la fila se muestra desde la primera compra — no hay razón para
ocultarla. Pero por debajo de 10 compras confirmadas o 30 días de
historial para ese modelo, se marca con una nota "(dato preliminar)" al
lado del nombre, en cursiva, para que no se lea como una cifra estable.
**Qué no se puede concluir con pocos datos**: con 2 o 3 compras de un
modelo, el ranking dice qué se ha comprado, no qué se va a seguir
comprando — una racha de un solo cliente pidiendo el mismo modelo dos
semanas seguidas no es una tendencia.

### Vista B — Rotación por tipo (pregunta 2: qué tipo rota más rápido)

Columnas: `Tipo | Rotación mediana (días) | Pares compra-venta | Cobertura | N compras | N ventas`.
Orden: ascendente por rotación mediana (el que rota más rápido arriba),
pero **solo entran filas con al menos 5 pares compra-venta emparejados**.
Con menos de 5 pares, la fila se muestra en gris con "Sin datos
suficientes" en la columna de rotación, en vez de un número.

Esta vista es la única donde se oculta la cifra en vez de solo advertirla,
a diferencia del ranking: un número de rotación no es un conteo, es una
inferencia sobre un patrón, y una inferencia con 2 o 3 pares no es más
confiable que adivinar — mostrarla como si lo fuera es peor que no
mostrar nada.

**Sin datos**: "Todavía no hay pares de compra y venta suficientes para
medir rotación. Hacen falta compras Y ventas del mismo modelo y tipo
después de encender este sistema." **Qué no se puede concluir**: incluso
con 5–10 pares, la mediana puede moverse mucho si cambia la temporada o si
un solo cliente compró varias piezas de golpe; hace falta ver la cifra
estable durante 2–3 meses antes de tomarla como base para decidir qué
tipo dejar de comprar.

### Vista C — Qué lleva mucho sin venderse

Columnas: `Modelo | Tipo | Comprado el | Sin vender (según FIFO) | Días desde la compra`.
Orden: descendente por días desde la compra (lo más viejo primero).

Se construye directo del estado final de los lotes FIFO del algoritmo de
la sección 3: cualquier lote con `restante > 0` y más de 45 días desde su
`fecha` de compra aparece aquí, **solo si ese `(modelo, tipo)` tiene al
menos una venta histórica** — sin eso no se puede distinguir "esto no se
vende" de "esto se compró la semana pasada y todavía no le toca". El
umbral de 45 días es arbitrario pero razonable como punto de partida
(más corto que los ~60-90 días que suele tardar la previsión de micas en
formarse una opinión); se puede ajustar con más historial real.

**Sin datos**: "Ninguna funda comprada hace más de 45 días sigue sin
vender, o todavía no hay suficiente historial para saberlo." **Qué no se
puede concluir**: un lote viejo sin vender puede ser porque el tipo no
gusta, porque el modelo ya no se usa (celular descontinuado) o porque
simplemente nadie lo ha puesto a la vista en el mostrador — la tabla dice
qué revisar, no por qué.

---

## 5. Normalización de modelos

**Se reusa el mismo `aliases.csv`**, no uno propio. La razón es la que ya
dio el dueño: un iPhone 15 es el mismo modelo lleve mica o funda. El
catálogo de modelos de celular es del negocio, no de la categoría de
accesorio — mantener dos archivos de alias significaría que "15pm" se
normaliza a "iPhone 15 Pro Max" en micas pero podría quedar sin normalizar
o normalizarse distinto en fundas, lo que rompe cualquier cruce futuro
entre "qué modelos piden más mica" y "qué modelos piden más funda" (no es
una de las dos preguntas de hoy, pero es la primera pregunta obvia que
alguien va a hacer después, y no hay razón para cerrarle la puerta gratis).

Cómo se aplica en código (para quien implemente esto después): hoy existen
dos funciones de normalización distintas para micas, y fundas debe seguir
el mismo patrón dual, no inventar un tercero:

- Al **escribir** (`lista-core.js`, dentro de `registrarCompraMica`) se usa
  una normalización simple (`normalizarNombre` + `cargarAliases` de
  `lista-core.js`, que solo hace *lowercase* + *trim* + búsqueda directa en
  el mapa de `aliases.csv`). `fundas_compras` y `fundas_ventas` deben
  escribir su campo `modelo` con esa misma función, no con una copia.
- Al **leer** (`analytics/analytics.js`) se usa una normalización más
  rica (`claveNombre` + `PATRONES_MODELO` + `modeloDe`), que además intenta
  reconocer modelos que nunca se aliasaron a mano (Samsung, OPPO). El
  análisis de fundas debe reusar exactamente esas mismas funciones —
  extraerlas del archivo de micas a un módulo compartido (p. ej.
  `analytics/normalizar-modelo.js`) es la forma correcta de hacerlo, en vez
  de copiar y pegar la lógica dentro de un futuro `analytics/fundas.js`.
  Copiarla es el error más probable de aquí a seis meses: el día que se
  ajuste un patrón de Samsung en un archivo y no en el otro, "qué modelos
  piden más mica" y "qué modelos piden más funda" van a usar nombres
  distintos para el mismo teléfono sin que nadie lo note hasta que alguien
  compare las dos tablas a mano.

Este refactor (extraer la normalización a un módulo compartido) es menor
y debe hacerse en la Etapa 1, antes de escribir el primer documento de
`fundas_compras` — no después, porque una vez que hay historial escrito
con una normalización distinta a la de micas, corregirlo significa
reprocesar documentos ya guardados.

---

## 6. Criterio de terminado y verificación por etapa

### Etapa 0 — Terreno firme

- [ ] `main` tiene el refactor (`items`, `lista-core.js`, `locales`,
  `admin.html`). *Ya está* (commit `fb719b1`) — verificar con
  `git log --oneline -1` y confirmando que `app.js` mide 9 líneas.
- [ ] `firestore.rules` está publicado en la consola de Firebase
  (Firestore Database → Rules → Publish) y coincide con el archivo del
  repo. Verificar copiando el contenido publicado en la consola y
  comparándolo línea por línea con `firestore.rules`.
- [ ] Existe al menos un documento en `admins/{uid}` con el UID real del
  dueño. Verificar entrando a `global.html` con esa cuenta y confirmando
  que no aparece "Esta cuenta no tiene permiso de administrador."
- [ ] La migración de `app/productos` a `items/{id}` ya corrió. Verificar
  contando documentos en `items` desde la consola de Firestore, uno por
  local activo como mínimo.

### Etapa 1 — `fundas_compras`

- [ ] El campo de tipo de funda en el formulario es selección única
  (prerequisito de la sección 2), no checkboxes.
- [ ] Agregar una funda crea un documento en `fundas_compras` con los
  campos de la sección 2, y el item en `items` recibe `analyticsId`.
- [ ] Palomear esa funda cambia el documento a `estado: 'comprado'` con
  `comprado` como server timestamp.
- [ ] Borrar la funda sin palomear la anula (`estado: 'anulado'`).

**Verificación**: agregar una funda de prueba en un local de prueba y
comprobar en la consola de Firestore que el documento existe con los
campos correctos en los tres casos (agregar, palomear, borrar sin
palomear).

### Etapa 2 — Catálogo derivado del historial

- [ ] Existe una función que lee `fundas_compras` con
  `estado != 'pendiente'` y `estado != 'anulado'`, agrupa por modelo (y
  por local, para el filtro de `venta.html`) y produce una lista ordenada
  por frecuencia.
- [ ] Esa lista se guarda en `localStorage` y se refresca como mucho una
  vez por apertura de `venta.html`, no en cada venta.

**Verificación**: con al menos 2 modelos distintos ya comprados para un
local, abrir `venta.html?id=<ese local>` y confirmar que ambos aparecen
en la rejilla inicial sin escribir nada.

### Etapa 3 — `fundas_ventas`

- [ ] `venta.html` completo: modelo → color → tipo → guardado automático,
  con "Deshacer" de 5 segundos y lista de últimas ventas con botón
  "Borrar".
- [ ] Reglas de `fundas_ventas` publicadas (`create`/`update` abiertos,
  `delete` cerrado).

**Verificación**: cronometrar con cronómetro real, en un teléfono, a
alguien del local que no participó en el diseño, registrando 5 ventas de
prueba. El promedio debe ser menor a 10 segundos y ninguna debe quedar mal
guardada. Si no se cumple, no se avanza a la Etapa 4 — sin este número el
resto del plan no tiene datos que analizar.

### Etapa 4 — Analytics

- [ ] Las tres vistas (ranking, rotación, sin vender) están en la pestaña
  "Fundas", con los umbrales de la sección 4 funcionando: probar con pocos
  datos a propósito y confirmar que la cifra de rotación se oculta (no que
  muestra un número con pocos pares) y que el ranking marca "(dato
  preliminar)" cuando corresponde.

**Verificación**: crear a mano, con fechas conocidas, un puñado de compras
y ventas de prueba; calcular a mano la rotación mediana esperada con el
algoritmo de la sección 3 y compararla con lo que muestra la pantalla.

### Etapa 5 — Reposición

- [ ] La pestaña de reposición de fundas solo se activa con 6–8 semanas de
  ventas encima y el mínimo de pares de la sección 4; antes de eso muestra
  "Acumulando datos" en vez de una cifra.

**Verificación**: con menos de 6 semanas de historial, confirmar que no
aparece ningún número de reposición, solo el aviso.

---

## 7. Riesgos reales

1. **La velocidad es el riesgo #1, y es el único que puede matar todo el
   plan.** Si en la práctica —no en el diseño de papel— registrar una
   venta toma más de 10 segundos, nadie lo va a usar pasada la primera
   semana, exactamente como hoy nadie registra ventas en ningún lado. La
   Etapa 3 no está terminada hasta que alguien lo cronometra de verdad; no
   basta con que el diseño de esta sección "parezca" rápido.

2. **Nadie corrige errores tardíos si no hay dónde hacerlo.** El
   "Deshacer" de 5 segundos solo sirve para el error que se nota al
   instante. Sin la lista de últimas ventas con botón de borrar (sección
   1), el sistema hereda el mismo problema que hoy: los datos se ensucian
   en silencio y nadie se entera hasta que Analytics da un número raro.

3. **Si se salta el cambio a tipo de selección única, la Etapa 4 completa
   se construye sobre ruido.** La heurística actual de cantidad (colores +
   tipos contados juntos) ya es inservible para saber cuánto de cada tipo
   se compró. Este es el riesgo más directo de invalidar la pregunta de
   negocio 2 desde el origen del dato, no desde el análisis.

4. **La cobertura de emparejamiento FIFO va a ser baja al principio, y
   hay que decirlo de entrada.** Todo lo que hay hoy en el mostrador se
   compró antes de que existiera `fundas_compras`; las primeras ventas no
   van a emparejar con nada. La rotación no va a decir nada útil hasta que
   pase un ciclo completo compra→venta con ambas colecciones ya
   encendidas — probablemente 1–2 meses. Si el dueño espera ver algo útil
   en la primera semana, va a concluir que "no sirve" antes de que tenga
   oportunidad de servir.

5. **El empleado puede no saber con certeza qué tipo era la funda que
   vendió.** Las 7 categorías de tipo son etiquetas pensadas para cuando
   se compra, no necesariamente cómo alguien identifica lo que trae en la
   mano si las fundas se revuelven en el aparador. Si adivina, esa
   incertidumbre contamina justo la pregunta de negocio 2. No es algo que
   el software resuelva; es un riesgo operativo que vale más decirlo en
   voz alta que fingir que no existe.

6. **`fundas_ventas` sigue siendo una colección de escritura abierta.**
   Igual que `items` y `micas_compras` hoy, cualquiera con la URL del
   proyecto puede escribir ventas falsas. La regla de `delete: false`
   propuesta en la sección 2 evita el peor caso (borrar el historial
   completo) sin costo en velocidad, pero no resuelve el resto. Es un
   riesgo ya aceptado en el sistema actual, no algo que este documento
   pretenda cerrar.

7. **El catálogo depende de que alguien cure `aliases.csv` para fundas
   igual que ya se hace para micas.** Si no se revisa, el ranking se llena
   de variantes del mismo modelo escritas distinto ("iphone 15", "ip 15",
   "15 pro max" sin espacio) contadas como modelos separados, diluyendo
   exactamente la pregunta que se quiere responder. Es trabajo manual
   recurrente; el sistema no lo hace solo.

8. **Punto de desacuerdo con el plan original, dicho directamente:** medir
   rotación por `(modelo, tipo)` sin color es correcto para las dos
   preguntas de negocio actuales, pero el esquema de `fundas_ventas` ya
   decidido captura color de todos modos. Si en la práctica el paso de
   "tocar el color" resulta ser el que más se equivoca o el que más
   fricción añade (es el único de los tres toques que no tiene un
   candidato "más probable" para preseleccionar, a diferencia de modelo y
   tipo), vale la pena revisarlo con el dueño después de las primeras
   semanas de uso real: quitar ese toque baja el tiempo de captura sin
   perder nada de lo que hoy se pide medir. No se cambia aquí porque el
   dueño ya fijó ese esquema, pero no hay que tratarlo como intocable si
   los datos de uso real dicen que sobra.
