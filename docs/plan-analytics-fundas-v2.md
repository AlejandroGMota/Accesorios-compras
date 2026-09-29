# Plan v2: Analytics de Fundas

**Fecha:** 2026-09-29
**Punto de partida:** el plan por etapas del dueño (Etapa 0 a Etapa 5) más lo que existe hoy en `main`: colección `items/{id}`, `lista-core.js` compartido entre `app.js` (tianguis) y `local.js`, `locales/{id}`, `firestore.rules` versionado, `admins/{uid}`, y el patrón ya probado de `micas_compras` (`lista-core.js:377-477`).

Este documento no cuestiona las tres decisiones del dueño (lista de compra sola, un renglón por modelo con elección al vender, las dos preguntas de negocio). Las da por buenas y resuelve todo lo que el plan por etapas dejó sin especificar.

**Nota:** en esta misma rama ya había una versión previa (commit `43fffb3`) de este documento, de una corrida anterior de esta rutina. Llega a las mismas conclusiones centrales (pantalla dedicada para vender, un tipo por renglón como prerequisito, FIFO con piso mínimo antes de mostrar un número, un solo `aliases.csv` compartido) — lo cual es una buena señal de que el diseño converge y no es un capricho de una sola corrida. Esta versión la reemplaza incorporando dos mejoras concretas de esa revisión (reglas de Firestore que no dejan borrar el historial de ventas, y usar la mediana en vez del promedio para la rotación) y ajusta al menos un punto donde disiento: esa versión guarda la venta automáticamente al tocar el último dato (sin un botón de confirmar), lo cual expone a una venta fantasma por un toque accidental; aquí se mantiene un botón explícito "Registrar venta" (ver §1).

---

## 0. Un ajuste que hay que hacer antes de la Etapa 1

El plan dice "imitar a micas" para `fundas_compras`. No se puede imitar tal cual, porque el formulario de Fundas no captura lo mismo que el de Micas:

- Mica: `micaType` es un **radio** — un solo tipo por renglón. `cantidad` la escribe la persona.
- Funda: `fundaColors` y `fundaTypes` son **checkboxes** — se puede marcar Magsafe y Transparente en la misma alta. `cantidad` se autocalcula sola contando casillas de colores **y** tipos juntas (`lista-core.js:292-298`, función `updateFundaQuantity`).

Eso significa que hoy, para una funda, no existe ningún dato limpio de "cuántas piezas son de tipo Magsafe". Si guardamos `fundaTypes` como arreglo en `fundas_compras`, la cantidad queda repartida entre tipos sin saber cómo, y la Etapa 4 (rotación por tipo) no se puede calcular sin inventar un supuesto adicional encima del supuesto FIFO.

**Cambio propuesto, previo a la Etapa 1:** en el formulario de Fundas (`local.html`, `index.html`/tianguis), `fundaTypes` pasa de checkboxes a **radio**, igual que `micaType`. Los colores siguen siendo checkboxes. La cantidad se recalcula solo con las casillas de color marcadas (`document.querySelectorAll('#fundaColors input:checked').length`), ya sin sumar los tipos.

Con esto, una funda física siempre es exactamente un modelo + un tipo + un color, y `cantidad` en `fundas_compras` pasa a significar "piezas de este modelo+tipo, una por cada color marcado" — un número real, no una heurística que mezcla dos dimensiones. Es el mismo criterio que ya usa Mica (un tipo por renglón) y Hidrogel (`hidrogelType` también es radio).

Si el dueño prefiere no tocar el formulario todavía: la alternativa es guardar `tipos: string[]` (el arreglo completo) más una bandera `mixto: true` cuando hay más de un tipo marcado, y en la Etapa 4 repartir `cantidad` entre los tipos marcados a partes iguales, redondeando hacia arriba, marcando esos registros como de confianza baja en el cálculo de rotación (ver §3). Esto funciona pero degrada justo el dato que la Etapa 4 necesita más limpio. Recomiendo el cambio de checkbox a radio; es una edición de un `<input>` en dos archivos HTML, no un rediseño.

El resto de este documento asume que el cambio se hizo.

---

## 1. Dónde se registra una venta

### Los tres candidatos

**A. Pantalla nueva (`venta.html?id=<local>`).** Mismo patrón que `local.html?id=<local>`: sin login (los locales anotan sin cuenta), el id de local va en la URL, se puede guardar como acceso directo en el teléfono de cada local.

**B. Botón en la lista del local.** Agregar un "Vendí" a cada renglón de `fundasList` en `local.html`.

**C. Modo del panel global.** Una pestaña más en `global.js`/`global.html`.

### Decisión: A — pantalla nueva

**B se descarta** porque el renglón de la lista de compra no representa lo que hay que vender. Es "lo que falta pedir al proveedor", no un inventario: en cuanto se compra y se palomea, el renglón normalmente se borra con "Borrar compradas". Para cuando alguien vende una funda, es común que ese renglón ya no exista en la lista, o que la funda que se vendió nunca haya sido "la última que se pidió" (el local puede tener stock de compras de semanas atrás). Además, la decisión #2 del dueño ya dice que al vender **se elige** de un catálogo de modelos, no de la lista viva — eso es exactamente el catálogo derivado de la Etapa 2, no `items`.

**C se descarta** porque `global.html`/`admin.html` están detrás de `protegerPagina()` (`auth.js`), con Firebase Auth y la colección `admins/{uid}`. Esa pantalla es del dueño. La persona vendiendo en el local no tiene cuenta ni la va a tener — meter login ahí para vender rompe la restricción de 10 segundos antes de escribir una sola línea de código: ya perdiste el tiempo en la pantalla de acceso.

**A es la única que puede ser rápida de verdad**, porque puede mostrarse ya armada con el catálogo de modelos de ese local (Etapa 2) como botones grandes, sin formulario que llenar.

### Diseño paso a paso de `venta.html?id=<local>`

Mismo esqueleto que `local.html`: header con el nombre del local (cargado igual que en `local.js:22-34`, mismo aviso si el id no existe), y navegación cruzada `Lista ⇄ Vender` en el `header-nav` de ambas páginas.

**Qué ve al abrir:**

1. Una rejilla de botones grandes (mínimo 44×44px, pensados para el pulgar) con los modelos que más se han vendido **en ese local** en los últimos 30 días — top 12, sacados del catálogo derivado (Etapa 2), cacheado en memoria/`localStorage` para que la pantalla abra sin esperar a Firestore.
2. Un buscador de texto arriba de la rejilla, que filtra esa misma lista completa de modelos conforme se escribe (no solo el top 12) — para el modelo que no es frecuente pero sí existe en el historial.
3. Si lo que se escribió no matchea ningún modelo del catálogo: un botón "Usar “<lo escrito>” tal cual" — nunca bloquear una venta por un problema de catálogo; se guarda con `modelo_original` sin normalizar y ya se corrige después con `aliases.csv`.

**Toques:**

| Paso | Acción | Qué aparece después |
|---|---|---|
| 1 | Tocar el modelo (chip o resultado de búsqueda) | Aparecen los 7 chips de tipo de funda (Magsafe, Transparente, 3 piezas, Diseño hombre, Diseño mujer, Uso rudo, Color) |
| 2 | Tocar el tipo | Aparecen los 6 chips de color (Rojo, Azul, Menta, Lila, Negro, Rosa) **más** un chip ya preseleccionado "Sin especificar", y se habilita el botón **Registrar venta** |
| 3 (opcional) | Tocar un color si se quiere anotar | No cambia nada más — es un reemplazo del preseleccionado, no un paso obligatorio |
| 4 | Tocar **Registrar venta** | Se escribe el documento, toast "Vendida: iPhone 15 · Magsafe ✓ (Deshacer)", la pantalla vuelve al paso 1 lista para la siguiente |

Caso común: **3 toques** (modelo → tipo → Registrar), sin escribir nada, cantidad 1 por default. Con estimado de reacción humana (~1 s por toque más el tiempo de leer la confirmación), esto cae cómodo debajo de los 10 segundos, incluso contando que la persona tenga que buscar el modelo si no está en el top 12 visible.

Si se vendieron más de 1 pieza del mismo modelo+tipo+color en el mismo momento: un stepper "+/−" junto al botón Registrar, que no bloquea el flujo de 3 toques cuando no se toca (queda en 1).

**Por qué no auto-confirmar al tocar el tipo (2 toques):** se consideró que tocar el tipo mandara la venta de una vez, para bajar de 3 a 2 toques. Se descarta: un toque accidental en la rejilla de tipos (fácil con el pulgar y una pantalla chica, de pie, quizás con un cliente enfrente) registraría una venta falsa sin que nadie la note hasta que alguien revise Analytics semanas después. El toque extra de "Registrar venta" cuesta menos de un segundo y evita ese problema de raíz; el "Deshacer" del toast queda como red de seguridad para errores de modelo o tipo, no como la única defensa contra ventas fantasma.

**Bajo la rejilla:** lista corta "Ventas de hoy en este local" (las últimas ~10), cada una con una ✕ para anularla ahí mismo — sin necesitar la consola de Firestore para corregir un error.

---

## 2. Esquema exacto

### `fundas_compras/{docId}`

Un documento por alta de un ítem de categoría Fundas en la lista de compra (mismo momento que hoy dispara `registrarCompraMica` para Micas).

| Campo | Tipo | Obligatorio | Por qué |
|---|---|---|---|
| `modelo` | `string` | sí | Nombre normalizado con `analytics/aliases.csv` (mismo archivo que Micas, ver §5) |
| `modelo_original` | `string` | sí | Texto tal cual lo escribió quien anotó; sin esto no se puede auditar ni corregir un alias que falta |
| `tipo` | `string` | sí | Uno de los 7 tipos fijos de funda. Ya no es un arreglo (ver §0) |
| `colores` | `array<string>` | no | Colores marcados en esa alta. Es metadata para el dueño, **no entra en ningún cálculo** — las dos preguntas de negocio son por modelo y por tipo, no por color, y no hay forma de saber después cuál color específico se vendió (ver §3) |
| `cantidad` | `number` | sí | Piezas de este modelo+tipo — una por cada color marcado, mínimo 1 |
| `precio` | `number` | sí (`0` si no se sabe) | Igual que hoy: solo la lista del tianguis captura precio real |
| `local` | `string` | sí | Id del local que lo pidió (ya existe en `items`, se copia igual que en `micas_compras` desde el fix de local) |
| `fecha` | `Timestamp` (`serverTimestamp()`) | sí | Cuándo se anotó en la lista |
| `mes`, `año` | `number` | sí | Igual que Micas: para poder filtrar en cliente sin índice compuesto |
| `estado` | `string` | sí | `'pendiente'` \| `'comprado'` \| `'anulado'` — mismo ciclo de vida que Micas |
| `comprado` | `Timestamp` | solo si `estado === 'comprado'` | Cuándo se palomeó de verdad; Analytics prefiere esta fecha sobre `fecha` |

El vínculo con `items` es igual que Micas: al crear el doc, su id se guarda en `items/{id}.analyticsId`; palomear actualiza `estado` a `'comprado'` + `comprado`; despalomear regresa a `'pendiente'` y borra `comprado`; borrar sin palomear pone `anulado: true, estado: 'anulado'`. Son las mismas cuatro funciones de `lista-core.js:379-477` (`registrarCompraMica`, `buscarRegistroMica`, `marcarComprada`, `anularRegistroMica`), generalizadas para tomar la colección (`micas_compras` o `fundas_compras`) como parámetro en vez de estar cableadas a Micas, y las llamadas condicionadas en `toggleComprada`/`deleteProduct` que hoy solo revisan `product.category === 'Micas'` (`lista-core.js:171, 204`) deben incluir `'Fundas'`.

**Invariante a preservar:** `borrarCompradas()` (`lista-core.js:175-191`) solo hace `lote.delete(ITEMS_REF.doc(p.id))` — nunca toca `micas_compras` ni debe tocar `fundas_compras`. Borrar de la lista no borra el historial.

### `fundas_ventas/{docId}`

Un documento por venta registrada desde `venta.html`.

| Campo | Tipo | Obligatorio | Por qué |
|---|---|---|---|
| `modelo` | `string` | sí | Normalizado igual que en compras |
| `modelo_original` | `string` | sí | Lo que se buscó o el texto libre si no había match en el catálogo |
| `tipo` | `string` | sí | Uno de los 7 tipos fijos — es el dato que hace posible §3 |
| `color` | `string` | no (`''` o `'Sin especificar'` si se saltó) | Se guarda porque la decisión #2 del dueño dice explícitamente "se escoge cuál se fue"; no se usa en el cálculo de rotación de hoy (mismo motivo que `colores` en compras) pero queda disponible si algún día se quiere ese corte |
| `cantidad` | `number` | sí, default `1` | Rara vez mayor a 1; cuando lo es, es porque se vendieron varias piezas iguales en el mismo momento |
| `local` | `string` | sí | Viene del `id` en la URL |
| `fecha` | `Timestamp` (`serverTimestamp()`) | sí | No hay distinción pendiente/comprado — una venta no tiene ciclo de vida, solo existe o se anula |
| `mes`, `año` | `number` | sí | Mismo motivo que en compras |
| `anulada` | `boolean` | solo si `true` | El botón ✕ de "Ventas de hoy" la marca así en vez de borrarla, para no perder el rastro de que hubo una corrección |

### Reglas de Firestore

`items` está abierto (`allow read, write: if true`) porque el local anota sin cuenta (`firestore.rules:37-40`), y `micas_compras` sigue el mismo criterio (`firestore.rules:49-52`). `fundas_compras` y `fundas_ventas` deben quedar igual, por la misma razón: quien registra una compra o una venta en `local.html`/`venta.html` no tiene sesión.

```
match /fundas_compras/{docId} {
  allow read, write: if true;
}

// A diferencia de fundas_compras, esto es el único historial del que salen
// las dos preguntas de negocio y no se puede reconstruir si se borra entero
// con una sola llamada. Se deja crear y corregir (anular) sin cuenta, igual
// que todo lo demás, pero no borrar en bloque.
match /fundas_ventas/{docId} {
  allow read, create, update: if true;
  allow delete: if false;
}
```

Esto no cierra el riesgo de que cualquiera con la config pública del proyecto escriba basura ahí — ya es el criterio aceptado hoy para `items` y `micas_compras`, y sigue siéndolo aquí para `fundas_compras` — pero sí evita el escenario irrecuperable: borrar de un jalón todo `fundas_ventas`. Una venta mal capturada se corrige marcándola `anulado: true` (un `update`, no un `delete`), tal como ya hace `venta.html` en §1. El README del proyecto ya deja anotado un criterio más estricto para cuando llegue App Check (`request.app != null` en vez de `if true`, ver README.md:278) — cuando eso se active para `items`/`micas_compras`, `fundas_compras` y `fundas_ventas` deben moverse al mismo paso, no quedar atrás como el hueco sin cerrar.

---

## 3. Cálculo de rotación (FIFO)

No se sabe qué unidad física se vendió. El supuesto que hace falta: **la funda que se vende es la más vieja comprada de ese mismo modelo+tipo** (FIFO). Es una aproximación de contabilidad de inventario, no un rastreo real pieza por pieza — hay que decirlo en pantalla, no simularlo.

### Unidad de cálculo

Todo el cálculo se hace **por `tipo`** (agregando todos los modelos), porque es la pregunta de negocio ("qué tipo rota más rápido"). El color no entra: ni compras ni ventas dividen la cantidad por color de forma confiable, así que mezclarlo en el FIFO solo agregaría una tercera dimensión de incertidumbre encima de dos que ya son aproximadas.

### Algoritmo

Para un tipo dado, se arma una sola línea de tiempo con dos clases de eventos, ordenados cronológicamente:

- **Entrada:** cada documento de `fundas_compras` con `estado === 'comprado'` aporta un lote `{ fecha: comprado, restantes: cantidad }` (se usa `comprado`, la fecha real de compra, no `fecha`, que es cuando se anotó en la lista — igual que Micas prefiere `comprado` sobre `fecha` para todo lo que ya está resuelto).
- **Salida:** cada documento de `fundas_ventas` con `anulada` distinto de `true` consume `cantidad` unidades.

Se mantiene una cola FIFO de lotes. Al procesar una salida:

```
piezas_por_asignar = venta.cantidad
mientras piezas_por_asignar > 0:
    si la cola está vacía:
        registrar (piezas_por_asignar) unidades como "sin compra que las respalde"
        piezas_por_asignar = 0
    si no:
        lote = primer elemento de la cola
        tomadas = mínimo(piezas_por_asignar, lote.restantes)
        registrar un emparejamiento: { dias: (venta.fecha - lote.fecha) en días, piezas: tomadas }
        lote.restantes -= tomadas
        piezas_por_asignar -= tomadas
        si lote.restantes == 0: sacar el lote de la cola
```

### Qué pasa si hay más ventas que compras registradas

Pasa, y no es un caso raro ni transitorio: puede haber stock físico que ya estaba en el local antes de que arrancara este sistema (Etapa 1 empieza con `fundas_compras` vacía — no hay historial previo que migrar), o alguien registró la venta pero la compra correspondiente nunca se anotó, o se anotó con un nombre que no normalizó al mismo `modelo`. En cualquiera de los tres casos el algoritmo de arriba cae en la rama "cola vacía": esas piezas se cuentan en el total vendido, pero **no entran al promedio de días de rotación** (no hay fecha de origen con la cual medir nada) y se muestran aparte como un contador de diagnóstico: "N piezas vendidas sin compra registrada que las respalde". Ese contador es también una señal de calidad de datos — si crece mucho para un tipo o modelo en particular, algo se está anotando distinto entre compra y venta (revisar alias) o alguien no está registrando compras.

### Por qué mediana y no promedio

La cifra de rotación que se muestra por tipo es la **mediana** de los días de los emparejamientos, no el promedio. Una sola venta de 30 piezas de un lote viejo (alguien que surtió su local de golpe) movería el promedio de todo el tipo con un solo evento; la mediana no se deja arrastrar así por un caso extremo, y con lotes de tamaño desigual (cosa que aquí es la norma, no la excepción) es la medida más honesta de "cuánto tarda normalmente".

### Piso mínimo para mostrar un número

Un tipo con pocas unidades emparejadas puede dar una mediana artificialmente baja o alta por pura casualidad (una sola funda que se vendió el mismo día que se compró no dice nada sobre el tipo). Piso: **mínimo 10 piezas emparejadas con fecha de origen conocida**, dentro de la ventana de tiempo que se esté mirando (default: últimos 90 días de ventas). Por debajo de eso, la fila de ese tipo se muestra al final de la tabla marcada "Insuficiente (N piezas)" y nunca puede ganar el destacado de "tipo que rota más rápido" del resumen.

Junto al número, siempre se muestra la **cobertura**: "N de M piezas vendidas de este tipo se pudieron emparejar con una compra (X%)". Es la misma cifra que el contador de "piezas sin compra que las respalde" de más abajo, mostrada como fracción en vez de solo como resta — más fácil de leer de un vistazo que si se calculan cifras absolutas.

### Cómo se le dice al usuario que es una aproximación

Texto fijo bajo la tabla de rotación, siempre visible, no solo la primera vez:

> "Estos días son una mediana calculada bajo el supuesto de que se vende primero lo que se compró primero (FIFO), no un rastreo real de cada pieza. Con pocas piezas emparejadas el número puede ser ruido, no tendencia."

Y junto al contador de piezas sin respaldo:

> "Ventas sin una compra que las explique en el historial. Puede ser stock de antes de este sistema, una compra sin registrar, o un nombre que no se reconoció como el mismo modelo."

---

## 4. Vistas de Analytics

Hoy el tab "Fundas 🔒" está deshabilitado en `analytics/index.html:29`. Pasa a ser un tab activo (`panel-fundas`), mismo patrón de tabs que ya usan Micas e Hidrogel (`analytics/index.html:27-30`), leyendo `fundas_compras` y `fundas_ventas` con una sola lectura completa al entrar (igual que `cargarDatos()` en `analytics.js`, sin listeners en tiempo real).

### A. Resumen

Igual patrón que el de Micas (`analytics/index.html:34-…`, tarjetas `stat-card`):

| Tarjeta | Cálculo |
|---|---|
| Fundas vendidas (90 días) | `sum(venta.cantidad)` no anuladas, en la ventana |
| Fundas compradas (90 días) | `sum(compra.cantidad)` con `estado === 'comprado'`, por `comprado` |
| Modelo más vendido | `modelo` con mayor `sum(cantidad)` en ventas del periodo |
| Tipo que rota más rápido | El tipo con menor mediana de días (§3) que **sí** cruce el piso de 10 piezas; si ninguno lo cruza: `"Acumulando datos"` en vez de un nombre |

### B. Ranking de modelos

Columnas, en este orden: `Modelo | Vendidas | Compradas | % del total vendido | Última venta`.

Orden por defecto: **Vendidas descendente** — la pregunta es "qué modelos piden más funda", y lo que un cliente pide es una venta, no una decisión de compra del dueño (la compra es una reacción a la venta, no la demanda en sí; por eso la columna Compradas queda como referencia para comparar oferta contra demanda, no como el criterio de orden). Click en cualquier encabezado reordena, igual que la tabla de ranking de Micas.

Sin ventas todavía: `"Todavía no hay ventas registradas. Se registran en venta.html?id=<local>."`.

Piso de confiabilidad: un modelo con menos de 10 unidades vendidas en el periodo lleva una nota `"N unidades — aún es poco para asegurar que es tendencia."` junto al número, en vez de ocultarlo (a diferencia del piso de rotación, aquí no tiene sentido esconder un modelo nuevo del ranking, solo templar la lectura).

### C. Rotación por tipo

Tabla: `Tipo | Piezas emparejadas | Días (mediana) para venderse | Cobertura | Piezas sin compra que las respalde`. Orden: mediana de días ascendente (rota más rápido primero); los tipos por debajo del piso de 10 van al final, agrupados aparte con el rótulo "Insuficiente". Barra horizontal opcional al lado (mismo estilo que la dona de Micas) solo con los tipos que sí cruzan el piso — meter los insuficientes en la misma gráfica los haría ver comparables cuando no lo son.

### D. Qué lleva mucho sin venderse

Columnas: `Modelo | Tipo | Piezas del lote más viejo sin vender | Días esperando`. Se calcula tomando, por cada (modelo, tipo), el lote de compra más antiguo que todavía tiene `restantes > 0` después de correr el FIFO de §3, y mostrando los que llevan más de 60 días esperando (ajustable). Es la vista más accionable — candidatos a promoción o a dejar de reponer.

Caveat explícito en la pantalla, porque es la vista donde más fácil se saca una conclusión que no está soportada: `"Un modelo aquí puede significar que de verdad no se vende, o que se vendió y nadie lo anotó. No se puede distinguir un caso del otro con estos datos."`

### E. Tendencia mensual

Igual patrón que Micas (`spanGaps: false`, una línea por tipo, eje X solo con los meses que tienen datos) — piezas vendidas por mes. Con menos de 2 meses de datos, mismo mensaje de "acumulando datos" que ya usa Micas en su gráfica de tendencia; no es una vista nueva de diseñar, es una réplica directa.

### Qué NO se puede concluir con pocos datos (resumen, para no repetirlo en cada vista)

- Un solo mes de ventas no dice si hay estacionalidad — ni Navidad ni ninguna otra fecha se puede proyectar todavía (ver Etapa 5).
- Menos de 10 piezas emparejadas en un tipo: la "mediana de días" no es una velocidad de rotación, es el tiempo que tardaron esas pocas piezas específicas, que pudo ser suerte.
- Un modelo con una sola venta en el ranking no es "el modelo más pedido", es el primer dato que llegó — el piso de confiabilidad existe para no dejar que la tabla lo insinúe.

---

## 5. Normalización de modelos

**Decisión: reusar `analytics/aliases.csv`, un solo archivo, no uno separado para Fundas.**

Un iPhone 15 es el mismo modelo de teléfono compre mica o funda — el alias normaliza el **dispositivo**, no el accesorio. Si Fundas tuviera su propio CSV, el día que alguien agregue el alias `"15pm"` porque llegó una mica nueva, Fundas seguiría sin reconocerlo hasta que alguien se acuerde de replicar la fila en el segundo archivo, y en la práctica un archivo se va a quedar atrás del otro. Con un solo archivo, el dueño mantiene un único diccionario maestro de modelos, y el catálogo derivado de Fundas (Etapa 2) se beneficia directamente de todo el trabajo de normalización que ya existe para Micas (el `README.md:117-121` documenta convenciones como `a24`→Samsung a secas, `oppo a58` con prefijo, etc. — esas mismas convenciones aplican igual de bien a un modelo que compra funda).

Esto reusa, sin forkearlas, las dos funciones que hoy hacen la normalización en dos momentos distintos del flujo (y que hoy ya están un poco duplicadas entre sí — vale la pena que la implementación de Fundas las use tal cual en vez de escribir una tercera versión):

- **Al escribir** (en `lista-core.js`, dentro de `registrarCompraMica`/futuro `registrarCompraFunda`): `cargarAliases()` + `normalizarNombre()` (`lista-core.js:379-401`) — comparación exacta contra el CSV en minúsculas, sin acentos.
- **Al leer** (en `analytics.js`, dentro del render de cada tab): `claveNombre()` + `cargarAliases()` (`analytics/analytics.js`, sección "Normalización de nombres") — más agresiva, con las reglas de prefijo de iPhone/Samsung/OPPO, para agrupar variantes que la escritura no capturó.

`venta.html` usa la misma normalización de lectura (`claveNombre`) para hacer el match entre lo que se escribe en el buscador y el catálogo de modelos ya existente, y la misma normalización de escritura al guardar `fundas_ventas.modelo`.

---

## 6. Criterio de terminado y verificación por etapa

**Etapa 0 (terreno firme).** Ya resuelta en el código de `main`: `items/{id}`, `lista-core.js`, `locales/{id}`, `firestore.rules` versionado, `admins/{uid}`, `migrar.html`. Lo que sigue pendiente es la parte manual en producción, ya anotada en `Mejoras-futuras.md`: publicar `firestore.rules` en la consola de Firebase, activar Email/Password en Authentication y crear el usuario admin, correr `migrar.html` una sola vez. **Verificación:** abrir `admin.html` en producción y confirmar que pide login; en la consola de Firebase, confirmar que las reglas publicadas coinciden con el archivo del repo.

**Etapa 1 (cambio de formulario + `fundas_compras`).**
Terminado cuando:
- `fundaTypes` es radio en el formulario de Fundas, cantidad se calcula solo de colores.
- Cada alta de un ítem Fundas crea un doc en `fundas_compras` con `estado: 'pendiente'` y guarda su id en `items/{id}.analyticsId`.
- Palomear/despalomear/borrar-sin-palomear mueven `estado` igual que en Micas.

**Verificación:** agregar una funda de prueba en `local.html` (un color, un tipo); confirmar en la consola de Firestore que aparece en `fundas_compras` con `estado: 'pendiente'` y `cantidad: 1`. Palomearla y confirmar `estado: 'comprado'` + `comprado` con timestamp. Agregar otra y borrarla sin palomear; confirmar `estado: 'anulado'`. Marcar dos colores en una alta y confirmar `cantidad: 2`.

**Etapa 2 (catálogo derivado).**
Terminado cuando existe una función que lee `fundas_compras` (incluyendo `pendiente`, para no perder un modelo recién anotado) y devuelve modelos distintos normalizados, con conteo de piezas, fecha más reciente y desglose por local — consumible tanto por `analytics/index.html` como por `venta.html`.

**Verificación:** sembrar 5 documentos de prueba con 3 modelos distintos (algunos `pendiente`, alguno `anulado`); confirmar que el catálogo devuelve los 3 modelos con `pendiente` incluido y `anulado` excluido, con los conteos correctos.

**Etapa 3 (`venta.html` + `fundas_ventas`).**
Terminado cuando `venta.html?id=<local>` registra una venta con el flujo de 3 toques de §1 y crea el documento correcto en `fundas_ventas`; incluye deshacer.

**Verificación:** cronometrar con un teléfono real, con alguien que no diseñó la pantalla, el flujo completo desde que abre la página (ya con el catálogo cacheado) hasta el toast de confirmación, en 5 intentos seguidos — debe quedar por debajo de 10 segundos en todos. Confirmar además que el botón ✕ de "Ventas de hoy" marca `anulada: true` sin borrar el documento.

**Etapa 4 (Analytics).**
Terminado cuando el tab Fundas de `analytics/index.html` muestra las 5 vistas de §4 leyendo `fundas_compras`/`fundas_ventas`, con los mensajes de "datos insuficientes"/"acumulando datos" apareciendo exactamente cuando corresponde según los pisos definidos en §3-4.

**Verificación:** sembrar datos de prueba con un tipo por debajo de 10 piezas emparejadas y otro por encima; confirmar que el de abajo aparece marcado "Insuficiente" y nunca gana el destacado del resumen, y que el de arriba sí puede ganarlo. Sembrar una venta sin ninguna compra que la respalde y confirmar que aparece en el contador de "sin compra que las respalde" y no en el promedio de días.

**Etapa 5 (reposición).**
Terminado cuando existe una recomendación de reposición por modelo+tipo basada en ventas, **bloqueada hasta que haya al menos 6 semanas de historial de ventas** — igual criterio que la proyección de Micas (mínimo 2 meses antes de proyectar), pero más estricto porque una recomendación de reposición mueve dinero real y un supuesto FIFO sobre pocos datos puede estar sistemáticamente sesgado, no solo ruidoso.

**Verificación:** con menos de 6 semanas de datos sembrados, confirmar que la pantalla muestra "Acumulando datos" y ningún número; sembrar la semana 6 y confirmar que aparece la recomendación.

---

## 7. Riesgos

**El riesgo real es que nadie registre las ventas.** Todo de la Etapa 4 en adelante depende al cien por ciento de que una persona, de pie en el mostrador, se acuerde de tocar tres veces en un teléfono cada vez que vende algo — sin ningún respaldo automático (a diferencia de Hidrogel, que se alimenta de conversaciones que de todos modos ya pasaban por Claude vía `hidrogel-mcp`). El diseño de §1 minimiza la fricción, pero no puede garantizar el hábito. Si a la primera semana el dueño nota (por su propio conteo informal de caja) que se vendieron muchas más fundas de las que aparecen en `fundas_ventas`, el problema no es una pantalla más rápida — es que hace falta un recordatorio físico en el mostrador, o simplemente aceptar que el dato va a ser parcial e igual de útil como tendencia relativa (aunque el total absoluto esté subestimado).

**El supuesto FIFO puede estar sencillamente equivocado.** Si un local no rota su anaquel por antigüedad sino por lo que queda más a la mano, "tiempo desde que se compró" no mide "qué tan rápido se vende un tipo", mide el hábito de acomodo de esa persona. No hay forma de corregir esto con el esquema de datos que hay (no existe identidad por unidad física) — hay que aceptar la aproximación y decirla en pantalla (§3), no fingir una precisión que el dato no tiene.

**El cambio de checkbox a radio en `fundaTypes` (§0) rompe si alguien encuentra un bypass o si no se hace.** Sin ese cambio, `cantidad` en `fundas_compras` sigue siendo una mezcla de colores y tipos, y la rotación por tipo de la Etapa 4 se calcula sobre un número que no representa piezas reales de un tipo. Validar en el cliente (no dejar enviar sin un tipo seleccionado) y, si se quiere un cinturón extra, validar en las reglas de Firestore que `tipo` sea `string` y no `list`.

**La normalización va a fallar para modelos nuevos**, igual que ya le pasa a Micas hoy (`Mejoras-futuras.md` tiene pendiente revisar `a07` 9D, posible confusión cajas/piezas). Con Fundas el riesgo es mayor porque el universo de modelos Android es más fragmentado que el de iPhone. Mitigación: el catálogo derivado de la Etapa 2 sirve también como herramienta de auditoría — una vista (aunque sea informal, en la consola) de "modelos con muy pocas apariciones" para que el dueño decida si son alias faltantes o modelos raros de verdad.

**Un tipo con muy poco stock puede parecer que "rota más rápido" solo porque casi no había piezas para vender** (denominador chico). El piso de 10 piezas emparejadas (§3-4) existe exactamente para esto — repetirlo aquí porque es la trampa más fácil de caer si alguien mira el número sin mirar el conteo al lado.

**El botón "Registrar venta" explícito (en vez de auto-confirmar al tocar el tipo) cuesta un toque extra.** Es una decisión consciente de este documento (§1), no un descuido: se prioriza no generar ventas fantasma por un toque accidental, a costa de un segundo de más que sigue estando muy por debajo del límite de 10 segundos.

**Quien vende puede no estar seguro de qué tipo tiene en la mano.** Las 7 etiquetas de tipo (Magsafe, Transparente, 3 piezas, Diseño hombre, Diseño mujer, Uso rudo, Color) son útiles para pedir al proveedor, pero no necesariamente cómo alguien identifica a simple vista una funda ya revuelta en el aparador — sobre todo "Diseño hombre" vs "Diseño mujer" vs "Color" pueden solaparse a ojo. Si la persona adivina, esa incertidumbre contamina justo la pregunta de negocio 2 (rotación por tipo) sin que se note en ningún lado del dato — no hay forma de que el sistema detecte una adivinanza. Esto no lo resuelve el software; es un riesgo operativo que vale la pena decir en voz alta al entrenar a quien va a usar `venta.html`, no fingir que la captura es tan objetiva como parece en la pantalla.
