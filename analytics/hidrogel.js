// Pestaña Hidrogel: reponer a KASR lo vendido desde el último pedido.
// Las cotizaciones llegan desde el chat de Claude (conector hidrogel-mcp).

import {
    SKUS, DIAS_SIN_PEDIDO,
    periodos, sugerirPedido, armarMensaje, describirPedido, fechaPedido, diaMx, formatoFecha, formatoNumero,
} from './hidrogel-core.js';

const VENTAS  = db.collection('hidrogel_ventas');
const PEDIDOS = db.collection('hidrogel_pedidos');
const $ = id => document.getElementById(id);

function esc(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function estado(mensaje) {
    $('hidro-estado').textContent = mensaje;
}

// ========== Datos ==========

function aObjeto(doc) {
    const d = doc.data();
    return { id: doc.id, ...d, fecha: d.fecha.toDate() };
}

// Los últimos pedidos alcanzan para saber desde cuándo cuenta cada hoja
async function cargar() {
    const ahora = new Date();
    const pedidos    = (await PEDIDOS.orderBy('fecha', 'desc').limit(50).get()).docs.map(aObjeto);
    const snapVentas = await VENTAS.where('fecha', '>=', periodos(pedidos, ahora).inicio).orderBy('fecha', 'desc').get();
    const ventas     = snapVentas.docs.map(aObjeto);
    const sugerencia = sugerirPedido({ ventas, pedidos, ahora });
    // La tabla de cotizaciones muestra solo las del último periodo
    return { sugerencia, ventas: ventas.filter(v => v.fecha >= sugerencia.desde) };
}

// ========== Render ==========

function renderResumen(s) {
    const p = s.ultimoPedido;
    $('hidro-ultimo').textContent   = p ? formatoFecha(p.fecha) : 'Sin registrar';
    $('hidro-dias').textContent     = p ? s.dias : '—';
    $('hidro-pedidas').textContent  = p ? formatoNumero(p.piezas || 0) : '—';
    $('hidro-vendidas').textContent = formatoNumero(s.resumen.piezas);

    const aviso = $('hidro-aviso');
    aviso.classList.remove('muted');
    aviso.classList.toggle('urgente', !!s.aviso?.urgente);
    aviso.textContent =
        !p         ? `No hay pedido registrado: se muestran los últimos ${DIAS_SIN_PEDIDO} días. Registra tu último pedido abajo.`
        : !s.aviso ? 'Aún no hay ventas para estimar cuándo pedir.'
        : s.aviso.urgente
            ? `⚠ Ya toca pedir: ${s.aviso.sku} alcanza ~${s.aviso.diasRestantes} días y el envío tarda 10–15.`
            : `Próximo pedido antes del ${formatoFecha(s.aviso.pedirAntes)} (${s.aviso.sku} alcanza ~${s.aviso.diasRestantes} días).`;
}

function renderHojas(s) {
    $('hidro-hojas').innerHTML = s.hojas.map(h => `
        <tr class="${h.alerta ? 'alerta' : ''}">
            <td><strong>${esc(h.sku)}</strong> ${esc(h.descripcion)}</td>
            <td>${h.pedido || '—'}</td>
            <td>${h.vendido}</td>
            <td>${h.pedido ? h.queda : '—'}</td>
            <td>${h.diasRestantes === null ? '—' : `~${h.diasRestantes} días`}</td>
        </tr>
    `).join('');

    const notas = Object.entries(s.grupos).map(([g, d]) =>
        `${g}: ${d.vendido} de ${d.minimo}${d.entra ? ' — entra al mensaje' : ' — se acumula hasta llegar a ' + d.minimo}`);
    const fuera = Object.entries(s.fueraKasr).map(([tipo, n]) => `${tipo}: ${n}`).join(' · ');
    if (fuera) notas.push(`Fuera de KASR — ${fuera}`);
    $('hidro-fuera').textContent = notas.join(' · ');
}

function cantidadesActuales() {
    return Object.fromEntries(SKUS.map((sku, i) => [sku, Math.max(0, parseInt($(`cant-${i}`).value, 10) || 0)]));
}

function actualizarMensaje() {
    const cantidades = cantidadesActuales();
    $('hidro-mensaje').textContent = armarMensaje(cantidades) || 'Sin piezas por pedir.';
    $('hidro-tarifa').textContent  = describirPedido(cantidades);
}

function renderCantidades(s) {
    $('hidro-cantidades').innerHTML = SKUS.map((sku, i) => `
        <div>
            <label for="cant-${i}">${esc(sku)}</label>
            <input type="number" id="cant-${i}" min="0" step="1" value="${s.sugerido[sku]}">
        </div>
    `).join('');
    $('hidro-cantidades').querySelectorAll('input').forEach(i => i.addEventListener('input', actualizarMensaje));
    actualizarMensaje();
}

function renderCotizaciones(ventas) {
    $('hidro-cotizaciones').innerHTML = ventas.map(v => `
        <tr class="${v.anulada ? 'anulada' : ''}">
            <td>${formatoFecha(v.fecha)}</td>
            <td>${esc(v.cliente || '—')}</td>
            <td>${esc((v.lineas || []).map(l => `${l.cantidad} ${l.tipo}`).join(', '))}</td>
            <td>${v.piezas}</td>
            <td>$${formatoNumero(v.total)}</td>
            <td>${v.anulada ? 'Anulada' : `<button class="btn-link" data-anular="${esc(v.id)}">Anular</button>`}</td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="muted">Sin cotizaciones registradas en el periodo.</td></tr>';
}

async function refrescar() {
    try {
        const { sugerencia, ventas } = await cargar();
        renderResumen(sugerencia);
        renderHojas(sugerencia);
        renderCantidades(sugerencia);
        renderCotizaciones(ventas);
    } catch (err) {
        console.error('Error cargando hidrogel:', err);
        const aviso = $('hidro-aviso');
        aviso.classList.remove('muted');
        aviso.classList.add('urgente');
        aviso.textContent = err.code === 'permission-denied'
            ? 'Firestore negó el acceso a hidrogel_ventas / hidrogel_pedidos. Agrega las reglas (ver hidrogel-mcp/README.md).'
            : `Error cargando datos: ${err.message}`;
    }
}

// ========== Acciones ==========

$('hidro-copiar').addEventListener('click', async () => {
    const texto = armarMensaje(cantidadesActuales());
    if (!texto) return estado('No hay piezas por pedir.');
    try {
        await navigator.clipboard.writeText(texto);
        estado('Mensaje copiado.');
    } catch {
        estado('No se pudo copiar; selecciona el texto a mano.');
    }
});

$('hidro-registrar').addEventListener('click', async function () {
    const items  = Object.fromEntries(Object.entries(cantidadesActuales()).filter(([, n]) => n > 0));
    const piezas = Object.values(items).reduce((a, b) => a + b, 0);
    if (!piezas) return estado('El pedido no tiene piezas.');

    const fecha = fechaPedido($('hidro-fecha').value);
    if (!confirm(`¿Registrar pedido a KASR de ${piezas} pzs con fecha ${formatoFecha(fecha)}?\n` +
                 'Desde esa fecha se cuentan las ventas del siguiente pedido.')) return;

    this.disabled = true;
    try {
        await PEDIDOS.add({
            fecha:     firebase.firestore.Timestamp.fromDate(fecha),
            proveedor: 'KASR',
            items,
            piezas,
            origen:    'web',
            creado:    firebase.firestore.FieldValue.serverTimestamp(),
        });
        estado('Pedido registrado.');
        await refrescar();
    } catch (err) {
        estado(`Error al registrar: ${err.message}`);
    } finally {
        this.disabled = false;
    }
});

$('hidro-cotizaciones').addEventListener('click', async e => {
    const id = e.target.dataset?.anular;
    if (!id || !confirm('¿Anular esta cotización? Deja de contar para el pedido.')) return;
    try {
        await VENTAS.doc(id).update({ anulada: true, motivo_anulacion: 'Anulada desde la pestaña' });
        await refrescar();
    } catch (err) {
        estado(`Error al anular: ${err.message}`);
    }
});

// ========== Init ==========

$('hidro-fecha').value = diaMx(new Date());
refrescar();
