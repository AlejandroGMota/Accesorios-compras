// Pestaña Hidrogel: reponer a KASR lo vendido desde el último pedido.
// Las cotizaciones llegan desde el chat de Claude (conector hidrogel-mcp).

import {
    SKUS, SIN_KASR, DIAS_SIN_PEDIDO,
    periodos, sugerirPedido, armarMensaje, describirPedido, fechaPedido, llegadaDe, textoEstimado, diaMx, formatoFecha, formatoNumero, haceDias,
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
    return { id: doc.id, ...d, fecha: d.fecha.toDate(), ...(d.llegada && { llegada: d.llegada.toDate() }) };
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
    const llegada = p && llegadaDe(p);
    $('hidro-ultimo').textContent   = !p ? 'Sin registrar'
        : `${formatoFecha(p.fecha)} · ${llegada ? `llegó ${formatoFecha(llegada)}` : 'en camino'}`;
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

// Una hoja de KASR: lo pedido y lo vendido desde el último pedido, y cuánto queda
function filaHoja(h) {
    const q = h.existencia.queda;
    const noCuadra = q !== null && q < 0;
    return `
        <tr class="${h.alerta || noCuadra ? 'alerta' : ''}">
            <td><strong>${esc(h.sku)}</strong> ${esc(h.descripcion)}</td>
            <td>${h.pedido || '—'}</td>
            <td>${h.vendido}</td>
            <td>${q === null ? '—' : noCuadra ? `${q} · no cuadra` : q}${h.existencia.enCamino ? ` <span class="muted">+${h.existencia.enCamino} en camino</span>` : ''}</td>
            <td>${h.diasRestantes === null ? '—' : `~${h.diasRestantes} días`}</td>
        </tr>`;
}

// Pedidos hechos que no han llegado. «Ya llegó» guarda la fecha de llegada:
// desde ahí esas piezas cuentan en el cajón. La fecha del pedido no se toca,
// porque de ella sale lo que repone el siguiente pedido.
function renderEnCamino(s) {
    const caja = $('hidro-en-camino');
    const hoy  = diaMx(new Date());
    caja.hidden = !s.enCamino.length;
    caja.innerHTML = s.enCamino.map(p => {
        const dias = Math.floor((Date.now() - p.fecha) / 86400000);
        const detalle = Object.entries(p.items || {}).map(([sku, n]) => `${sku} ${n}`).join(', ');
        return `
            <div class="pedido-camino">
                <p class="pedido-camino-texto"><strong>En camino:</strong> pedido del ${formatoFecha(p.fecha)} (${haceDias(dias)}),
                    ${formatoNumero(p.piezas || 0)} pzs; ${esc(textoEstimado(p, s.envio))}<br><span class="muted">${esc(detalle)}</span></p>
                <input type="date" value="${hoy}" max="${hoy}" aria-label="Fecha de llegada" data-llegada-fecha="${esc(p.id)}">
                <button class="btn-primary" data-llego="${esc(p.id)}">Ya llegó</button>
            </div>`;
    }).join('');
}

// «12 contadas el 10 oct 2026 + 20 compradas» / «20 de la compra del 15 oct 2026» / «Sin conteo»
function partida(e) {
    if (e.conteo) return `${formatoNumero(e.base)} contadas el ${formatoFecha(e.conteo.fecha)}` +
                         (e.entro ? ` + ${formatoNumero(e.entro)} compradas` : '');
    if (e.pedido) return `${formatoNumero(e.base)} de la compra del ${formatoFecha(e.pedido.fecha)}`;
    return 'Sin conteo';
}

// Un producto sin KASR
function filaExistencia(nombre, x, diasRitmo) {
    const e = x.existencia;
    const noCuadra = e.queda !== null && e.queda < 0;
    // Sin de dónde partir, lo único que hay es cuánto se vende
    const vendido = e.queda === null ? `${x.enRitmo} en ${Math.round(diasRitmo)} días` : e.vendido;
    return `
        <tr class="${x.alerta || noCuadra ? 'alerta' : ''}">
            <td>${nombre}</td>
            <td>${partida(e)}</td>
            <td>${vendido}</td>
            <td>${e.queda === null ? '—' : noCuadra ? `${e.queda} · no cuadra` : e.queda}</td>
            <td>${x.diasRestantes === null ? '—' : `~${x.diasRestantes} días`}</td>
        </tr>`;
}

function renderHojas(s, sinConteos) {
    $('hidro-hojas').innerHTML = s.hojas.map(filaHoja).join('');
    $('hidro-sin-kasr').innerHTML = s.sinKasr.map(x => filaExistencia(esc(x.descripcion), x, s.diasRitmo)).join('');

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
        renderEnCamino(sugerencia);
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
                 'Desde esa fecha se cuentan las ventas del siguiente pedido. Queda en camino hasta que le des «Ya llegó».')) return;

    this.disabled = true;
    try {
        await PEDIDOS.add({
            fecha:     firebase.firestore.Timestamp.fromDate(fecha),
            proveedor: 'KASR',
            items,
            piezas,
            estado:    'en_camino',
            origen:    'web',
            creado:    firebase.firestore.FieldValue.serverTimestamp(),
        });
        estado('Pedido registrado: queda en camino.');
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

$('hidro-en-camino').addEventListener('click', async e => {
    const id = e.target.dataset?.llego;
    if (!id) return;
    const campo   = $('hidro-en-camino').querySelector(`[data-llegada-fecha="${CSS.escape(id)}"]`);
    const llegada = fechaPedido(campo.value);
    if (!confirm(`¿Registrar que el pedido llegó el ${formatoFecha(llegada)}?\n` +
                 'Desde esa fecha sus piezas cuentan en lo que queda.')) return;
    e.target.disabled = true;
    try {
        await PEDIDOS.doc(id).update({
            estado:  'llegado',
            llegada: firebase.firestore.Timestamp.fromDate(llegada),
        });
        estado('Llegada registrada.');
        await refrescar();
    } catch (err) {
        e.target.disabled = false;
        estado(`Error al registrar la llegada: ${err.message}`);
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
