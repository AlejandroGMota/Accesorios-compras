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
    'Privacidad 360',
    'Tablet 11" HD',
    'Tablet 11" Matte',
    'Tablet 13"',
    'Tablet 13" reducida',
    'Tablet 13" Privacidad HD',
];

// Hojas que se le piden a KASR, en el orden del mensaje, con su precio en USD.
// `tipos` son las ventas que repone cada hoja. Las de un `grupo` rotan poco: solo
// entran solas al mensaje cuando el grupo junta MINIMO_GRUPO piezas vendidas.
// Tablet 13" (normal, reducida y privacidad) no tiene equivalente en KASR.
export const HOJAS = [
    { sku: 'AG-12', usd: 0.60, descripcion: 'Privacidad Matte', tipos: ['Privacidad Matte'] },
    { sku: 'NT68',  usd: 0.19, descripcion: 'HD',               tipos: ['HD'] },
    { sku: 'NT69',  usd: 0.19, descripcion: 'Matte',            tipos: ['Matte'] },
    { sku: 'NT67',  usd: 0.48, descripcion: 'Privacidad Matte a prueba, solo a mano', tipos: [] },
    { sku: 'NT66',  usd: 0.48, descripcion: 'Privacidad HD',    tipos: ['Privacidad HD'] },
    { sku: 'AG-13', usd: 1.30, descripcion: 'Privacidad 360',   tipos: ['Privacidad 360'],   grupo: 'Privacidad 360' },
    { sku: 'NT70',  usd: 0.58, descripcion: 'Tablet 11" HD',    tipos: ['Tablet 11" HD'],    grupo: 'Tablet 11"' },
    { sku: 'NT71',  usd: 0.58, descripcion: 'Tablet 11" Matte', tipos: ['Tablet 11" Matte'], grupo: 'Tablet 11"' },
];

export const SKUS = HOJAS.map(h => h.sku);
export const MINIMO_GRUPO = 50;

// Tipos que no se surten con KASR
export const TIPOS_FUERA_KASR = TIPOS.filter(t => !HOJAS.some(h => h.tipos.includes(t)));

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

// Desde cuándo cuenta cada hoja: el último pedido que la incluyó. Si nunca se ha
// pedido, desde el primer pedido registrado, para que lo vendido se acumule.
// pedidos: [{ fecha: Date, items: { SKU: piezas } }] en cualquier orden.
export function periodos(pedidos, ahora = new Date()) {
    const orden   = [...pedidos].sort((a, b) => b.fecha - a.fecha);
    const primero = orden.length ? orden[orden.length - 1].fecha : new Date(ahora.getTime() - DIAS_SIN_PEDIDO * DIA);
    const porSku  = Object.fromEntries(SKUS.map(sku => {
        const pedido = orden.find(p => (p.items?.[sku] || 0) > 0) || null;
        return [sku, { desde: pedido ? pedido.fecha : primero, pedido }];
    }));
    return {
        ultimoPedido: orden[0] || null,
        desdeGeneral: orden.length ? orden[0].fecha : primero,
        porSku,
        // Fecha más antigua que hay que leer de hidrogel_ventas
        inicio: new Date(Math.min(...Object.values(porSku).map(p => p.desde.getTime()))),
    };
}

// Qué pedirle a KASR: reponer lo vendido de cada hoja desde el último pedido que la incluyó.
// ventas: [{ fecha: Date, lineas: [{ tipo, cantidad, precio }], anulada? }]
export function sugerirPedido({ ventas, pedidos, ahora = new Date() }) {
    const p = periodos(pedidos, ahora);

    const hojas = HOJAS.map(h => {
        const { desde, pedido: ultimo } = p.porSku[h.sku];
        const vendido  = piezasDe(ventas, h.tipos, desde);
        const pedido   = ultimo?.items?.[h.sku] || 0;
        const queda    = Math.max(0, pedido - vendido);
        const porDia   = vendido / Math.max(1, (ahora - desde) / DIA);
        // Sin pedido de esta hoja no se sabe cuánto queda
        const diasRestantes = ultimo && porDia > 0 ? Math.floor(queda / porDia) : null;
        return {
            ...h,
            desde,
            pedido,
            vendido,
            queda,
            diasRestantes,
            alerta: diasRestantes !== null && diasRestantes <= DIAS_AVISO,
        };
    });

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

    // Resumen general y lo que no es de KASR: desde el último pedido
    const delPeriodo = ventas.filter(v => v.fecha >= p.desdeGeneral);
    const resumen    = resumirVentas(delPeriodo);
    const fueraKasr  = Object.fromEntries(
        TIPOS_FUERA_KASR.filter(t => resumen.porTipo[t]).map(t => [t, resumen.porTipo[t]])
    );

    const piezas = Object.values(sugerido).reduce((a, b) => a + b, 0);

    return {
        desde: p.desdeGeneral,
        dias:  Math.max(0, Math.floor((ahora - p.desdeGeneral) / DIA)),
        ultimoPedido: p.ultimoPedido,
        resumen,
        hojas,
        grupos,
        sugerido,
        fueraKasr,
        aviso,
        piezas,
        mensaje: armarMensaje(sugerido),
        tarifa:  describirPedido(sugerido),
    };
}
