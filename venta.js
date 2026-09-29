// Registro de ventas de fundas. El local va en la URL: venta.html?id=<idDelLocal>
//
// Es la única pantalla que anota lo que SALE. La app siempre registró lo que se
// compra al proveedor (`items` y los históricos `micas_compras`/`fundas_compras`),
// pero nunca lo que se vende, y sin eso no se puede saber qué modelos piden más
// los clientes ni qué tipo de funda rota más rápido.
//
// Todo el diseño obedece a una sola restricción: una venta tiene que costar
// menos de diez segundos, de pie en el local, en un teléfono. De ahí que sean
// botones grandes en vez de un formulario, que no haya que escribir nada en el
// caso normal, que el precio no se pida, y que la pantalla se pueda usar con el
// catálogo guardado de la vez anterior sin esperar a Firestore.
//
// Caso normal: 3 toques (modelo → tipo → Registrar venta).

// ========== Catálogos fijos ==========
// Los mismos siete tipos y seis colores del formulario de la lista
// (`local.html`), para que compra y venta hablen del mismo vocabulario.
const TIPOS_FUNDA = ['Magsafe', 'Transparente', '3 piezas', 'Diseño hombre',
                     'Diseño mujer', 'Uso rudo', 'Color'];
const COLORES_FUNDA = ['Rojo', 'Azul', 'Menta', 'Lila', 'Negro', 'Rosa'];
const SIN_COLOR = 'Sin especificar';

const TIANGUIS_ID = 'tianguis';
const MAX_VENTAS_HOY = 12;      // cuántas se listan abajo
const AVISO_MS = 4500;          // cuánto se queda el «Deshacer» a la vista

// ========== Estado ==========
let LOCAL_ID = null;
let catalogo = [];              // [{ modelo, clave, piezas, piezasLocal, ventasLocal, ultimoMs }]
let aliasMap = new Map();
let ventasHoy = [];
let modelosEscritos = [];       // modelos usados «tal cual» en este teléfono
const escritasAqui = new Map(); // id → hora en que se registró aquí, para ordenar

const estado = { modelo: null, modeloOriginal: null, delCatalogo: false, tipo: null, color: SIN_COLOR, cantidad: 1 };

const $ = id => document.getElementById(id);

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ========== Normalización de modelos ==========
// Copia de `claveNombre` de analytics/analytics.js (la normalización «de
// lectura», que agrupa variantes como "13pm" y "iPhone 13 Pro Max"). Está
// duplicada a propósito: analytics.js es de otro carril y no se puede cargar
// aquí sin arrastrar su arranque. PENDIENTE para quien toque ese archivo:
// sacarla a un `modelos.js` compartido y que esta pantalla, lista-core.js y
// analytics.js usen la misma.
function claveModelo(nombre) {
    return String(nombre || '')
        .toLowerCase()
        .replace(/\s+(deja|dejo|dejó|encargo|encargó)(?=\s|$).*$/, '')
        .replace(/\d{7,}/g, '')
        .replace(/[\s.,;:]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^op /, 'oppo ')
        .replace(/^(iphone|ip|i) ?(?=\d)/, '')
        .replace(/^iphone ?(?=x|se\b)/, '')
        .replace(/^(\d{1,2}) ?(pm|pro ?max)$/, '$1 pro max')
        .replace(/^(\d{1,2}) ?(pro|plus|mini)$/, '$1 $2');
}

// El mismo diccionario que usa Micas: un iPhone es el mismo modelo lleve mica
// o funda, así que no hay un aliases.csv aparte para fundas.
async function cargarAliases() {
    try {
        const resp = await fetch('analytics/aliases.csv');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const mapa = new Map();
        (await resp.text()).trim().split('\n').slice(1).forEach(linea => {
            const [alias, nombre] = linea.split(',').map(s => s.trim());
            if (!alias || !nombre) return;
            mapa.set(claveModelo(alias), nombre);
            if (!mapa.has(claveModelo(nombre))) mapa.set(claveModelo(nombre), nombre);
        });
        return mapa;
    } catch (err) {
        console.warn('aliases.csv no disponible, se guarda el nombre tal cual:', err);
        return new Map();
    }
}

// ========== Memoria del teléfono ==========
// El catálogo guardado es lo que permite que la pantalla abra ya usable: sin
// esto, la primera venta del día espera a que Firestore conteste.
const claveCache = () => `venta:catalogo:${LOCAL_ID}`;
const claveEscritos = () => `venta:modelos:${LOCAL_ID}`;

function leerGuardado(clave, porDefecto) {
    try {
        const crudo = localStorage.getItem(clave);
        return crudo ? JSON.parse(crudo) : porDefecto;
    } catch (err) {
        return porDefecto;
    }
}

function guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (err) { /* modo privado, sin espacio: da igual */ }
}

// ========== Catálogo derivado del historial ==========
// No hay colección de catálogo: los modelos son los que aparecen en el
// historial de compras (`fundas_compras`), más los que ya se vendieron alguna
// vez. Así solo salen modelos que de verdad se manejan y no hay nada que
// mantener a mano.
function sumarAlCatalogo(mapa, { nombre, normalizado, piezas = 0, esDeEsteLocal, ms = 0, esVenta = false }) {
    const texto = String(nombre || '').trim();
    if (!texto) return;
    const clave = claveModelo(texto);
    if (!clave) return;

    // Cómo se llama el modelo: manda el alias; si aliases.csv no cargó (pasa si
    // el teléfono abre sin señal), vale el nombre ya normalizado que guardó la
    // compra; y si tampoco hay, lo que se escribió.
    const mostrar = aliasMap.get(clave) || String(normalizado || '').trim() || texto;

    const entrada = mapa.get(clave) ?? {
        clave, modelo: mostrar,
        piezas: 0, piezasLocal: 0, ventasLocal: 0, ultimoMs: 0,
    };
    if (aliasMap.has(clave)) entrada.modelo = aliasMap.get(clave);
    else if (ms >= entrada.ultimoMs) entrada.modelo = mostrar;

    if (esVenta) { if (esDeEsteLocal) entrada.ventasLocal += piezas; }
    else {
        entrada.piezas += piezas;
        if (esDeEsteLocal) entrada.piezasLocal += piezas;
    }
    entrada.ultimoMs = Math.max(entrada.ultimoMs, ms);
    mapa.set(clave, entrada);
}

// Arriba, lo que este local mueve: primero lo que ya vendió aquí, luego lo que
// compró aquí, y al final lo de los demás locales. Dentro de cada grupo, lo más
// reciente primero.
const puntaje = m => (m.ventasLocal * 1000) + (m.piezasLocal * 10) + Math.min(m.piezas, 9);

function ordenarCatalogo(lista) {
    return lista.sort((a, b) => puntaje(b) - puntaje(a) || b.ultimoMs - a.ultimoMs
        || a.modelo.localeCompare(b.modelo, 'es'));
}

async function construirCatalogo() {
    const mapa = new Map();

    // 1. Historial de compras. Puede no existir todavía (la está creando el
    //    registro de compras de fundas) o estar denegada si las reglas nuevas
    //    no se han publicado: en ninguno de los dos casos se bloquea la venta.
    try {
        const snap = await db.collection('fundas_compras').get();
        snap.docs.forEach(d => {
            const c = d.data();
            if (c.anulado === true || c.estado === 'anulado') return;   // un dedazo borrado no es catálogo
            const fecha = c.comprado ?? c.fecha;
            sumarAlCatalogo(mapa, {
                nombre: c.modelo_original || c.modelo,
                normalizado: c.modelo,
                piezas: Number(c.cantidad) || 1,
                esDeEsteLocal: c.local === LOCAL_ID,
                ms: fecha?.toMillis?.() ?? 0,
            });
        });
    } catch (err) {
        console.warn('No se pudo leer fundas_compras (¿todavía no existe o las reglas no están publicadas?):', err);
    }

    // 2. Lo que ya se vendió: un modelo escrito a mano una vez queda en el
    //    catálogo para las siguientes, y así el hueco se cierra solo.
    try {
        const snap = await db.collection('fundas_ventas')
            .where('local', '==', LOCAL_ID)
            .where('año', '==', new Date().getFullYear())
            .get();
        snap.docs.forEach(d => {
            const v = d.data();
            if (v.anulada === true) return;
            sumarAlCatalogo(mapa, {
                nombre: v.modelo_original || v.modelo,
                normalizado: v.modelo,
                piezas: Number(v.cantidad) || 1,
                esDeEsteLocal: true,
                ms: v.fecha?.toMillis?.() ?? 0,
                esVenta: true,
            });
        });
    } catch (err) {
        console.warn('No se pudieron leer las ventas anteriores:', err);
    }

    // 3. Lo escrito «tal cual» en este teléfono, aunque su venta ya se anulara
    modelosEscritos.forEach(nombre => sumarAlCatalogo(mapa, { nombre, esDeEsteLocal: true }));

    return ordenarCatalogo([...mapa.values()]);
}

// ========== Pintado de los pasos ==========
function chip(texto, valor, activo, nota) {
    return `<button type="button" class="chip" data-valor="${escapeHtml(valor)}" aria-pressed="${activo ? 'true' : 'false'}">`
        + escapeHtml(texto)
        + (nota ? `<span class="chip-nota">${escapeHtml(nota)}</span>` : '')
        + '</button>';
}

function pintarTipos() {
    // Orden fijo, siempre el mismo: la posición de cada tipo se aprende con el
    // dedo y eso vale más que ordenarlos por frecuencia.
    $('tiposGrid').innerHTML = TIPOS_FUNDA
        .map(t => chip(t, t, estado.tipo === t)).join('');
}

function pintarColores() {
    $('coloresGrid').innerHTML = [SIN_COLOR, ...COLORES_FUNDA]
        .map(c => chip(c, c, estado.color === c)).join('');
}

function pintarModelos() {
    const texto = $('buscarModelo').value.trim();
    const q = claveModelo(texto);
    const lista = q
        ? catalogo.filter(m => m.clave.includes(q) || m.modelo.toLowerCase().includes(texto.toLowerCase()))
        : catalogo;

    const chips = lista.slice(0, 60).map(m => chip(m.modelo, m.modelo, false));

    // Nunca bloquear una venta por un problema de catálogo: si el modelo no
    // está (porque su compra no se registró, o porque el catálogo está vacío),
    // se guarda tal cual y después se corrige con aliases.csv.
    const hayExacto = lista.some(m => m.clave === q);
    if (texto && !hayExacto)
        chips.push(chip(`Usar «${texto}»`, texto, false, 'no está en el catálogo'));

    $('modelosGrid').innerHTML = chips.join('');

    const vacio = $('modelosVacio');
    if (!catalogo.length && !texto) {
        vacio.hidden = false;
        vacio.textContent = 'Todavía no hay historial de compras de fundas, así que no hay catálogo. Escribe el modelo que vendiste y se guarda igual; en cuanto se registren compras, aparecerá aquí solo.';
    } else if (!chips.length) {
        vacio.hidden = false;
        vacio.textContent = 'Ningún modelo coincide.';
    } else {
        vacio.hidden = true;
    }

    $('contadorModelos').textContent = catalogo.length
        ? `${catalogo.length} modelo${catalogo.length === 1 ? '' : 's'}`
        : '';
}

function pintarSeleccion() {
    const hayModelo = Boolean(estado.modelo);

    $('modeloElegido').hidden     = !hayModelo;
    $('modeloPicker').hidden      =  hayModelo;
    $('modeloElegidoTexto').textContent = estado.modelo ?? '';
    $('pasoTipo').hidden          = !hayModelo;
    $('pasoColor').hidden         = !(hayModelo && estado.tipo);

    const listo = hayModelo && Boolean(estado.tipo);
    $('registrarBtn').disabled = !listo;
    $('menosBtn').disabled     = estado.cantidad <= 1;
    $('cantidadValor').textContent = estado.cantidad;

    $('barraResumen').innerHTML = !hayModelo
        ? 'Elige el modelo'
        : (!estado.tipo
            ? `<strong>${escapeHtml(estado.modelo)}</strong> · elige el tipo`
            : `<strong>${escapeHtml(estado.modelo)}</strong> · ${escapeHtml(estado.tipo)}`
              + (estado.color !== SIN_COLOR ? ` · ${escapeHtml(estado.color)}` : ''));
}

function reiniciarSeleccion() {
    estado.modelo = estado.modeloOriginal = estado.tipo = null;
    estado.delCatalogo = false;
    estado.color = SIN_COLOR;
    estado.cantidad = 1;
    $('buscarModelo').value = '';
    pintarModelos();
    pintarTipos();
    pintarColores();
    pintarSeleccion();
    window.scrollTo({ top: 0 });
}

// ========== Aviso de guardado ==========
// No es un toast cualquiera: solo el botón recibe toques, así que el aviso
// puede seguir a la vista mientras ya se está capturando la venta siguiente.
let avisoTimer;
function mostrarAviso(texto, tipo = 'success', accion = null) {
    const aviso = $('avisoGuardado');
    const boton = $('avisoGuardadoBtn');
    $('avisoGuardadoTexto').textContent = texto;
    aviso.className = 'show' + (tipo === 'error' ? ' error' : '');

    boton.hidden = !accion;
    boton.onclick = null;
    if (accion) {
        boton.textContent = accion.texto;
        boton.onclick = () => { aviso.className = ''; accion.hacer(); };
    }

    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { aviso.className = ''; }, tipo === 'error' ? AVISO_MS * 2 : AVISO_MS);
}

// ========== Registrar y deshacer ==========
function registrarVenta() {
    if (!estado.modelo || !estado.tipo) return;

    const ahora = new Date();
    const venta = {
        modelo:          estado.modelo,
        modelo_original: estado.modeloOriginal ?? estado.modelo,
        tipo:            estado.tipo,
        color:           estado.color,
        cantidad:        estado.cantidad,
        local:           LOCAL_ID,
        fecha:           firebase.firestore.FieldValue.serverTimestamp(),
        mes:             ahora.getMonth() + 1,
        año:             ahora.getFullYear(),
    };
    const resumen = `${estado.modelo} · ${estado.tipo}`;
    const ref = db.collection('fundas_ventas').doc();
    escritasAqui.set(ref.id, Date.now());

    // A propósito sin `await`: sin señal la promesa no se resuelve hasta que
    // vuelve la conexión, y dejar el botón en «Guardando…» a media venta es
    // justo lo que hace que la gente deje de registrar. La venta ya quedó en la
    // cola del teléfono y la lista de abajo la muestra marcada «sin subir».
    ref.set(venta).catch(err => {
        console.error('No se pudo guardar la venta:', err);
        mostrarAviso(`No se guardó: ${resumen}`, 'error',
            { texto: 'Reintentar', hacer: () => ref.set(venta).catch(() => {}) });
    });

    // Si se vendió un modelo que no estaba en el catálogo, este teléfono lo
    // recuerda para la próxima. El hueco se cierra solo, sin catálogo a mano.
    const escrito = estado.modeloOriginal ?? estado.modelo;
    if (!estado.delCatalogo && !catalogo.some(m => m.clave === claveModelo(escrito)))
        recordarModeloEscrito(escrito);

    mostrarAviso(`Vendida: ${resumen}`, 'success',
        { texto: 'Deshacer', hacer: () => anular(ref.id, true) });
    reiniciarSeleccion();
}

// Una venta mal capturada no se borra: se marca. Así el historial conserva que
// hubo una corrección, y las reglas pueden prohibir el borrado (que es lo único
// irreversible) sin estorbar.
function anular(id, anulada) {
    db.collection('fundas_ventas').doc(id).update({ anulada }).catch(err => {
        console.error('No se pudo anular la venta:', err);
        mostrarAviso('No se pudo cambiar la venta. Revisa tu conexión.', 'error');
    });
    if (anulada) mostrarAviso('Venta anulada', 'success');
}

function recordarModeloEscrito(nombre) {
    const texto = String(nombre || '').trim();
    if (!texto || modelosEscritos.some(m => claveModelo(m) === claveModelo(texto))) return;
    modelosEscritos.unshift(texto);
    modelosEscritos = modelosEscritos.slice(0, 40);
    guardar(claveEscritos(), modelosEscritos);
    if (!catalogo.some(m => m.clave === claveModelo(texto))) {
        catalogo = ordenarCatalogo([...catalogo,
            { clave: claveModelo(texto), modelo: aliasMap.get(claveModelo(texto)) ?? texto,
              piezas: 0, piezasLocal: 0, ventasLocal: 1, ultimoMs: Date.now() }]);
        guardar(claveCache(), catalogo);
        pintarModelos();
    }
}

// ========== Ventas de hoy ==========
const esDeHoy = fecha => {
    const f = fecha?.toDate?.();
    if (!f) return true;               // recién escrita, todavía sin sello del servidor
    const hoy = new Date();
    return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth()
        && f.getDate() === hoy.getDate();
};

function pintarVentasHoy() {
    const cont = $('hoyLista');
    // Una venta recién registrada todavía no trae la fecha del servidor: se
    // ordena con la hora en que se tocó el botón en este teléfono, y las de
    // otro aparato que aún no aterrizan se van arriba.
    const cuando = v => v.fecha?.toMillis?.() ?? escritasAqui.get(v.id) ?? Number.MAX_SAFE_INTEGER;
    const deHoy = ventasHoy.filter(v => esDeHoy(v.fecha)).sort((a, b) => cuando(b) - cuando(a));

    const piezas = deHoy.filter(v => v.anulada !== true)
        .reduce((s, v) => s + (Number(v.cantidad) || 0), 0);
    $('hoyTotal').textContent = piezas ? `${piezas} pz` : '';

    if (!deHoy.length) {
        cont.innerHTML = '<p class="muted">Todavía nada hoy.</p>';
        return;
    }

    cont.innerHTML = deHoy.slice(0, MAX_VENTAS_HOY).map(v => {
        const hora = v.fecha?.toDate?.()
            ? v.fecha.toDate().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
            : 'ahora';
        const detalle = [
            v.color && v.color !== SIN_COLOR ? v.color : null,
            (Number(v.cantidad) || 1) > 1 ? `${v.cantidad} pz` : null,
            hora,
            v.pendiente ? 'sin subir' : null,
        ].filter(Boolean).join(' · ');
        return `
        <div class="venta${v.anulada === true ? ' anulada' : ''}">
            <span class="venta-texto">
                ${escapeHtml(v.modelo ?? '')} · ${escapeHtml(v.tipo ?? '')}
                <span class="venta-detalle">${escapeHtml(detalle)}</span>
            </span>
            <button type="button" class="venta-accion" data-id="${escapeHtml(v.id)}"
                data-anular="${v.anulada === true ? 'no' : 'si'}"
                aria-label="${v.anulada === true ? 'Rehacer esta venta' : 'Anular esta venta'}">${v.anulada === true ? 'Rehacer' : '✕'}</button>
        </div>`;
    }).join('');
}

// Consulta solo con igualdades (local + año + mes): Firestore la resuelve sin
// índice compuesto. Ordenar por fecha en la consulta sí lo pediría, así que el
// orden se hace aquí. `includeMetadataChanges` es para que la marca de «sin
// subir» desaparezca en cuanto el servidor confirma.
function escucharVentasDeHoy() {
    const ahora = new Date();
    const recibir = snap => {
        ventasHoy = snap.docs.map(d => ({ id: d.id, pendiente: d.metadata.hasPendingWrites, ...d.data() }));
        pintarVentasHoy();
    };
    const porLocal = db.collection('fundas_ventas').where('local', '==', LOCAL_ID);

    porLocal.where('año', '==', ahora.getFullYear()).where('mes', '==', ahora.getMonth() + 1)
        .onSnapshot({ includeMetadataChanges: true }, recibir, err => {
            console.warn('La consulta por mes falló, se escucha solo por local:', err);
            porLocal.onSnapshot({ includeMetadataChanges: true }, recibir,
                err2 => console.error('No se pudieron leer las ventas de hoy:', err2));
        });
}

// ========== Toques ==========
function conectarToques() {
    $('modelosGrid').addEventListener('click', e => {
        const boton = e.target.closest('.chip');
        if (!boton) return;
        const texto = boton.dataset.valor;
        const entrada = catalogo.find(m => m.clave === claveModelo(texto));
        estado.modeloOriginal = texto;
        estado.delCatalogo = Boolean(entrada);
        // Se guarda normalizado (el alias de siempre) pero conservando lo que se
        // escribió, igual que hace Micas con `nombre_original`.
        estado.modelo = entrada?.modelo ?? aliasMap.get(claveModelo(texto)) ?? texto;
        pintarSeleccion();
    });

    $('cambiarModeloBtn').addEventListener('click', () => {
        estado.modelo = estado.modeloOriginal = null;
        estado.delCatalogo = false;
        pintarModelos();
        pintarSeleccion();
    });

    $('buscarModelo').addEventListener('input', pintarModelos);

    $('tiposGrid').addEventListener('click', e => {
        const boton = e.target.closest('.chip');
        if (!boton) return;
        estado.tipo = boton.dataset.valor;
        pintarTipos();
        pintarSeleccion();
    });

    $('coloresGrid').addEventListener('click', e => {
        const boton = e.target.closest('.chip');
        if (!boton) return;
        estado.color = boton.dataset.valor;
        pintarColores();
        pintarSeleccion();
    });

    $('masBtn').addEventListener('click', () => {
        estado.cantidad = Math.min(estado.cantidad + 1, 99);
        pintarSeleccion();
    });

    $('menosBtn').addEventListener('click', () => {
        estado.cantidad = Math.max(estado.cantidad - 1, 1);
        pintarSeleccion();
    });

    $('registrarBtn').addEventListener('click', registrarVenta);

    $('hoyLista').addEventListener('click', e => {
        const boton = e.target.closest('.venta-accion');
        if (!boton) return;
        anular(boton.dataset.id, boton.dataset.anular === 'si');
    });
}

// ========== Arranque ==========
function mostrarAvisoDePantalla(html) {
    $('aviso').innerHTML = html;
    $('aviso').hidden = false;
    $('flujo').hidden = true;
    $('barraRegistrar').hidden = true;
}

function abrirFlujo(nombre) {
    $('aviso').hidden = true;
    $('flujo').hidden = false;
    $('barraRegistrar').hidden = false;
    if (nombre) {
        $('nombreLocal').textContent = nombre;
        document.title = `${nombre} · Vender`;
    }
    const liga = $('ligaLista');
    liga.href = LOCAL_ID === TIANGUIS_ID ? 'index.html' : `local.html?id=${encodeURIComponent(LOCAL_ID)}`;
    liga.hidden = false;
}

// Sin `id` en la URL no es un error: es que alguien abrió la pantalla sin su
// acceso directo. Se ofrecen los locales en vez de dejarlo en un callejón.
async function elegirLocal() {
    mostrarAvisoDePantalla('<h2>¿De qué local?</h2><p class="muted">Cargando…</p>');
    try {
        const snap = await db.collection('locales').get();
        const activos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(l => l.activo !== false)
            .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
        mostrarAvisoDePantalla('<h2>¿De qué local?</h2>'
            + '<p class="chart-note">Guarda la liga de tu local en la pantalla del teléfono y ya no vuelve a preguntar.</p>'
            + activos.map(l => `<a class="local-card" href="venta.html?id=${encodeURIComponent(l.id)}">`
                + `<span class="local-nombre">${escapeHtml(l.nombre ?? l.id)}</span>`
                + '<span class="local-detalle">Registrar ventas</span></a>').join(''));
    } catch (err) {
        console.error('No se pudieron cargar los locales:', err);
        mostrarAvisoDePantalla('<h2>Falta el local</h2><p class="muted">Este enlace no dice de qué local es. Ábrelo desde <a href="locales.html">Locales</a>.</p>');
    }
}

// 'ok' | 'no-existe' | 'sin-red'. Quedarse sin red no puede impedir vender.
async function revisarLocal() {
    try {
        const doc = await db.collection('locales').doc(LOCAL_ID).get();
        if (!doc.exists) return { estado: 'no-existe' };
        return { estado: 'ok', nombre: doc.data().nombre, activo: doc.data().activo !== false };
    } catch (err) {
        console.warn('No se pudo confirmar el local:', err);
        return { estado: 'sin-red' };
    }
}

async function refrescarCatalogo() {
    const nuevo = await construirCatalogo();
    if (!nuevo.length && catalogo.length) return;   // sin permisos o sin red: mejor lo guardado
    catalogo = nuevo;
    guardar(claveCache(), catalogo);
    if (!estado.modelo) pintarModelos();
}

window.addEventListener('DOMContentLoaded', async () => {
    LOCAL_ID = new URLSearchParams(location.search).get('id');
    conectarToques();
    pintarTipos();
    pintarColores();

    await firebaseListo;

    if (!LOCAL_ID) { await elegirLocal(); return; }

    // Lo guardado de la vez pasada primero: así la pantalla ya sirve mientras
    // Firestore contesta. Es la diferencia entre 3 segundos y 3 toques con espera.
    modelosEscritos = leerGuardado(claveEscritos(), []);
    catalogo = ordenarCatalogo(leerGuardado(claveCache(), []));
    if (catalogo.length) {
        abrirFlujo(null);
        pintarModelos();
        pintarSeleccion();
    }

    const local = await revisarLocal();
    if (local.estado === 'no-existe') {
        mostrarAvisoDePantalla('<h2>Local no encontrado</h2><p class="muted">Este local ya no existe. Revisa la lista en <a href="locales.html">Locales</a>.</p>');
        return;
    }
    abrirFlujo(local.nombre ?? 'Vender');
    if (local.estado === 'sin-red')
        document.querySelector('.header-subtitle').textContent = 'Sin conexión: se sube después';
    else if (local.activo === false)
        document.querySelector('.header-subtitle').textContent = 'Local marcado como inactivo';

    pintarModelos();
    pintarSeleccion();
    escucharVentasDeHoy();

    aliasMap = await cargarAliases();
    await refrescarCatalogo();
});
