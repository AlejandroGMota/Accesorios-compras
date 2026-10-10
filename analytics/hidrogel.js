// Pestaña Hidrogel: reponer a KASR lo vendido desde el último pedido.
// Las cotizaciones llegan desde el chat de Claude (conector hidrogel-mcp).

import {
    SKUS, SIN_KASR, DIAS_SIN_PEDIDO,
    periodos, sugerirPedido, armarMensaje, describirPedido, fechaPedido, diaMx, formatoFecha, formatoNumero,
} from './hidrogel-core.js';

const VENTAS  = db.collection('hidrogel_ventas');
const PEDIDOS = db.collection('hidrogel_pedidos');
const CONTEOS = db.collection('hidrogel_conteos');
const COMPRAS = db.collection('hidrogel_compras');   // Blue Ray y Tablet 13", que no son de KASR
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
    // Si las reglas de conteos y compras aún no están publicadas, la pestaña sigue sin ellos
    const opcional = (consulta, nombre) => consulta.get().catch(err => {
        console.warn(`Sin acceso a ${nombre}:`, err);
        return null;
    });
    const [snapPedidos, snapConteos, snapCompras] = await Promise.all([
        PEDIDOS.orderBy('fecha', 'desc').limit(50).get(),
        // Un documento por hoja contada; solo importa el último de cada una
        opcional(CONTEOS.orderBy('fecha', 'desc').limit(200), 'hidrogel_conteos'),
        opcional(COMPRAS.orderBy('fecha', 'desc').limit(50), 'hidrogel_compras'),
    ]);
    const pedidos    = snapPedidos.docs.map(aObjeto);
    const conteos    = snapConteos ? snapConteos.docs.map(aObjeto) : [];
    const compras    = snapCompras ? snapCompras.docs.map(aObjeto) : [];
    const snapVentas = await VENTAS.where('fecha', '>=', periodos(pedidos, ahora, conteos, compras).inicio).orderBy('fecha', 'desc').get();
    const ventas     = snapVentas.docs.map(aObjeto);
    const sugerencia = sugerirPedido({ ventas, pedidos, conteos, compras, ahora });
    // La tabla de cotizaciones muestra solo las del último periodo
    return { sugerencia, ventas: ventas.filter(v => v.fecha >= sugerencia.desde), sinConteos: !snapConteos || !snapCompras };
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
    aviso.classList.toggle('urgente', !!s.aviso?.urgente || s.noCuadran.length > 0);
    const cuando =
        !p         ? `No hay pedido registrado: se muestran los últimos ${DIAS_SIN_PEDIDO} días. Registra tu último pedido abajo.`
        : !s.aviso ? 'Aún no hay ventas para estimar cuándo pedir.'
        : s.aviso.urgente
            ? `⚠ Ya toca pedir: ${s.aviso.sku} alcanza ~${s.aviso.diasRestantes} días y el envío tarda 10–15.`
            : `Próximo pedido antes del ${formatoFecha(s.aviso.pedirAntes)} (${s.aviso.sku} alcanza ~${s.aviso.diasRestantes} días).`;
    const noCuadran = s.noCuadran.map(x => x.sku || x.descripcion).join(', ');
    aviso.textContent = noCuadran
        ? `⚠ No cuadra ${noCuadran}: se vendió más de lo que había. Falta contar o anular cotizaciones que no se concretaron. ${cuando}`
        : cuando;
}

const PEDIDO = { suman: 'pedidas',   de: 'del pedido del' };
const COMPRA = { suman: 'compradas', de: 'de la compra del' };

// «80 contadas el 10 oct 2026 + 30 pedidas» / «350 del pedido del 17 sep 2026» / «Sin conteo»
function partida(e, entrada) {
    if (e.conteo) return `${formatoNumero(e.base)} contadas el ${formatoFecha(e.conteo.fecha)}` +
                         (e.entro ? ` + ${formatoNumero(e.entro)} ${entrada.suman}` : '');
    if (e.pedido) return `${formatoNumero(e.base)} ${entrada.de} ${formatoFecha(e.pedido.fecha)}`;
    return 'Sin conteo';
}

function filaExistencia(nombre, x, diasRitmo, entrada) {
    const e = x.existencia;
    const noCuadra = e.queda !== null && e.queda < 0;
    // Sin de dónde partir, lo único que hay es cuánto se vende
    const vendido = e.queda === null ? `${x.enRitmo} en ${Math.round(diasRitmo)} días` : e.vendido;
    return `
        <tr class="${x.alerta || noCuadra ? 'alerta' : ''}">
            <td>${nombre}</td>
            <td>${partida(e, entrada)}</td>
            <td>${vendido}</td>
            <td>${e.queda === null ? '—' : noCuadra ? `${e.queda} · no cuadra` : e.queda}</td>
            <td>${x.diasRestantes === null ? '—' : `~${x.diasRestantes} días`}</td>
        </tr>`;
}

function renderHojas(s, sinConteos) {
    $('hidro-hojas').innerHTML = s.hojas.map(h =>
        filaExistencia(`<strong>${esc(h.sku)}</strong> ${esc(h.descripcion)}`, h, s.diasRitmo, PEDIDO)).join('');
    $('hidro-sin-kasr').innerHTML = s.sinKasr.map(x => filaExistencia(esc(x.descripcion), x, s.diasRitmo, COMPRA)).join('');

    const notas = Object.entries(s.grupos).map(([g, d]) =>
        `${g}: ${d.vendido} de ${d.minimo}${d.entra ? ' — entra al mensaje' : ' — se acumula hasta llegar a ' + d.minimo}`);
    if (sinConteos) notas.unshift('No se pudieron leer los conteos o las compras: publica firestore.rules (versión 3)');
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
        const { sugerencia, ventas, sinConteos } = await cargar();
        renderResumen(sugerencia);
        renderHojas(sugerencia, sinConteos);
        renderCantidades(sugerencia);
        renderCotizaciones(ventas);
    } catch (err) {
        console.error('Error cargando hidrogel:', err);
        const aviso = $('hidro-aviso');
        aviso.classList.remove('muted');
        aviso.classList.add('urgente');
        aviso.textContent = err.code === 'permission-denied'
            ? 'Firestore negó el acceso a hidrogel_ventas / hidrogel_pedidos / hidrogel_conteos. Publica firestore.rules.'
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

$('hidro-compra-registrar').addEventListener('click', async function () {
    const x      = SIN_KASR.find(p => p.id === $('hidro-compra-producto').value);
    const piezas = parseInt($('hidro-compra-piezas').value, 10);
    const salida = mensaje => { $('hidro-compra-estado').textContent = mensaje; };
    if (!x) return salida('Elige el producto.');
    if (!Number.isInteger(piezas) || piezas < 1) return salida('Pon cuántas piezas llegaron.');

    const fecha = fechaPedido($('hidro-compra-fecha').value);
    if (!confirm(`¿Registrar compra de ${piezas} ${x.descripcion} con fecha ${formatoFecha(fecha)}?\n` +
                 'Se suman a lo que queda. Una compra mal capturada se corrige con un conteo.')) return;

    this.disabled = true;
    try {
        await COMPRAS.add({
            fecha:  firebase.firestore.Timestamp.fromDate(fecha),
            items:  { [x.id]: piezas },
            piezas,
            origen: 'web',
            creado: firebase.firestore.FieldValue.serverTimestamp(),
        });
        $('hidro-compra-piezas').value = '';
        salida('Compra registrada.');
        await refrescar();
    } catch (err) {
        salida(err.code === 'permission-denied'
            ? 'Firestore no deja guardar compras todavía: publica firestore.rules (versión 3).'
            : `Error al registrar: ${err.message}`);
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
$('hidro-compra-fecha').value = diaMx(new Date());
$('hidro-compra-producto').innerHTML = SIN_KASR.map(x => `<option value="${esc(x.id)}">${esc(x.descripcion)}</option>`).join('');
refrescar();
