// Lógica compartida de hidrogel: la usan la pestaña Hidrogel (navegador)
// y el conector de Claude (hidrogel-mcp, Cloudflare Worker).
// Solo funciones puras: nada de Firestore ni del DOM.

// ========== Catálogo ==========

// Tipos que aparecen en las cotizaciones del chat de Claude
export const TIPOS = [
    'HD',                   // también "normales"
    'Matte',
    'Blue Ray',
    'Privacidad Matte',     // "privacidad" a secas
    'Privacidad HD',
    // Lion es el mismo uso con material más barato de KASR. Se cotiza aparte
    // porque sale de otra hoja (NT67 / NT66) con otro costo: así el inventario
    // de cada hoja se descuenta de lo que de verdad se vendió de ella.
    'Privacidad Matte Lion',
    'Privacidad HD Lion',
    'Privacidad 360',
    // En tablets el material va siempre: no hay «Tablet 13"» a secas. Las
    // cotizaciones viejas de «Tablet 13"» y «Tablet 13" reducida» sin material
    // se quedan en el historial, pero no cuentan para ninguna existencia.
    'Tablet 11" HD',
    'Tablet 11" Matte',
    'Tablet 13" HD',
    'Tablet 13" Matte',
    'Tablet 13" reducida HD',
    'Tablet 13" reducida Matte',
    'Tablet 13" Privacidad HD',
];

// Hojas que se le piden a KASR, en el orden del mensaje, con su precio en USD.
// `tipos` son las ventas que repone cada hoja. Las de un `grupo` rotan poco: solo
// entran solas al mensaje cuando el grupo junta MINIMO_GRUPO piezas vendidas.
// Tablet 13" (normal, reducida y privacidad) no tiene equivalente en KASR.
export const HOJAS = [
    { sku: 'AG-12', usd: 0.60, descripcion: 'Privacidad Matte',      tipos: ['Privacidad Matte'] },
    { sku: 'NT68',  usd: 0.19, descripcion: 'HD',                    tipos: ['HD'] },
    { sku: 'NT69',  usd: 0.19, descripcion: 'Matte',                 tipos: ['Matte'] },
    { sku: 'HD-09', usd: 0.70, descripcion: 'Privacidad HD',         tipos: ['Privacidad HD'] },
    // Línea Lion: cada venta Lion descuenta de su propia hoja, no de AG-12 / HD-09
    { sku: 'NT67',  usd: 0.48, descripcion: 'Privacidad Matte Lion', tipos: ['Privacidad Matte Lion'] },
    { sku: 'NT66',  usd: 0.48, descripcion: 'Privacidad HD Lion',    tipos: ['Privacidad HD Lion'] },
    { sku: 'AG-13', usd: 1.30, descripcion: 'Privacidad 360',   tipos: ['Privacidad 360'],   grupo: 'Privacidad 360' },
    { sku: 'NT70',  usd: 0.58, descripcion: 'Tablet 11" HD',    tipos: ['Tablet 11" HD'],    grupo: 'Tablet 11"' },
    { sku: 'NT71',  usd: 0.58, descripcion: 'Tablet 11" Matte', tipos: ['Tablet 11" Matte'], grupo: 'Tablet 11"' },
];

export const SKUS = HOJAS.map(h => h.sku);

export const MINIMO_GRUPO = 50;

// Productos que se venden pero no se piden a KASR. Llevan existencia (conteo +
// compras − vendido) pero no costo ni sugerencia de pedido. El `id` es la clave con
// la que se guardan su conteo en `hidrogel_conteos` y sus compras en `hidrogel_compras`,
// igual que el SKU de una hoja en un pedido.
export const SIN_KASR = [
    { id: 'blue-ray',             descripcion: 'Blue Ray',                  tipos: ['Blue Ray'] },
    { id: 'tab13-hd',             descripcion: 'Tablet 13" HD',             tipos: ['Tablet 13" HD'] },
    { id: 'tab13-matte',          descripcion: 'Tablet 13" Matte',          tipos: ['Tablet 13" Matte'] },
    { id: 'tab13-reducida-hd',    descripcion: 'Tablet 13" reducida HD',    tipos: ['Tablet 13" reducida HD'] },
    { id: 'tab13-reducida-matte', descripcion: 'Tablet 13" reducida Matte', tipos: ['Tablet 13" reducida Matte'] },
    { id: 'tab13-priv',           descripcion: 'Tablet 13" Privacidad HD',  tipos: ['Tablet 13" Privacidad HD'] },
];

// Tarifas DDP de KASR (USD, puerta a puerta con impuestos)
export const TARIFAS_DDP = [
    { piezas: 350,  usd: 60 },
    { piezas: 500,  usd: 78 },
    { piezas: 1000, usd: 145 },
];

// El envío tarda 10–15 días; se avisa con un mes de margen extra
export const DIAS_ENVIO = 15;
export const DIAS_AVISO = DIAS_ENVIO + 30;
export const DIAS_SIN_PEDIDO = 30; // periodo por defecto si no hay pedido registrado
// Ventana para medir el ritmo de venta (piezas por día)
export const DIAS_RITMO = 30;

const DIA = 24 * 60 * 60 * 1000;

// ========== Fechas (hora del centro de México, sin horario de verano desde 2022) ==========

const OFFSET_MX = '-06:00';
const ZONA_MX   = 'America/Mexico_City';

// "2026-09-17" | "2026-09-17T15:19" | ISO con zona → Date
export function parsearFecha(texto, horaSiSoloFecha = '12:00') {
    const t = String(texto).trim();
    let iso = t;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t))                    iso = `${t}T${horaSiSoloFecha}:00${OFFSET_MX}`;
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t))    iso = `${t}:00${OFFSET_MX}`;
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)) iso = `${t}${OFFSET_MX}`;
    const fecha = new Date(iso);
    if (isNaN(fecha)) throw new Error(`Fecha inválida: "${texto}". Usa AAAA-MM-DD o AAAA-MM-DDTHH:MM.`);
    return fecha;
}

// Día calendario en México como "AAAA-MM-DD"
export function diaMx(fecha) {
    return new Date(fecha.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Fecha de un pedido al proveedor. Si solo trae el día y no es hoy, se toma el
// final de ese día: las ventas de ese día ya iban incluidas en el pedido.
export function fechaPedido(texto, ahora = new Date()) {
    if (!texto || String(texto).trim() === diaMx(ahora)) return ahora;
    return parsearFecha(texto, '23:59');
}

export function formatoFecha(fecha) {
    return fecha.toLocaleDateString('es-MX', { timeZone: ZONA_MX, day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatoNumero(n) {
    return n.toLocaleString('es-MX');
}

export function haceDias(dias) {
    return dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

// ========== Cálculo ==========

export function resumirVentas(ventas) {
    const porTipo = {};
    let piezas = 0;
    let total  = 0;
    let cotizaciones = 0;
    for (const v of ventas) {
        if (v.anulada) continue;
        cotizaciones++;
        for (const l of v.lineas || []) {
            porTipo[l.tipo] = (porTipo[l.tipo] || 0) + l.cantidad;
            piezas += l.cantidad;
            total  += l.cantidad * l.precio;
        }
    }
    return { porTipo, piezas, total, cotizaciones };
}

export function tarifaDDP(piezas) {
    if (piezas <= 0) return null;
    const tarifa = TARIFAS_DDP.find(t => piezas <= t.piezas);
    return tarifa ? { ...tarifa, faltan: tarifa.piezas - piezas } : null;
}

// "215 pzs · producto $62.30 + envío DDP $60 = $122.30 USD (tarifa de 350; te faltan 135 para llenarla)."
export function describirPedido(cantidades) {
    const piezas = Object.values(cantidades).reduce((a, b) => a + b, 0);
    if (piezas <= 0) return 'Sin piezas.';
    const producto = HOJAS.reduce((s, h) => s + (cantidades[h.sku] || 0) * h.usd, 0);
    const usd = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const t = tarifaDDP(piezas);
    if (!t) return `${formatoNumero(piezas)} pzs · producto ${usd(producto)} USD; más de 1,000, pide cotización del envío.`;
    const faltan = t.faltan > 0 ? `; te faltan ${formatoNumero(t.faltan)} para llenarla` : '';
    return `${formatoNumero(piezas)} pzs · producto ${usd(producto)} + envío DDP $${t.usd} = ${usd(producto + t.usd)} USD ` +
           `(tarifa de ${formatoNumero(t.piezas)}${faltan}).`;
}

export function armarMensaje(cantidades) {
    const lineas = SKUS.filter(s => cantidades[s] > 0).map(s => `${s} - ${cantidades[s]}`);
    return lineas.length ? `Hi! Can you create a link for:\n${lineas.join('\n')}` : '';
}

function piezasDe(ventas, tipos, desde) {
    let n = 0;
    for (const v of ventas) {
        if (v.anulada || v.fecha < desde) continue;
        for (const l of v.lineas || []) if (tipos.includes(l.tipo)) n += l.cantidad;
    }
    return n;
}

// Último conteo de una hoja (por SKU) o de un producto sin KASR (por id)
function ultimoConteo(conteos, clave) {
    return conteos.filter(c => c.sku === clave).sort((a, b) => b.fecha - a.fecha)[0] || null;
}

// Desde cuándo se repone cada hoja: el último pedido que la incluyó. Si nunca se ha
// pedido, desde el primer pedido registrado, para que lo vendido se acumule.
// pedidos: [{ fecha: Date, items: { SKU: piezas } }] en cualquier orden.
// conteos: [{ fecha: Date, sku, piezas }] y compras (misma forma que un pedido), en
// cualquier orden; aquí solo cuentan para saber desde cuándo hay que leer ventas.
export function periodos(pedidos, ahora = new Date(), conteos = [], compras = []) {
    const orden   = [...pedidos].sort((a, b) => b.fecha - a.fecha);
    const primero = orden.length ? orden[orden.length - 1].fecha : new Date(ahora.getTime() - DIAS_SIN_PEDIDO * DIA);
    const porSku  = Object.fromEntries(SKUS.map(sku => {
        const pedido = orden.find(p => (p.items?.[sku] || 0) > 0) || null;
        return [sku, { desde: pedido ? pedido.fecha : primero, pedido }];
    }));
    const fechas = [
        ...Object.values(porSku).map(p => p.desde),
        ...[...SKUS, ...SIN_KASR.map(x => x.id)].map(clave => ultimoConteo(conteos, clave)?.fecha).filter(Boolean),
        ...SIN_KASR.map(x => compras.filter(c => (c.items?.[x.id] || 0) > 0).sort((a, b) => b.fecha - a.fecha)[0]?.fecha).filter(Boolean),
        new Date(ahora.getTime() - DIAS_RITMO * DIA),
    ];
    return {
        ultimoPedido: orden[0] || null,
        desdeGeneral: orden.length ? orden[0].fecha : primero,
        porSku,
        // Fecha más antigua que hay que leer de hidrogel_ventas
        inicio: new Date(Math.min(...fechas.map(f => f.getTime()))),
    };
}

// Cuánto queda de una hoja o de un producto sin KASR. `pedidos` son los pedidos a
// KASR para una hoja y las compras para un producto sin KASR: cuentan igual.
//
// Con conteo: lo contado, más lo pedido después, menos lo vendido después. Lo
// pedido suma desde que se pide aunque tarde en llegar, que es lo que importa
// para decidir el siguiente pedido. Por lo mismo, si al contar viene un pedido
// en camino, hay que sumarlo al conteo: su fecha es anterior y ya no entra solo.
//
// Sin conteo: lo del último pedido menos lo vendido desde él. Da por hecho que
// al llegar no quedaba nada de antes, que es justo lo que el conteo corrige.
//
// Sin conteo ni pedido no hay de dónde partir y `queda` es null.
//
// `queda` no se topa en cero a propósito: un negativo es que se vendió más de lo
// que había, o sea que falta contar o hay cotizaciones que no se concretaron y
// siguen contando como vendidas. Con un 0 el error se arrastra sin que se vea.
function existencia(clave, tipos, { ventas, pedidos, conteos }) {
    const conteo = ultimoConteo(conteos, clave);
    if (conteo) {
        const entro   = pedidos.filter(p => p.fecha > conteo.fecha).reduce((n, p) => n + (p.items?.[clave] || 0), 0);
        const vendido = piezasDe(ventas, tipos, conteo.fecha);
        return { conteo, pedido: null, base: conteo.piezas, entro, vendido, queda: conteo.piezas + entro - vendido };
    }
    const pedido = [...pedidos].sort((a, b) => b.fecha - a.fecha).find(p => (p.items?.[clave] || 0) > 0);
    if (!pedido) return { conteo: null, pedido: null, base: null, entro: 0, vendido: null, queda: null };
    const vendido = piezasDe(ventas, tipos, pedido.fecha);
    return { conteo: null, pedido, base: pedido.items[clave], entro: 0, vendido, queda: pedido.items[clave] - vendido };
}

// Qué pedirle a KASR: reponer lo vendido de cada hoja desde el último pedido que la
// incluyó. El conteo no cambia cuánto se repone; cambia cuánto queda y cuánto alcanza.
// ventas: [{ fecha: Date, lineas: [{ tipo, cantidad, precio }], anulada? }]
// compras: lo que se compró fuera de KASR, con la misma forma que un pedido.
export function sugerirPedido({ ventas, pedidos, conteos = [], compras = [], ahora = new Date() }) {
    const p = periodos(pedidos, ahora, conteos, compras);

    // El ritmo va con ventana propia: lo que se vende por día no cambia porque
    // llegue mercancía o porque alguien cuente las cajas. Si las cotizaciones se
    // empezaron a registrar hace menos de DIAS_RITMO días, se divide entre los
    // días que sí hay; si no, el ritmo sale más bajo y el aviso llega tarde.
    const primeraVenta = ventas.reduce((min, v) => (v.fecha < min ? v.fecha : min), ahora);
    const diasRitmo    = Math.min(DIAS_RITMO, Math.max(1, (ahora - primeraVenta) / DIA));
    const desdeRitmo   = new Date(ahora.getTime() - diasRitmo * DIA);

    const medir = (clave, tipos, entradas) => {
        const e       = existencia(clave, tipos, { ventas, pedidos: entradas, conteos });
        const enRitmo = piezasDe(ventas, tipos, desdeRitmo);
        const porDia  = enRitmo / diasRitmo;
        const diasRestantes = e.queda !== null && e.queda >= 0 && porDia > 0 ? Math.floor(e.queda / porDia) : null;
        return { existencia: e, enRitmo, porDia, diasRestantes };
    };

    const hojas = HOJAS.map(h => {
        const { desde, pedido: ultimo } = p.porSku[h.sku];
        const m = medir(h.sku, h.tipos, pedidos);
        return {
            ...h,
            ...m,
            // Lo que se repone
            desde,
            pedido:  ultimo?.items?.[h.sku] || 0,
            vendido: piezasDe(ventas, h.tipos, desde),
            alerta:  m.diasRestantes !== null && m.diasRestantes <= DIAS_AVISO,
        };
    });

    // No se piden a KASR, así que no llevan aviso de envío
    const sinKasr = SIN_KASR.map(x => ({ ...x, ...medir(x.id, x.tipos, compras) }));

    const grupos = {};
    for (const h of hojas.filter(h => h.grupo)) {
        grupos[h.grupo] ||= { vendido: 0, minimo: MINIMO_GRUPO };
        grupos[h.grupo].vendido += h.vendido;
    }
    for (const g of Object.values(grupos)) g.entra = g.vendido >= g.minimo;

    const sugerido = Object.fromEntries(hojas.map(h => [h.sku, !h.grupo || grupos[h.grupo].entra ? h.vendido : 0]));

    // La hoja que se acaba primero manda
    const critica = hojas
        .filter(h => h.diasRestantes !== null)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)[0] || null;
    const aviso = critica && {
        sku:           critica.sku,
        diasRestantes: critica.diasRestantes,
        urgente:       critica.alerta,
        pedirAntes:    new Date(ahora.getTime() + Math.max(0, critica.diasRestantes - DIAS_AVISO) * DIA),
    };

    // Resumen general: desde el último pedido
    const resumen = resumirVentas(ventas.filter(v => v.fecha >= p.desdeGeneral));
    const piezas  = Object.values(sugerido).reduce((a, b) => a + b, 0);

    return {
        desde: p.desdeGeneral,
        dias:  Math.max(0, Math.floor((ahora - p.desdeGeneral) / DIA)),
        ultimoPedido: p.ultimoPedido,
        resumen,
        diasRitmo,
        hojas,
        sinKasr,
        // Lo que se vendió de más según la cuenta: falta contar o anular cotizaciones
        noCuadran: [...hojas, ...sinKasr].filter(x => x.existencia.queda < 0),
        grupos,
        sugerido,
        aviso,
        piezas,
        mensaje: armarMensaje(sugerido),
        tarifa:  describirPedido(sugerido),
    };
}
