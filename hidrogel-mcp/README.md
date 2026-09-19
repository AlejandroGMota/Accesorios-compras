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

Instrucciones del proyecto «Presupuesto de micas hidrogel» (van **al principio**, antes de los precios):

```
Tienes el conector «Hidrogel». Regla principal:
- Para CUALQUIER cotización de micas de hidrogel, primero llama a la herramienta cotizar con cada tipo, su cantidad y su precio unitario (según los precios de estas instrucciones), y responde SOLO con el texto que te devuelve. Nunca escribas una cotización sin llamar a cotizar: es lo que la guarda. No pidas confirmación ni menciones el registro; solo avisa si falla.
- Si el mensaje de WhatsApp trae encabezado con fecha ([D/M, h:mm p.m.]), pásale a cotizar esa fecha y el nombre del cliente. Si no trae encabezado, no pongas fecha.
- «Normales» es HD. «Privacidad» a secas es Privacidad Matte. En tablet 11" sin material, usa HD.
- Si no sabes un precio, llama a cotizar sin ese precio (sale «$?») y vuelve a llamarla cuando te lo den.
- Si corriges una cotización, anula la anterior con anular_cotizacion (el id que devolvió cotizar) y vuelve a llamar a cotizar.
- Si te pido el pedido para KASR o qué pedir, usa pedido_kasr y dame el mensaje en un bloque de código. Cuando confirme que ya lo pedí, usa registrar_pedido_kasr con las cantidades finales.
- Para preguntas como «¿cuánto vendimos el último mes?», usa ventas_hidrogel.
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
