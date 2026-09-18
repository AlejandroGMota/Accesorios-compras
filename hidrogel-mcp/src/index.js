// Conector MCP para el chat de Claude «Presupuesto de micas hidrogel».
// Guarda cada cotización en Firestore y arma el pedido para KASR.
// Servidor MCP sin estado (Streamable HTTP, respuestas JSON) en un Cloudflare Worker.

import {
    TIPOS, HOJAS, SKUS, DIAS_AVISO, DIAS_SIN_PEDIDO,
    parsearFecha, fechaPedido, formatoFecha, formatoNumero, haceDias,
    resumirVentas, periodos, sugerirPedido, describirPedido,
} from '../../analytics/hidrogel-core.js';

const VENTAS   = 'hidrogel_ventas';
const PEDIDOS  = 'hidrogel_pedidos';
const PROTOCOLOS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

// ========== Firestore (REST, mismas reglas que el sitio) ==========

function encode(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date)             return { timestampValue: v.toISOString() };
    if (typeof v === 'string')         return { stringValue: v };
    if (typeof v === 'boolean')        return { booleanValue: v };
    if (typeof v === 'number')         return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v))              return { arrayValue: { values: v.map(encode) } };
    return { mapValue: { fields: encodeFields(v) } };
}

function encodeFields(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encode(v)]));
}

function decode(v) {
    if ('stringValue' in v)    return v.stringValue;
    if ('integerValue' in v)   return Number(v.integerValue);
    if ('doubleValue' in v)    return v.doubleValue;
    if ('booleanValue' in v)   return v.booleanValue;
    if ('timestampValue' in v) return new Date(v.timestampValue);
    if ('arrayValue' in v)     return (v.arrayValue.values || []).map(decode);
    if ('mapValue' in v)       return decodeFields(v.mapValue.fields || {});
    return null;
}

function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

function decodeDoc(doc) {
    return { id: doc.name.split('/').pop(), ...decodeFields(doc.fields || {}) };
}

function firestore(env) {
    const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

    async function llamar(ruta, init = {}) {
        const sep  = ruta.includes('?') ? '&' : '?';
        const resp = await fetch(`${base}${ruta}${sep}key=${env.FIREBASE_API_KEY}`, {
            ...init,
            headers: { 'content-type': 'application/json' },
        });
        const json = await resp.json();
        if (!resp.ok) {
            // runQuery devuelve los errores dentro de un arreglo
            const msg = (Array.isArray(json) ? json[0] : json)?.error?.message || resp.statusText;
            throw new Error(resp.status === 403
                ? `Firestore negó el acceso (${msg}). Revisa que las reglas permitan ${VENTAS} y ${PEDIDOS}.`
                : `Firestore ${resp.status}: ${msg}`);
        }
        return json;
    }

    return {
        agregar: async (coleccion, datos) =>
            decodeDoc(await llamar(`/${coleccion}`, { method: 'POST', body: JSON.stringify({ fields: encodeFields(datos) }) })),

        // Actualiza solo los campos dados; falla si el documento no existe
        actualizar: async (coleccion, id, datos) => {
            const mask = Object.keys(datos).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
            const ruta = `/${coleccion}/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`;
            return decodeDoc(await llamar(ruta, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(datos) }) }));
        },

        consultar: async (coleccion, { desde, hasta, orden = 'ASCENDING', limite } = {}) => {
            const filtros = [];
            if (desde) filtros.push({ fieldFilter: { field: { fieldPath: 'fecha' }, op: 'GREATER_THAN_OR_EQUAL', value: encode(desde) } });
            if (hasta) filtros.push({ fieldFilter: { field: { fieldPath: 'fecha' }, op: 'LESS_THAN_OR_EQUAL', value: encode(hasta) } });
            const structuredQuery = {
                from: [{ collectionId: coleccion }],
                orderBy: [{ field: { fieldPath: 'fecha' }, direction: orden }],
                ...(filtros.length === 1 && { where: filtros[0] }),
                ...(filtros.length > 1 && { where: { compositeFilter: { op: 'AND', filters: filtros } } }),
                ...(limite && { limit: limite }),
            };
            const filas = await llamar(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) });
            return filas.filter(f => f.document).map(f => decodeDoc(f.document));
        },
    };
}

// Los últimos pedidos alcanzan para saber desde cuándo cuenta cada hoja
function pedidosRecientes(db) {
    return db.consultar(PEDIDOS, { orden: 'DESCENDING', limite: 50 });
}

// ========== Herramientas ==========

function cotizaciones(n) {
    return `${n} cotizaci${n === 1 ? 'ón' : 'ones'}`;
}

function resumenLineas(lineas) {
    return lineas.map(l => `${l.cantidad} ${l.tipo}`).join(', ');
}

const HERRAMIENTAS = [
    {
        name: 'registrar_cotizacion',
        description:
            'Guarda en la base de datos una cotización de micas de hidrogel ya completa (la que empieza con «Claro, sería:»). ' +
            'Llámala una vez por cada cotización, justo después de responderla. No la llames si algún precio quedó en «?»: ' +
            'espera a que el usuario dé el precio. Si corriges una cotización ya registrada, primero anula la anterior con ' +
            'anular_cotizacion y luego registra la nueva.',
        inputSchema: {
            type: 'object',
            properties: {
                lineas: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            tipo: {
                                type: 'string',
                                enum: TIPOS,
                                description: '«Privacidad» a secas = "Privacidad Matte". «Normales» = "HD". Tablet 11" sin decir HD o Matte = "Tablet 11\" HD".',
                            },
                            cantidad: { type: 'integer', minimum: 1 },
                            precio:   { type: 'number', minimum: 0, description: 'Precio unitario en MXN' },
                        },
                        required: ['tipo', 'cantidad', 'precio'],
                        additionalProperties: false,
                    },
                },
                cliente: {
                    type: 'string',
                    description: 'Nombre del cliente como aparece en WhatsApp (p. ej. "Miguel Tianguis Provi"). Omítelo si no se sabe.',
                },
                fecha: {
                    type: 'string',
                    description:
                        'Fecha del pedido en hora de México: AAAA-MM-DD o AAAA-MM-DDTHH:MM. Tómala del encabezado de WhatsApp ' +
                        '([17/9, 3:19 p.m.] → 2026-09-17T15:19). Omítela si el mensaje no trae fecha; se usa la hora actual.',
                },
            },
            required: ['lineas'],
            additionalProperties: false,
        },
        async ejecutar({ lineas, cliente = '', fecha }, db) {
            for (const l of lineas) {
                if (!TIPOS.includes(l.tipo)) throw new Error(`Tipo desconocido "${l.tipo}". Usa uno de: ${TIPOS.join(', ')}.`);
                if (!Number.isInteger(l.cantidad) || l.cantidad < 1) throw new Error(`Cantidad inválida para ${l.tipo}: ${l.cantidad}.`);
                if (typeof l.precio !== 'number' || l.precio < 0) throw new Error(`Precio inválido para ${l.tipo}: ${l.precio}.`);
            }
            const ahora = new Date();
            const cuando = fecha ? parsearFecha(fecha) : ahora;
            if (cuando - ahora > 24 * 60 * 60 * 1000) throw new Error(`La fecha ${fecha} está en el futuro.`);

            const filas  = lineas.map(l => ({ tipo: l.tipo, cantidad: l.cantidad, precio: l.precio, subtotal: l.cantidad * l.precio }));
            const piezas = filas.reduce((s, l) => s + l.cantidad, 0);
            const total  = filas.reduce((s, l) => s + l.subtotal, 0);
            const doc = await db.agregar(VENTAS, {
                fecha: cuando, cliente: cliente.trim(), lineas: filas, piezas, total,
                origen: 'claude', anulada: false, creado: ahora,
            });
            return `Registrada (id ${doc.id}): ${resumenLineas(filas)} = ${piezas} pzs, $${formatoNumero(total)} MXN, ${formatoFecha(cuando)}.`;
        },
    },
    {
        name: 'anular_cotizacion',
        description: 'Anula una cotización registrada por error o que se corrigió. Deja de contar en las ventas y en el pedido a KASR.',
        inputSchema: {
            type: 'object',
            properties: {
                id:     { type: 'string', description: 'id que devolvió registrar_cotizacion' },
                motivo: { type: 'string' },
            },
            required: ['id'],
            additionalProperties: false,
        },
        async ejecutar({ id, motivo = '' }, db) {
            await db.actualizar(VENTAS, id, { anulada: true, motivo_anulacion: motivo });
            return `Cotización ${id} anulada.`;
        },
    },
    {
        name: 'ventas_hidrogel',
        description:
            'Suma las cotizaciones de hidrogel registradas en un periodo, por tipo de mica. ' +
            'Sin fechas, cuenta desde el último pedido a KASR. Úsala para preguntas como «¿cuánto vendimos el último mes?».',
        inputSchema: {
            type: 'object',
            properties: {
                desde: { type: 'string', description: 'AAAA-MM-DD (hora de México), inclusive' },
                hasta: { type: 'string', description: 'AAAA-MM-DD (hora de México), inclusive' },
            },
            additionalProperties: false,
        },
        async ejecutar({ desde, hasta }, db) {
            let inicio = desde && parsearFecha(desde, '00:00');
            let origen = '';
            if (!inicio) {
                const [pedido] = await db.consultar(PEDIDOS, { orden: 'DESCENDING', limite: 1 });
                inicio = pedido ? pedido.fecha : new Date(Date.now() - DIAS_SIN_PEDIDO * 24 * 60 * 60 * 1000);
                origen = pedido ? ' (desde el último pedido a KASR)' : ` (últimos ${DIAS_SIN_PEDIDO} días; no hay pedido registrado)`;
            }
            const fin = hasta ? parsearFecha(hasta, '23:59') : new Date();
            const ventas = await db.consultar(VENTAS, { desde: inicio, hasta: fin });
            const r = resumirVentas(ventas);
            if (!r.cotizaciones) return `No hay cotizaciones registradas del ${formatoFecha(inicio)} al ${formatoFecha(fin)}${origen}.`;
            const tipos = Object.entries(r.porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}: ${formatoNumero(n)}`);
            return [
                `Del ${formatoFecha(inicio)} al ${formatoFecha(fin)}${origen}: ${cotizaciones(r.cotizaciones)}, ` +
                `${formatoNumero(r.piezas)} pzs, $${formatoNumero(r.total)} MXN.`,
                ...tipos,
            ].join('\n');
        },
    },
    {
        name: 'pedido_kasr',
        description:
            'Arma el mensaje para pedirle a KASR (proveedor de hojas de hidrogel): repone lo vendido de cada hoja desde el ' +
            'último pedido que la incluyó. Privacidad 360 y tablet 11" solo entran cuando su grupo junta 50 piezas. Dice cuánto ' +
            'queda de cada hoja y en qué tarifa DDP cae. Úsala cuando el usuario pregunte qué pedir o pida el ' +
            'mensaje para el proveedor. Muestra el mensaje tal cual, en un bloque de código para copiar.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        async ejecutar(_, db) {
            const pedidos = await pedidosRecientes(db);
            const ventas  = await db.consultar(VENTAS, { desde: periodos(pedidos).inicio });
            const s = sugerirPedido({ ventas, pedidos });
            const pedido = s.ultimoPedido;

            const encabezado = pedido
                ? `Último pedido a KASR: ${formatoFecha(pedido.fecha)} (${haceDias(s.dias)}), ${formatoNumero(pedido.piezas || 0)} pzs.`
                : `No hay pedido a KASR registrado; cuento los últimos ${DIAS_SIN_PEDIDO} días.`;
            const hojas = s.hojas.map(h => {
                const resto = h.diasRestantes === null ? '' : `, quedan ~${h.queda} (~${h.diasRestantes} días)${h.alerta ? ' ⚠' : ''}`;
                return `- ${h.sku} (${h.descripcion}): vendidas ${h.vendido} desde ${formatoFecha(h.desde)}${resto}`;
            });
            const grupos = Object.entries(s.grupos).map(([g, d]) =>
                `${g}: ${d.vendido} de ${d.minimo}${d.entra ? ' → entra al mensaje' : ' → aún no entra (se acumula)'}`);
            const fuera = Object.entries(s.fueraKasr).map(([t, n]) => `${t} ${n}`).join(', ');
            const aviso = !s.aviso ? '' : s.aviso.urgente
                ? `⚠ Ya toca pedir: ${s.aviso.sku} alcanza ~${s.aviso.diasRestantes} días y el envío tarda 10–15.`
                : `Próximo pedido: antes del ${formatoFecha(s.aviso.pedirAntes)} (${s.aviso.sku} alcanza ~${s.aviso.diasRestantes} días; aviso a ${DIAS_AVISO}).`;

            const lineas = [encabezado, `Cotizaciones desde el último pedido: ${s.resumen.cotizaciones}.`, 'Por hoja:', ...hojas, ...grupos];
            if (fuera) lineas.push(`Fuera de KASR: ${fuera}.`);
            if (aviso) lineas.push(aviso);
            lineas.push('', s.mensaje ? `Mensaje:\n${s.mensaje}` : 'No hay ventas de hojas KASR en el periodo.', '', s.tarifa);
            return lineas.join('\n');
        },
    },
    {
        name: 'registrar_pedido_kasr',
        description:
            'Guarda que el usuario ya le hizo un pedido a KASR. Desde esta fecha se cuentan las ventas de las hojas que incluye. ' +
            'Llámala solo cuando el usuario confirme que ya lo pidió, con las cantidades finales.',
        inputSchema: {
            type: 'object',
            properties: {
                items: {
                    type: 'object',
                    description: 'Piezas por hoja',
                    properties: Object.fromEntries(HOJAS.map(h => [h.sku, { type: 'integer', minimum: 0, description: h.descripcion }])),
                    additionalProperties: false,
                },
                fecha: { type: 'string', description: 'AAAA-MM-DD (hora de México). Omítela si fue hoy.' },
            },
            required: ['items'],
            additionalProperties: false,
        },
        async ejecutar({ items, fecha }, db) {
            const limpios = Object.fromEntries(SKUS.filter(s => items[s] > 0).map(s => [s, items[s]]));
            const piezas  = Object.values(limpios).reduce((a, b) => a + b, 0);
            if (!piezas) throw new Error('El pedido no tiene piezas.');
            const ahora = new Date();
            const cuando = fechaPedido(fecha, ahora);
            const doc = await db.agregar(PEDIDOS, {
                fecha: cuando, proveedor: 'KASR', items: limpios, piezas, origen: 'claude', creado: ahora,
            });
            const detalle = Object.entries(limpios).map(([s, n]) => `${s} ${n}`).join(', ');
            return `Pedido registrado (id ${doc.id}), ${formatoFecha(cuando)}: ${detalle} = ${piezas} pzs. ${describirPedido(limpios)}`;
        },
    },
];

// ========== MCP (JSON-RPC) ==========

const INSTRUCCIONES =
    'Registra cada cotización completa de hidrogel con registrar_cotizacion justo después de responderla. ' +
    'Para saber qué pedirle al proveedor usa pedido_kasr; cuando el usuario confirme que ya pidió, usa registrar_pedido_kasr.';

function resultado(id, result) { return { jsonrpc: '2.0', id, result }; }
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function atender(msg, env) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return error(msg?.id ?? null, -32600, 'Invalid Request');
    }
    if (msg.id === undefined) return null; // notificación: no lleva respuesta

    switch (msg.method) {
        case 'initialize': {
            const pedida = msg.params?.protocolVersion;
            return resultado(msg.id, {
                protocolVersion: PROTOCOLOS.includes(pedida) ? pedida : PROTOCOLOS[0],
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: 'hidrogel', version: '1.0.0' },
                instructions: INSTRUCCIONES,
            });
        }
        case 'ping':
            return resultado(msg.id, {});
        case 'tools/list':
            return resultado(msg.id, {
                tools: HERRAMIENTAS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
            });
        case 'tools/call': {
            const herramienta = HERRAMIENTAS.find(h => h.name === msg.params?.name);
            if (!herramienta) return error(msg.id, -32602, `Herramienta desconocida: ${msg.params?.name}`);
            try {
                const texto = await herramienta.ejecutar(msg.params.arguments || {}, firestore(env));
                return resultado(msg.id, { content: [{ type: 'text', text: texto }] });
            } catch (err) {
                // Error de la herramienta: se le devuelve a Claude para que lo corrija
                return resultado(msg.id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
            }
        }
        default:
            return error(msg.id, -32601, `Método no soportado: ${msg.method}`);
    }
}

function json(cuerpo, status = 200) {
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
}

export default {
    async fetch(request, env) {
        if (!env.MCP_TOKEN || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) {
            return new Response('Faltan secrets: MCP_TOKEN, FIREBASE_PROJECT_ID, FIREBASE_API_KEY', { status: 500 });
        }
        // El token en la ruta es la única llave del conector
        if (new URL(request.url).pathname !== `/mcp/${env.MCP_TOKEN}`) {
            return new Response('Not found', { status: 404 });
        }
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
        }

        let cuerpo;
        try {
            cuerpo = await request.json();
        } catch {
            return json(error(null, -32700, 'Parse error'), 400);
        }

        const mensajes   = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
        const respuestas = (await Promise.all(mensajes.map(m => atender(m, env)))).filter(Boolean);
        if (!respuestas.length) return new Response(null, { status: 202 });
        return json(Array.isArray(cuerpo) ? respuestas : respuestas[0]);
    },
};
