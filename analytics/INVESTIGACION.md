# Investigación: Sistema de Analytics de Micas — Accesorios-compras

**Fecha:** Abril 2026  
**Autor:** AlejandroGMota  
**Alcance:** Decisiones de visualización, algoritmos de proyección, normalización de datos y métricas clave para el módulo de analytics de micas del sistema Accesorios-compras.

---

## Índice

1. [Tipos de gráficas seleccionadas y justificación](#1-tipos-de-gráficas-seleccionadas-y-justificación)
2. [Algoritmos de proyección seleccionados](#2-algoritmos-de-proyección-seleccionados)
3. [Normalización de modelos (aliases)](#3-normalización-de-modelos-aliases)
4. [Métricas clave definidas](#4-métricas-clave-definidas)
5. [Limitaciones del sistema y cómo comunicarlas al usuario](#5-limitaciones-del-sistema-y-cómo-comunicarlas-al-usuario)
6. [Evolución futura del sistema (roadmap analítico)](#6-evolución-futura-del-sistema-roadmap-analítico)

---

## 1. Tipos de gráficas seleccionadas y justificación

### 1.1 Donut chart — Distribución por tipo de mica

**Por qué donut y no pie**

El gráfico de pie tradicional y el donut representan la misma información: partes de un todo expresadas como proporción del 360°. La diferencia decisiva está en el espacio central del donut. Ese hueco no es decorativo: es un área de información de alta densidad visual donde se puede imprimir el total acumulado (por ejemplo, "342 micas") sin saturar el gráfico con etiquetas flotantes.

En un gráfico de pie estándar el texto del total compite con las etiquetas de los segmentos y con la leyenda. El ojo tiene que saltar entre el gráfico y una cifra aislada. El donut resuelve eso porque el total queda en el centro geométrico de la figura, que es el punto focal natural de la vista cuando el gráfico está en reposo.

Adicionalmente, algunos estudios de cognición visual (Cleveland & McGill, 1984) demuestran que los seres humanos son mejores comparando longitudes y posiciones que áreas. El donut mitiga parcialmente la desventaja de los gráficos circulares porque los arcos que genera son más fáciles de comparar que los sectores llenos del pie, especialmente cuando los segmentos son entre 3 y 5 categorías — exactamente el caso de este sistema (9D, 9H, Privacidad).

**Cuándo es útil y cuándo puede engañar**

El donut es útil cuando:
- Hay entre 3 y 6 categorías. Con más, los arcos pequeños pierden legibilidad.
- La pregunta de negocio es "¿qué porción del total representa cada categoría?" y no "¿cuánto exactamente vendí de cada una?".
- El total tiene significado por sí mismo (número de micas compradas en el periodo).

El donut puede engañar cuando:
- Los datos son escasos. Si en el primer mes hay 3 micas (2 de tipo 9D y 1 de tipo 9H), el donut muestra 67% / 33% con el mismo peso visual que si hubiera 300 micas. El porcentaje es matemáticamente correcto pero estadísticamente frágil. **Mitigation:** mostrar el `n` total en el centro del donut (no solo el porcentaje) y añadir un aviso cuando `n < 10`.
- Todos los segmentos son muy similares (ej. 32%, 34%, 34%). El ojo percibe los arcos como idénticos aunque exista diferencia real. En ese caso, una tabla o bar chart horizontal comunica mejor las diferencias marginales.

**Cómo interpretarlo en este contexto**

El tipo 9D tiene precio de compra de $60, el 9H de $35 y el de Privacidad de $18 (según la lógica de `app.js`). Son productos distintos con rangos de precio muy diferentes. La distribución del donut por tipo responde directamente a una pregunta de decisión de compra: ¿en qué tipo concentrar el presupuesto del siguiente pedido?

Regla práctica de interpretación:

- Si 9D domina con más del 60% del volumen: hay una preferencia clara del mercado local por pantallas de mayor calidad percibida. Los pedidos deben priorizar 9D y dejar 9H como complemento.
- Si Privacidad supera el 25%: hay un nicho activo (usuarios corporativos, ejecutivos) que justifica mantener stock variado de ese tipo.
- Si los tres tipos están entre 30%–40%: demanda equilibrada, pedidos proporcionales.

Ejemplo numérico: En un periodo con 80 micas vendidas — 52 de tipo 9D, 20 de tipo 9H y 8 de Privacidad — el donut mostraría 65% / 25% / 10%. El centro mostraría "80 micas". Conclusión directa: siguiente pedido con al menos 60% del presupuesto en 9D.

---

### 1.2 Line chart — Tendencia mensual

**Por qué líneas y no barras para tendencias temporales**

Las barras son superiores cuando la pregunta es comparar magnitudes entre categorías en un mismo punto del tiempo (ej. "¿cuántas micas se vendieron en marzo vs. abril?"). Las líneas son superiores cuando la pregunta es observar la dirección del cambio a lo largo del tiempo.

La razón es cognitiva: la línea crea un trazo continuo que el ojo interpreta como movimiento. El cerebro extrapola naturalmente la dirección de una línea, lo cual facilita la percepción de tendencias ascendentes o descendentes incluso sin leer los valores exactos. Una secuencia de barras, en cambio, requiere que el cerebro compare alturas discretas y reconstruya mentalmente la tendencia.

En Chart.js, el line chart con `tension: 0.3` (curva suavizada) reduce la percepción de zigzags bruscos que en series cortas pueden parecer falsas crisis o falsas recuperaciones. La tensión no altera los datos, solo la representación visual entre puntos.

**Problema con datos escasos (primeros meses)**

Con datos acumulados desde cero, los primeros meses tienen muy pocos puntos. Una línea con 2 puntos es técnicamente una tendencia, pero estadísticamente no lo es: no distingue entre una tendencia real y variación aleatoria.

Estrategias de mitigación visual:

1. **Mostrar puntos (dots) grandes:** Cuando hay pocos datos, los puntos individuales deben ser visibles. Configurar `pointRadius: 6` en Chart.js cuando `n < 4` y reducirlo a `pointRadius: 3` cuando hay más datos. Así el usuario ve exactamente cuántos datos respaldan la línea.
2. **Área bajo la curva:** Activar `fill: true` con opacidad baja (~15%) crea una referencia visual del volumen acumulado. No es estadísticamente significativa, pero orienta al ojo.
3. **Etiqueta de confianza:** Mostrar en el título del gráfico el número de meses con datos: "Tendencia mensual (3 meses de datos)". Esto da contexto sin alterar la visualización.

**Diferencia entre tendencia real y ruido estadístico con n pequeño**

El ruido estadístico es variación que no corresponde a ningún patrón real sino a la aleatoriedad inherente de cualquier proceso. Con n pequeño (menos de 4-5 puntos por serie), prácticamente cualquier secuencia puede parecer una tendencia.

Ejemplo concreto: si en enero se vendieron 5 micas 9D, en febrero 3 y en marzo 8, la línea dibuja una V. ¿Hay una tendencia de recuperación? No se puede saber. Tres meses no son suficientes para distinguir una V real de tres puntos aleatorios de una distribución con media 5 y desviación 2.

**Regla práctica: mínimo 3 puntos por serie para mostrar tendencias**

- Con 1 punto: no renderizar la línea. Mostrar solo el punto con la etiqueta del valor.
- Con 2 puntos: renderizar la línea pero agregar un aviso textual: "Datos insuficientes para tendencia confiable."
- Con 3 o más puntos: renderizar normalmente. A partir de 3 puntos la dirección general empieza a tener algo de respaldo, especialmente si los tres apuntan en la misma dirección.
- Con 6 o más puntos: la tendencia es interpretable con razonable confianza para decisiones operativas simples (stock de corto plazo).

La regla de 3 puntos mínimos no es un estándar estadístico formal (para eso se necesitarían tests de significancia). Es una heurística operativa calibrada para decisiones de inventario de bajo costo de error, donde es preferible actuar sobre una señal débil que no actuar por ausencia de certeza absoluta.

---

### 1.3 Bar chart horizontal — Ranking de modelos

**Por qué horizontal y no vertical**

Los nombres de los modelos de celular son inherentemente largos: "iPhone 15 Pro Max", "Samsung Galaxy S24 Ultra", "Redmi Note 13 Pro+". En un bar chart vertical, estos nombres van en el eje X y deben rotarse para caber, lo que obliga al usuario a inclinar la cabeza o el dispositivo. En un bar chart horizontal, los nombres van en el eje Y y pueden leerse directamente de izquierda a derecha.

Adicionalmente, el bar chart horizontal escala mejor con muchos modelos. Si hay 20 modelos en el ranking, un chart vertical necesita un ancho enorme o un scroll horizontal. Uno horizontal necesita más altura, que es el eje natural de scroll en dispositivos móviles.

**Ordenamiento descendente**

El ranking debe ordenarse siempre de mayor a menor cantidad (barra más larga arriba). Razones:

1. El modelo con mayor rotación es el más relevante para la decisión de compra. Debe estar en el primer lugar visual.
2. El ojo escanea de arriba hacia abajo. Con orden descendente, el usuario recibe primero la información más accionable.
3. Los modelos en declive o con pocas ventas quedan al fondo, donde llegar requiere interés explícito del usuario.

En Chart.js, ordenar los datos antes de pasarlos al gráfico:

```javascript
const sorted = models.sort((a, b) => b.quantity - a.quantity);
```

**Truncamiento de nombres largos**

Los nombres de más de ~20 caracteres deben truncarse en la etiqueta del eje Y con puntos suspensivos, mostrando el nombre completo en el tooltip al hacer hover. En Chart.js:

```javascript
yAxis: {
  ticks: {
    callback: (value) => value.length > 20 ? value.slice(0, 18) + '...' : value
  }
}
```

Esto mantiene el gráfico limpio sin perder información: la etiqueta truncada ubica el modelo, el tooltip confirma el nombre completo.

---

## 2. Algoritmos de proyección seleccionados

### 2.1 Promedio móvil simple (SMA)

**Fórmula**

```
SMA(n) = (x₁ + x₂ + ... + xₙ) / n
```

donde `x₁...xₙ` son las cantidades vendidas en los últimos `n` meses (los más recientes).

**Por qué n=2 (últimos 2 meses) en la fase inicial**

Cuando el sistema lleva pocos meses con datos, usar n grande tiene dos problemas:

1. **Datos insuficientes:** Si solo hay 3 meses de datos y se usa n=6, la proyección incluye meses con cero que arrastran el promedio hacia abajo artificialmente, subestimando la demanda real.
2. **Sensibilidad baja:** Un promedio sobre muchos meses tarda en reflejar cambios recientes. Si el iPhone 15 Pro empezó a venderse bien en los últimos dos meses, un SMA de 6 meses mezclaría eso con cuatro meses de demanda baja y generaría una proyección conservadora que lleva a substock.

Con n=2, la proyección es sensible a los últimos dos meses, que son los más relevantes para decisiones de compra a 30 días. La fórmula en JavaScript:

```javascript
function sma2(monthlyData) {
  // monthlyData: array ordenado cronológicamente de {mes, cantidad}
  const last2 = monthlyData.slice(-2);
  if (last2.length < 2) return null; // datos insuficientes
  return (last2[0].cantidad + last2[1].cantidad) / 2;
}
```

Ejemplo: el iPhone 15 Pro tuvo 12 micas en febrero y 15 en marzo. `SMA(2) = (12 + 15) / 2 = 13.5`. Proyección para abril: 14 unidades (redondeado al entero superior para no quedar corto).

**Limitaciones: no detecta tendencias**

El SMA asume que el futuro será el promedio del pasado reciente. No sabe si las ventas van subiendo o bajando; solo promedia. Si el iPhone 15 Pro tiene 5, 10, 15, 20 micas en los últimos cuatro meses (crecimiento lineal claro), `SMA(2) = (15+20)/2 = 17.5`. La proyección correcta por extrapolación sería ~25. El SMA subestima en tendencias ascendentes y sobreestima en descendentes.

**Cuándo evolucionar a WMA**

Cuando se tengan 4 o más meses de datos por modelo, el WMA es superior porque pondera los meses recientes más que los lejanos, capturando así la dirección del cambio. La transición debe ser gradual: primero verificar que el modelo tiene suficiente historial antes de cambiar el algoritmo para ese modelo específico.

---

### 2.2 Promedio móvil ponderado (WMA) — para cuando haya más de 4 meses

**Concepto**

El WMA asigna pesos distintos a cada mes, donde el mes más reciente tiene el mayor peso. Esto hace que la proyección refleje mejor la tendencia actual sin descartar completamente el historial.

**Fórmula con pesos [1, 2, 3] para 3 meses**

```
WMA(3) = (x₁×1 + x₂×2 + x₃×3) / (1+2+3)
WMA(3) = (x₁ + 2x₂ + 3x₃) / 6
```

donde `x₃` es el mes más reciente, `x₂` el anterior y `x₁` el más lejano de los tres.

Ejemplo con el mismo iPhone 15 Pro: 10 unidades en enero, 13 en febrero, 18 en marzo.

```
WMA(3) = (10×1 + 13×2 + 18×3) / 6
       = (10 + 26 + 54) / 6
       = 90 / 6
       = 15
```

Comparado con `SMA(3) = (10+13+18)/3 = 13.7`. El WMA proyecta 15 vs el SMA que proyecta 14. La diferencia de 1 unidad puede parecer trivial, pero en un modelo muy demandado puede ser la diferencia entre quedar corto o tener stock suficiente.

**Implementación**

```javascript
function wma3(monthlyData) {
  const last3 = monthlyData.slice(-3);
  if (last3.length < 3) return sma2(monthlyData); // fallback a SMA si no hay suficiente historial
  const weights = [1, 2, 3];
  const weightSum = weights.reduce((a, b) => a + b, 0); // 6
  const weighted = last3.reduce((sum, item, i) => sum + item.cantidad * weights[i], 0);
  return weighted / weightSum;
}
```

**Cuándo usar WMA vs SMA**

| Condición | Algoritmo recomendado |
|-----------|----------------------|
| Menos de 3 meses de datos para ese modelo | SMA con n=2 |
| 3-4 meses de datos, ventas estables | SMA con n=2 o n=3 |
| 4+ meses de datos, crecimiento o caída visible | WMA con pesos [1, 2, 3] |
| 6+ meses de datos, patron estacional claro | WMA + factor estacional |

---

### 2.3 Factor estacional de diciembre

**Justificación**

El negocio tiene un único factor estacional identificado con certeza: diciembre concentra aproximadamente 30% más ventas que el promedio mensual del año. Esto responde a patrones conocidos en el mercado mexicano de accesorios de celular: temporada navideña, compra de regalos, bonos de fin de año y promociones de fin de año.

Dado que este factor está documentado a partir de experiencia operativa directa, no requiere inferencia estadística. Es un ajuste determinístico basado en conocimiento del dominio.

**Cómo aplicarlo**

```
proyección_diciembre = SMA(2) × 1.3
```

O con WMA cuando haya datos suficientes:

```
proyección_diciembre = WMA(3) × 1.3
```

Ejemplo: el SMA de los últimos dos meses (octubre y noviembre) para el iPhone 16 es 8 unidades. La proyección base para diciembre sería 8, pero con el factor estacional:

```
proyección_diciembre = 8 × 1.3 = 10.4 ≈ 11 unidades
```

El redondeo siempre debe ser al entero superior (`Math.ceil`) para pedidos de stock, porque quedar corto en diciembre es más costoso que tener una unidad extra.

**Implementación**

```javascript
function proyectarMes(monthlyData, targetMonth) {
  const base = monthlyData.length >= 3 ? wma3(monthlyData) : sma2(monthlyData);
  const factor = targetMonth === 12 ? 1.3 : 1.0;
  return base ? Math.ceil(base * factor) : null;
}
```

**Por qué no usar modelos ARIMA o Prophet**

ARIMA (AutoRegressive Integrated Moving Average) y Prophet (de Meta) son herramientas poderosas para series temporales. Sin embargo, tienen requerimientos que este sistema no puede satisfacer:

1. **Cantidad de datos:** ARIMA requiere típicamente entre 30 y 50 puntos de datos para parámetros confiables. Prophet recomienda al menos 2 años de datos para capturar patrones estacionales. Este sistema parte desde cero y en los primeros años tendrá meses de datos, no años.

2. **Complejidad de implementación:** ARIMA requiere diagnóstico de parámetros (p, d, q) que cambian por modelo. Prophet requiere una librería pesada incompatible con el stack vanilla JS del proyecto. El mantenimiento de estos modelos requiere conocimiento estadístico especializado para ajustar cuando los datos cambien.

3. **Un solo factor estacional conocido:** El objetivo de modelos complejos como ARIMA es descubrir patrones que no conocemos. Aquí ya conocemos el único factor relevante (diciembre +30%). Un multiplicador de 1.3 comunica exactamente lo mismo que cualquier modelo de series temporales entrenado con los mismos datos, con fracción de la complejidad.

4. **Sensibilidad al error:** Con pocos datos, un modelo ARIMA mal especificado produce proyecciones peores que un promedio simple. El riesgo de error aumenta con la complejidad del modelo cuando n es pequeño.

La regla de parsimonia estadística (principio de Occam aplicado al modelado) indica: usar el modelo más simple que sea suficiente para la decisión. Para este caso, SMA/WMA + factor diciembre es suficiente.

---

### 2.4 Detección de crecimiento y declive

**Método**

Comparar las ventas del mes actual con el mes anterior para clasificar cada modelo en tres estados:

```
si mes_actual > mes_anterior × 1.1  →  CRECIENDO  (↑)
si mes_actual < mes_anterior × 0.9  →  DECLINANDO  (↓)
si entre 0.9 y 1.1                  →  ESTABLE     (→)
```

El umbral del 10% (factores 1.1 y 0.9) evita que variaciones pequeñas e insignificantes se etiqueten como tendencias. Una venta de diferencia en un modelo de baja rotación no es una tendencia; es ruido.

**Indicadores visuales**

- `↑` en verde (#22c55e): el modelo está ganando demanda. Priorizar en el siguiente pedido.
- `↓` en rojo (#ef4444): el modelo está perdiendo demanda. Reducir o eliminar del pedido.
- `→` en amarillo (#f59e0b): demanda estable. Mantener mismo nivel de stock.

Implementación en JavaScript:

```javascript
function detectarTendencia(mesActual, mesAnterior) {
  if (mesAnterior === 0) return { estado: 'nuevo', icono: '✦', color: '#3b82f6' };
  const ratio = mesActual / mesAnterior;
  if (ratio > 1.1) return { estado: 'creciendo', icono: '↑', color: '#22c55e' };
  if (ratio < 0.9) return { estado: 'declinando', icono: '↓', color: '#ef4444' };
  return { estado: 'estable', icono: '→', color: '#f59e0b' };
}
```

**Limitación crítica con datos escasos**

Este es el caso más importante de falsa señal en el sistema: cuando un modelo tiene volúmenes bajos, una diferencia de 1-2 unidades produce cambios de porcentaje enormes.

Ejemplo concreto: iPhone 15 en enero = 1 mica, en febrero = 2 micas.

```
ratio = 2/1 = 2.0
```

El sistema indicaría `↑` crecimiento del 100%. Pero la diferencia real es 1 unidad. No se puede distinguir si hubo una demanda real creciente o simplemente un cliente extra que llegó por casualidad.

**Regla de supresión por volumen mínimo:** No mostrar indicadores de tendencia cuando el máximo de los dos meses es menor que un umbral mínimo (recomendado: 3 unidades). En su lugar, mostrar "Pocos datos":

```javascript
function tendenciaConfiable(mesActual, mesAnterior, umbralMinimo = 3) {
  if (Math.max(mesActual, mesAnterior) < umbralMinimo) return null; // no mostrar tendencia
  return detectarTendencia(mesActual, mesAnterior);
}
```

Esta supresión evita que el usuario tome decisiones de compra basadas en señales estadísticamente inválidas.

---

## 3. Normalización de modelos (aliases)

### 3.1 El problema: fragmentación falsa en el ranking

El ranking de modelos es tan confiable como la calidad de los nombres ingresados. En un sistema donde el nombre se captura manualmente con texto libre, el mismo modelo puede aparecer con decenas de variantes:

- "iphone 15 pro"
- "ip15pro"
- "iPhone 15 Pro"
- "i15pro"
- "Iphone15Pro"
- "iphone15 pro"

Sin normalización, el ranking mostraría seis entradas distintas con 1-3 unidades cada una, en lugar de una sola entrada con el total real. Esto produce tres errores de decisión:

1. **Subestimación de demanda:** El modelo parece menos popular de lo que realmente es.
2. **Distorsión del ranking:** Modelos con nombre consistente parecen más relevantes.
3. **Proyecciones incorrectas:** Las proyecciones se calculan por modelo; si el modelo está fragmentado, cada fragmento proyecta individualmente con muy pocos datos.

### 3.2 Solución: CSV de aliases local

**Por qué CSV local y no reglas en Firestore**

Firestore cobra por lectura de documentos. Un catálogo de aliases consultado en cada análisis podría consumir decenas o cientos de reads diarios sin aportar valor analítico real. El CSV es un archivo estático servido por GitHub Pages sin costo adicional.

Otras ventajas del CSV:

- **Edición simple:** Se actualiza con cualquier editor de texto o incluso desde la interfaz de GitHub en el navegador. No requiere consola de Firebase ni deploy especial.
- **Versionado en git:** Cada alias añadido queda registrado en el historial de commits. Si se añade un alias erróneo, el rollback es inmediato con `git revert`.
- **Sin latencia de Firestore:** La normalización ocurre en el cliente con datos ya descargados.
- **Portabilidad:** Si en el futuro se migra de Firestore a otra base de datos, el CSV de aliases no cambia.

**Estructura del CSV**

```csv
alias,modelo_canonical
iphone 15 pro,iPhone 15 Pro
ip15pro,iPhone 15 Pro
i15pro,iPhone 15 Pro
iphone15pro,iPhone 15 Pro
samsung s24,Samsung Galaxy S24
s24,Samsung Galaxy S24
s24+,Samsung Galaxy S24+
redmi note 13,Redmi Note 13
```

Columnas:
- `alias`: la variante tal como se ingresó en el sistema (en minúsculas para comparación case-insensitive)
- `modelo_canonical`: el nombre normalizado que se usará en analytics y en el ranking

**Cómo parsearlo con fetch() + split()**

```javascript
async function cargarAliases() {
  const response = await fetch('/analytics/aliases.csv');
  const text = await response.text();
  const lines = text.trim().split('\n').slice(1); // omitir header
  const mapa = {};
  for (const line of lines) {
    const [alias, canonical] = line.split(',');
    if (alias && canonical) {
      mapa[alias.trim().toLowerCase()] = canonical.trim();
    }
  }
  return mapa;
}

function normalizarNombre(nombre, aliasMap) {
  const key = nombre.trim().toLowerCase();
  return aliasMap[key] || nombre.trim(); // si no hay alias, usar el nombre original
}
```

El `|| nombre.trim()` es crítico: si un modelo no tiene alias definido, no falla ni lo elimina; simplemente lo pasa tal cual. El sistema siempre muestra algo, aunque no esté normalizado.

**Estrategia de crecimiento del CSV**

El archivo crece orgánicamente con el uso. Cuando se detecte en el ranking una fragmentación (mismo modelo con variantes distintas), se agrega una línea al CSV. No se requiere deploy especial: el archivo está en el repositorio y GitHub Actions lo publica automáticamente.

Con el tiempo el CSV converge hacia un catálogo completo de variantes conocidas. Después de 3-6 meses de uso activo, la mayoría de los modelos frecuentes ya tendrán sus aliases mapeados y las entradas nuevas serán excepciones.

---

### 3.3 Fuzzy matching — descartado

**Por qué no implementar fuzzy matching automático**

El fuzzy matching (coincidencia aproximada por distancia de edición, como Levenshtein) parece una solución elegante al problema de las variantes, pero tiene problemas graves en este contexto:

1. **Falsos positivos de alta consecuencia:**
   - "iPhone 11" y "iPhone 11 Pro" difieren en 4 caracteres. El fuzzy matching podría agruparlos como el mismo modelo. Son productos distintos con precios de mica diferentes.
   - "Galaxy S23" y "Galaxy S24" difieren en 1 carácter. Falso positivo casi garantizado.
   - "Redmi Note 12" y "Redmi Note 13" difieren en 1 carácter. Mismo problema.

2. **Complejidad de umbral:** No existe un umbral de distancia que funcione bien para todos los casos. Un umbral permisivo agrupa modelos distintos; uno conservador no normaliza nada.

3. **No hay forma de corregir errores silenciosamente:** Si el fuzzy matching agrupa dos modelos incorrectamente, el analista no lo sabe. Las proyecciones son incorrectas sin ningún indicador. Con el CSV, cada mapeo es explícito y auditable.

4. **Dependencia de librería externa:** Implementar fuzzy matching robusto requiere una librería (Fuse.js, etc.) que añade peso al bundle y una dependencia de mantenimiento. El CSV no añade ninguna dependencia.

**El CSV manual es más preciso y mantenible para este volumen**

Para un negocio con decenas o pocos cientos de modelos distintos, el CSV manual ofrece precisión absoluta con mínimo esfuerzo. El fuzzy matching automatizado tiene sentido cuando el volumen de datos nuevos es demasiado alto para revisión manual (miles de SKUs nuevos por día). Ese no es el caso aquí.

---

## 4. Métricas clave definidas

Las siguientes métricas son las que el sistema debe calcular y presentar. Para cada una se especifica qué mide, cómo se calcula y qué decisión operativa habilita.

| Métrica | Cálculo | Decisión que habilita |
|---------|---------|----------------------|
| Velocidad de venta | `total_cantidad / meses_con_datos` por modelo | Cuánto stock pedir por modelo en el próximo pedido |
| Participación por tipo | `cantidad_tipo / total_micas × 100` | Qué tipos priorizar en pedidos y con qué proporción de presupuesto |
| Crecimiento mensual | `(mes_actual - mes_anterior) / mes_anterior × 100` | Qué modelos están ganando terreno y merecen más stock |
| ROI por tipo | `precio_venta - precio_compra` (no disponible aún) | Rentabilidad comparada entre tipos para decisiones de margen |

### 4.1 Velocidad de venta

**Qué mide:** El promedio de unidades compradas por mes para un modelo específico, usando todos los meses en que hay al menos un dato.

**Cálculo:**
```javascript
function velocidadVenta(historialModelo) {
  const mesesConDatos = historialModelo.filter(m => m.cantidad > 0);
  if (mesesConDatos.length === 0) return 0;
  const total = mesesConDatos.reduce((sum, m) => sum + m.cantidad, 0);
  return total / mesesConDatos.length;
}
```

Nota importante: se divide entre los meses con datos, no entre todos los meses del calendario. Si el iPhone 15 Pro se empezó a vender en marzo y hoy es junio, son 4 meses de datos, no los 12 del año. Dividir entre 12 subestimaría la velocidad real del modelo.

**Decisión que habilita:** Si la velocidad de venta del iPhone 16 Pro es 8 unidades/mes y el proveedor tarda 5 días en entregar, el stock mínimo de seguridad es `8 / 30 × 5 ≈ 1.3 unidades`. Pedir cuando el stock llegue a 2 unidades.

### 4.2 Participación por tipo

**Qué mide:** La fracción del total de micas que corresponde a cada tipo (9D, 9H, Privacidad) en el periodo analizado.

**Cálculo:**
```javascript
function participacionPorTipo(compras) {
  const totales = { '9D': 0, '9H': 0, 'Privacidad': 0 };
  compras.forEach(c => { totales[c.tipo] = (totales[c.tipo] || 0) + c.cantidad; });
  const total = Object.values(totales).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(totales).map(([tipo, cant]) => [tipo, total > 0 ? cant / total * 100 : 0])
  );
}
```

**Decisión que habilita:** Si 9D tiene 70% de participación y el presupuesto del pedido es $5,000, asignar ~$3,500 a micas 9D (70%), ~$1,000 a 9H (20%) y ~$500 a Privacidad (10%). La distribución de presupuesto refleja la distribución de demanda real.

### 4.3 Crecimiento mensual

**Qué mide:** El cambio porcentual en ventas de un modelo entre el mes actual y el anterior.

**Cálculo:**
```javascript
function crecimientoMensual(mesActual, mesAnterior) {
  if (mesAnterior === 0) return mesActual > 0 ? Infinity : 0;
  return ((mesActual - mesAnterior) / mesAnterior) * 100;
}
```

**Decisión que habilita:** Modelos con crecimiento mayor a +20% en los últimos dos meses son candidatos a aumentar el stock del próximo pedido. Modelos con caída mayor a -20% son candidatos a reducir o eliminar del pedido. La métrica también sirve para detectar modelos de celular que acaban de lanzarse (crecimiento explosivo desde cero).

### 4.4 ROI por tipo (pendiente)

**Estado actual:** El sistema registra precios de compra (`precio` en Firestore). No registra precios de venta porque el flujo actual es de gestión de inventario de compras, no de punto de venta.

**Cálculo futuro (cuando se añada precio de venta):**
```
margen_bruto = precio_venta - precio_compra
roi_porcentaje = (margen_bruto / precio_compra) × 100
```

**Decisión que habilitará:** Comparar rentabilidad entre tipos. Ejemplo: si 9D tiene margen del 150% y 9H del 80%, aunque ambos tengan la misma participación por volumen, invertir más en 9D genera más utilidad por peso invertido.

---

## 5. Limitaciones del sistema y cómo comunicarlas al usuario

La transparencia sobre las limitaciones no es una señal de debilidad del sistema; es la diferencia entre un dashboard que infunde confianza real y uno que genera decisiones erróneas con apariencia de certeza.

### 5.1 Menos de 2 meses de datos: proyecciones no confiables

**Qué sucede:** Con un solo mes de datos, el SMA(2) no puede calcularse. Cualquier proyección sería simplemente repetir el único mes disponible, que no es una proyección sino una suposición.

**Cómo comunicarlo:** Reemplazar el valor de proyección por un mensaje de estado:

```
Acumulando datos (X días de historial)
```

Donde X es el número de días desde el primer registro en la colección `analytics/micas_compras`. Este mensaje da contexto positivo (el sistema está recopilando, no fallando) y comunica cuánto tiempo falta para tener proyecciones.

**Implementación:**
```javascript
function textoProyeccion(proyeccion, diasDeHistorial) {
  if (diasDeHistorial < 45) return `Acumulando datos (${diasDeHistorial} días)`;
  if (proyeccion === null) return 'Sin datos suficientes';
  return `${proyeccion} unidades estimadas`;
}
```

El umbral de 45 días (aproximadamente 1.5 meses) es deliberado: con menos de ese tiempo es imposible tener 2 meses completos de datos para calcular SMA(2).

### 5.2 Crecimiento inflado por volúmenes bajos

**Qué sucede:** 1 venta en el mes anterior y 2 en el actual produce un indicador de "crecimiento del 100%". Matemáticamente correcto, estadísticamente inútil.

**Cómo comunicarlo:** Junto al indicador de crecimiento, mostrar el volumen base:

```
↑ +100%  (base: 1 → 2 unidades)  ⚠ Volumen bajo
```

El aviso `⚠ Volumen bajo` aparece automáticamente cuando el máximo de los dos meses es menor que el umbral mínimo (recomendado: 3 unidades). Esto no suprime el dato, lo contextualiza.

**Por qué no suprimirlo completamente:** Aunque el porcentaje no sea confiable, el hecho de que un modelo pasó de 1 a 2 ventas puede ser la primera señal de un modelo emergente. Suprimirlo ocultaría esa información potencialmente valiosa. La solución correcta es mostrarlo con su caveat, no esconderlo.

### 5.3 Precios en Firestore son de compra, no de venta

**Qué sucede:** Los campos `precio` en los documentos de `analytics/micas_compras` corresponden al precio al que se compra la mica al proveedor. Las proyecciones basadas en estos precios reflejan inversión de compra, no ingresos de venta ni utilidad.

**Cómo comunicarlo:** En cualquier vista que muestre montos proyectados, incluir una aclaración visible:

```
Proyección de inversión: $X.XX
(Basada en precios de compra — no incluye precio de venta ni margen)
```

Esta distinción es crítica para evitar que el usuario interprete "inversión proyectada de $800" como "ingresos esperados de $800".

---

## 6. Evolución futura del sistema (roadmap analítico)

El sistema está diseñado para crecer incrementalmente. Cada fase añade valor sin romper la fase anterior.

### Fase 1 — Actual: Analytics de micas, proyecciones simples

**Estado:** En implementación.

**Componentes:**
- Registro de compras de micas en Firestore (`analytics/micas_compras`)
- Visor `micas-analytics.html` con donut chart, line chart y bar chart horizontal
- Proyecciones SMA(2) con factor estacional de diciembre
- Detección de crecimiento/declive por modelo
- Normalización de nombres vía CSV de aliases

**Decisiones que habilita:** ¿Cuánto stock de qué modelos y tipos pedir en el próximo pedido?

### Fase 2 — Fundas al mismo sistema analítico

**Cuándo activar:** Cuando el volumen de fundas registradas sea suficiente para que el análisis sea significativo (estimado: 3+ meses de datos de fundas).

**Cambios necesarios:**
- Añadir registro de compras de fundas en `analytics/fundas_compras` con estructura análoga a la de micas.
- Añadir sección de fundas al visor de analytics (o crear `fundas-analytics.html` separado).
- El sistema de aliases necesita un CSV separado para fundas, ya que los modelos de celular son los mismos pero los tipos de producto son distintos.

**Nuevas métricas relevantes para fundas:**
- Participación por tipo de funda (Magsafe, Transparente, 3 piezas, etc.)
- Participación por color
- Combinación tipo+color más vendida

### Fase 3 — Correlación con lanzamientos de celulares

**Concepto:** El archivo `fundas-lanzadas.html` ya registra lanzamientos de modelos nuevos de celular. La Fase 3 conecta esa información con el historial de ventas de micas y fundas para responder: ¿cuántas semanas después del lanzamiento de un modelo nuevo empiezan a venderse sus accesorios?

**Valor de negocio:** Anticipar qué micas comprar cuando se anuncia un modelo nuevo, antes de que haya demanda confirmada. Hoy ese tipo de anticipación es puramente intuitiva; la Fase 3 la haría basada en datos históricos.

**Implementación tentativa:**
- Para cada modelo nuevo registrado en `fundas-lanzadas.html`, calcular el "tiempo de arranque" (semanas desde lanzamiento hasta la primera venta de mica/funda de ese modelo).
- Con suficiente historial, calcular el promedio de tiempo de arranque por fabricante (Apple suele tener accesorios disponibles antes del lanzamiento; Samsung tarda más, etc.).
- Usar ese promedio para recomendar cuándo iniciar el pedido de accesorios de un modelo anunciado pero no lanzado.

**Requerimiento de datos:** Esta fase necesita al menos 6-10 modelos con historial completo (lanzamiento + historial de ventas) para que la correlación sea significativa. Es una fase de largo plazo (12-18 meses después de la Fase 1).

### Fase 4 — Margen real: precio de venta vs. precio de compra

**Concepto:** Añadir al sistema un campo de precio de venta (o un multiplicador de margen por tipo) para calcular rentabilidad real, no solo volumen de demanda.

**Cambios necesarios:**
- Capturar el precio de venta al momento de cada transacción (requiere integrar el sistema con el punto de venta, o añadir un campo manual en el formulario de analytics).
- Alternativamente, definir un precio de venta estándar por tipo (configurable en un CSV separado) y calcular el margen como `precio_venta_tipo - precio_compra_registrado`.

**Métricas que habilita:**
- Margen bruto por modelo: `(precio_venta - precio_compra) × cantidad`
- Tasa de retorno sobre inventario: `margen_bruto / inversión_en_stock`
- Ranking de modelos por rentabilidad (actualmente el ranking es por volumen, no por margen)

**Consideración:** La Fase 4 convierte el sistema de un tracker de inventario a un sistema de análisis de rentabilidad. Es un salto cualitativo que requiere disciplina en la captura de precios de venta. Implementarla prematuramente, antes de que el registro de compras sea consistente, produce datos de margen incorrectos que son peores que no tener datos de margen.

**Criterio para activar Fase 4:** Al menos 6 meses de historial de compras limpio en Firestore y un proceso claro para capturar precios de venta en cada transacción.

---

## Referencias y fundamentos

- Cleveland, W.S. & McGill, R. (1984). Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods. *Journal of the American Statistical Association*, 79(387), 531-554. — Base teórica de por qué las líneas y posiciones son más fáciles de comparar que los ángulos y áreas.

- Chart.js Documentation (v4.x) — `https://www.chartjs.org/docs/` — Referencia de implementación para donut, line y bar charts con configuración de tooltips, tensión de curvas y callbacks de ejes.

- Hyndman, R.J. & Athanasopoulos, G. (2021). *Forecasting: Principles and Practice* (3rd ed.). OTexts. — Capítulos 3 y 6: promedio móvil simple, weighted moving average y limitaciones con series cortas.

- Makridakis, S., Spiliotis, E. & Assimakopoulos, V. (2018). Statistical and Machine Learning forecasting methods: Concerns and ways forward. *PLOS ONE*, 13(3). — Evidencia de que métodos simples (SMA, WMA) son competitivos con métodos complejos cuando los datos son escasos.

---

*Documento vivo — actualizar cuando el sistema incorpore nuevas fases o cuando los datos históricos acumulados permitan revisar los umbrales y algoritmos descritos.*
