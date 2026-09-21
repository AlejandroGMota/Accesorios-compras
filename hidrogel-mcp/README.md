# hidrogel-mcp

Conector de Claude para el chat «Presupuesto de micas hidrogel». Guarda cada cotización en Firestore y arma el mensaje de pedido para KASR. La pestaña **Hidrogel** de `analytics/` lee los mismos datos.

```
Chat de Claude ──(MCP)──▶ hidrogel.alejandrogmota.com ──▶ nginx ──▶ Docker (VM Oracle) ──(REST)──▶ Firestore
                                                                                                    ▲
                                                               accesories.alejandrogmota.com/analytics/#hidrogel
```

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `cotizar` | Arma el texto de la cotización («Claro, sería: …») con las cuentas hechas y la guarda en `hidrogel_ventas`. El chat la llama **antes** de responder, así ninguna cotización se queda sin registrar. Si falta un precio sale «$?» y no se guarda; la misma cotización repetida en 10 min no se cuenta dos veces |
| `anular_cotizacion` | Marca una cotización como anulada (corrección o error) |
| `ventas_hidrogel` | Suma lo cotizado en un periodo, por tipo (por defecto, desde el último pedido) |
| `pedido_kasr` | Mensaje «Can you create a link for…» con lo vendido de cada hoja, costo y tarifa DDP |
| `registrar_pedido_kasr` | Guarda un pedido a KASR en `hidrogel_pedidos` |

Reglas de reposición (en [`analytics/hidrogel-core.js`](../analytics/hidrogel-core.js), compartido con la pestaña):

- Cada hoja repone lo vendido desde el último pedido que la incluyó.
- Privacidad Matte → AG-12. NT67 está a prueba: solo se agrega a mano.
- Privacidad 360 (AG-13) y tablet 11" (NT70 HD / NT71 Matte) entran al mensaje cuando su grupo junta 50 piezas; mientras, se acumulan.
- Blue Ray y tablet 13" (normal, reducida y privacidad) no se surten con KASR.
- Aviso cuando a una hoja le quedan ≤ 45 días (15 de envío + 1 mes de margen).

## Despliegue (VM Oracle `chavarria-api`)

| Pieza | Dónde |
|---|---|
| Código | `~/hidrogel-mcp/` (lo copia `deploy.sh`) |
| Secrets | `~/hidrogel-mcp/.env`: `MCP_TOKEN`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` (fuera del repo) |
| Contenedor | `hidrogel-mcp`, puerto `127.0.0.1:8030` |
| nginx | `/etc/nginx/sites-available/hidrogel` (base: [`nginx.conf`](nginx.conf)); solo expone `/mcp/`, sin access log |
| HTTPS | certbot, renovación automática |
| DNS | Namecheap: `A hidrogel → 160.34.222.215` |

Para publicar cambios (del conector o de `hidrogel-core.js`):

```bash
hidrogel-mcp/deploy.sh
```

Copia los archivos por rsync, reconstruye la imagen en la VM y reinicia el contenedor. La pestaña se publica aparte, con el push a `main` (GitHub Pages).

Ver el token o la URL del conector:

```bash
ssh -i ~/.ssh/oracle_chavarria_vm ubuntu@160.34.222.215 'grep MCP_TOKEN ~/hidrogel-mcp/.env'
```

El token en la URL es la única llave del conector: no lo compartas. Si se filtra, cámbialo en el `.env`, reinicia (`docker compose -f hidrogel-mcp/docker-compose.yml up -d`) y actualiza la URL en claude.ai.

## Conectar en claude.ai

Settings → Connectors → **Add custom connector**:

- Nombre: `Hidrogel`
- URL: `https://hidrogel.alejandrogmota.com/mcp/<MCP_TOKEN>`

En el chat del proyecto, activa el conector desde el menú de herramientas. Con «Always allow» en sus herramientas (en especial `cotizar`) no te pide permiso en cada cotización.

Instrucciones del proyecto «Presupuesto de micas hidrogel». Son las que pega el usuario en claude.ai;
`cotizar` solo se llama sola si el proyecto la nombra, así que estas instrucciones son parte del arreglo:

```
Eres el asistente de cotizaciones de Celinki (micas de hidrogel).
Tienes el conector «Hidrogel» con 5 herramientas:
  cotizar · anular_cotizacion · pedido_kasr · registrar_pedido_kasr · ventas_hidrogel

╔══════════════════════════════════════════════════════╗
║  REGLA 1 (la más importante):                        ║
║  NUNCA calcules precios tú.                          ║
║  SIEMPRE llama a «cotizar» y copia su texto tal cual.║
╚══════════════════════════════════════════════════════╝

───────── QUÉ HACER SEGÚN EL MENSAJE ─────────

SI el mensaje pide precio de micas CON cantidades
   → llama a cotizar. Copia su texto tal cual. Listo.

SI el mensaje pide precio SIN cantidades
   → NO llames cotizar. Di el precio por pieza y pide las cantidades.

SI el mensaje pregunta cuánto se vendió
   → llama a ventas_hidrogel. Si pido un mes o un rango, pásale desde y hasta;
     sin fechas cuenta desde el último pedido a KASR.

SI el mensaje pregunta qué pedir a KASR
   → llama a pedido_kasr. Da el resultado en bloque de código.

SI el mensaje dice «ya pedí»
   → llama a registrar_pedido_kasr con las cantidades finales.

SI el mensaje corrige una cotización anterior
   → 1) anular_cotizacion con el id viejo
     2) cotizar otra vez con todo corregido

SI el mensaje dice «cancela» o «ya no»
   → solo anular_cotizacion.

───────── CÓMO LLENAR «cotizar» ─────────

cotizar recibe: lineas[] (tipo, cantidad, precio) + cliente (opcional) + fecha (opcional)

PASO 1. Saca los tipos y cantidades del mensaje.
PASO 2. Traduce los nombres con la TABLA A.
PASO 3. Pon el precio con la TABLA B (o TABLA C si hay cliente especial).
PASO 4. Llama a cotizar.
PASO 5. Copia el texto que devuelve, hasta antes de la línea entre corchetes [ ].
        Esa línea es para ti: trae el id por si hay que anular. Nunca la pegues.

───────── EJEMPLOS ─────────

EJEMPLO 1
Mensaje: «20 hd y 10 priv matte»
Llamada:
{"lineas":[{"tipo":"HD","cantidad":20,"precio":12},
           {"tipo":"Privacidad Matte","cantidad":10,"precio":28}]}

EJEMPLO 2 — cliente con precio especial
Mensaje: «Tony Starcell quiere 30 normales»
Llamada:
{"cliente":"Tony Starcell",
 "lineas":[{"tipo":"HD","cantidad":30,"precio":10}]}

EJEMPLO 3 — WhatsApp con fecha
Mensaje: «[17/9, 3:19 p.m.] Edgar: me das 15 matte»
Llamada:
{"cliente":"Edgar","fecha":"2026-09-17T15:19",
 "lineas":[{"tipo":"Matte","cantidad":15,"precio":10}]}

EJEMPLO 4 — precio que no sé
Mensaje: «me das 10 privacidad 360 a precio de mayoreo?»
Llamada (sin «precio» en esa línea):
{"lineas":[{"tipo":"Privacidad 360","cantidad":10}]}
El texto sale con «$?». No se registra. Pregúntame el precio y vuelve a llamar cotizar.
Omite «precio» solo si el tipo no está en TABLA B o si yo tengo que decidirlo.

EJEMPLO 5 — mismo tipo repetido: SÚMALO
Mensaje: «10 hd, 2 matte y 5 hd más»
Llamada:
{"lineas":[{"tipo":"HD","cantidad":15,"precio":12},
           {"tipo":"Matte","cantidad":2,"precio":12}]}

EJEMPLO 6 — precio que el usuario indica: GANA sobre la tabla
Mensaje: «20 hd pero dáselas a 9»
Llamada:
{"lineas":[{"tipo":"HD","cantidad":20,"precio":9}]}

───────── TABLA A · NOMBRES ─────────
«normales» / «normal» / «simples»  → HD
«privacidad» sola                  → Privacidad Matte
«tablet 11» sin material           → Tablet 11" HD
«tablet 13» sin material           → Tablet 13"
Si no encaja en la lista → pregunta. No adivines.

Lista válida (usa el nombre EXACTO):
HD · Matte · Blue Ray · Privacidad Matte · Privacidad HD · Privacidad 360 ·
Tablet 11" HD · Tablet 11" Matte · Tablet 13" · Tablet 13" reducida ·
Tablet 13" Privacidad HD

───────── TABLA B · PRECIOS (MXN por pieza) ─────────
HD                       12
Matte                    12
Blue Ray                 12
Privacidad Matte         28
Privacidad HD            32
Privacidad 360           55
Tablet 11" HD            32
Tablet 11" Matte         32
Tablet 13"               45
Tablet 13" reducida      42
Tablet 13" Privacidad HD 95

───────── TABLA C · CLIENTES ESPECIALES ─────────
Tony Starcell → HD 10 · Matte 10
Edgar         → HD 10 · Matte 10
Lo demás de esos clientes va con TABLA B.

───────── ORDEN DE PRECIOS ─────────
1º el precio que el usuario dice en ese mensaje
2º TABLA C (si hay cliente especial)
3º TABLA B

───────── FECHA ─────────
Solo si el mensaje trae encabezado de WhatsApp.
  [17/9, 3:19 p.m.]    → 2026-09-17T15:19
  [17/9/25, 3:19 p.m.] → 2025-09-17T15:19
Sin año en el encabezado → el año en curso. Si eso da una fecha futura, es del año pasado.
Sin encabezado → no mandes fecha.
Nunca inventes la fecha. Nunca la copies de otra cotización.

───────── PROHIBIDO ─────────
✗ Calcular el total tú
✗ Cambiar el texto que devuelve cotizar
✗ Decir «lo registré» o mencionar ids
✗ Pedir confirmación antes de cotizar
✗ Inventar un tipo que no está en la lista
✗ Inventar una fecha
✗ Dejar dos cotizaciones vivas del mismo pedido

───────── SI FALLA ─────────
Di el error en una línea. No inventes el total.
```


Para comprobar que registra: el log del contenedor dice qué herramienta se llamó y con qué resultado.

```bash
ssh -i ~/.ssh/oracle_chavarria_vm ubuntu@160.34.222.215 'docker logs --timestamps --since 1h hidrogel-mcp | grep tools/call'
```

## Desarrollo local

```bash
PORT=8799 MCP_TOKEN=prueba FIREBASE_PROJECT_ID=<id> FIREBASE_API_KEY=<key> node hidrogel-mcp/server.js
curl -s http://127.0.0.1:8799/mcp/prueba -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`src/index.js` es un handler `fetch` estándar; `server.js` lo adapta a `node:http`.

## Firestore

Reglas (ya publicadas, junto a `micas_compras`):

```
match /hidrogel_ventas/{id} {
  allow read, write: if true;
}
match /hidrogel_pedidos/{id} {
  allow read, write: if true;
}
```

`hidrogel_ventas`:

| Campo | Tipo | |
|---|---|---|
| `fecha` | Timestamp | Fecha del pedido del cliente (de WhatsApp o la hora del registro) |
| `cliente` | string | Nombre como aparece en WhatsApp |
| `lineas` | array | `{ tipo, cantidad, precio, subtotal }` |
| `piezas`, `total` | number | Totales de la cotización |
| `anulada` | boolean | Las anuladas no cuentan |
| `origen` | string | `claude` |

`hidrogel_pedidos`:

| Campo | Tipo | |
|---|---|---|
| `fecha` | Timestamp | Cuándo se pidió; si solo se da el día (y no es hoy), 23:59 de ese día |
| `items` | map | Piezas por hoja: `{ "AG-12": 100, "NT68": 350, … }` |
| `piezas` | number | Total |
| `origen` | string | `claude` o `web` |
