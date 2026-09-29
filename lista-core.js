// Núcleo compartido por la lista del tianguis (index.html) y la de cada local
// (local.html). Cada producto es un documento de la colección `items`, con el
// campo `local` diciendo de quién es. Antes todo vivía en un solo documento
// (`app/productos`) como un array, y dos personas guardando a la vez se
// pisaban la una a la otra sin avisar.

// ========== Notificaciones ==========
let toastTimer;
function showToast(message, type = 'default', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'show' + (type !== 'default' ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, duration);
}

// ========== Estado ==========
const ITEMS_REF = db.collection('items');
const LOCALES_REF = db.collection('locales');

let currentItems = [];   // { id, ...datos }
let LOCAL_ID     = null; // de qué local es esta lista
let CON_PRECIOS  = true; // el local no ve precios ni totales

// ========== Catálogo de categorías ==========
const CATEGORIAS = ['Micas', 'Hidrogel', 'Fundas', 'Fundas nuevas', '1hora', 'Refacciones', 'Otros'];

const PRECIOS_MICA     = { '9D': 60, '9H': 35, 'Privacidad': 18 };
const PRECIO_HIDROGEL  = { privacidad: 330, otros: 180 };

const LISTA_IDS = [
    'micas9DList', 'micas9HList', 'micasPrivacidadList', 'micasSinTipoList',
    'hidrogelList', 'fundasList', 'fundasNuevasList',
    'unaHoraList', 'refaccionesList', 'otrosList'
];

const OPTION_IDS = ['micaOptions', 'hidrogelOptions', 'fundaColors', 'fundaTypes', 'fundasNuevasOptions', 'unaHoraOptions'];

// ========== Datos ==========
async function agregarItem(datos) {
    try {
        const ref = await ITEMS_REF.add({
            ...datos,
            local:    LOCAL_ID,
            comprada: null,
            creado:   Date.now(),   // orden de la lista; la fecha real de compra la lleva Analytics
        });
        return ref;
    } catch (err) {
        console.error('Error al guardar en Firestore:', err);
        showToast('Error al guardar. Revisa tu conexión.', 'error', 5000);
        return null;
    }
}

async function actualizarItem(id, cambios) {
    try {
        await ITEMS_REF.doc(id).update(cambios);
        return true;
    } catch (err) {
        console.error('Error al actualizar en Firestore:', err);
        showToast('Error al guardar. Revisa tu conexión.', 'error', 5000);
        return false;
    }
}

// ========== DOM: dónde va cada producto ==========
function getProductList(product) {
    if (product.category === 'Micas') {
        const map = { '9D': 'micas9DList', '9H': 'micas9HList', 'Privacidad': 'micasPrivacidadList' };
        return document.getElementById(map[product.type] ?? 'micasSinTipoList');
    }
    if (product.category === 'Hidrogel')      return document.getElementById('hidrogelList');
    if (product.category === 'Fundas')         return document.getElementById('fundasList');
    if (product.category === 'Fundas nuevas')  return document.getElementById('fundasNuevasList');
    if (product.category === '1hora')          return document.getElementById('unaHoraList');
    return document.getElementById(`${product.category.toLowerCase()}List`);
}

function buildProductDetails(product) {
    let html = '';
    if (product.category === 'Hidrogel' && product.type)
        html += `<p><span>Tipo:</span> ${escapeHtml(product.type)}</p>`;
    if (product.category === 'Fundas' && product.colors?.length)
        html += `<p><span>Colores:</span> ${escapeHtml(product.colors.join(', '))}</p>`;
    if (product.category === 'Fundas' && product.fundaTypes?.length)
        html += `<p><span>Tipo:</span> ${escapeHtml(product.fundaTypes.join(', '))}</p>`;
    if (['Fundas nuevas', '1hora'].includes(product.category) && product.type)
        html += `<p><span>Tipo:</span> ${escapeHtml(product.type)}</p>`;
    return html;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addProductToDOM(product) {
    const list = getProductList(product);
    if (!list) return;

    const fechaCompra = product.comprada
        ? new Date(product.comprada).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
        : '';

    const div = document.createElement('div');
    // Ya se palomea en todas las categorías, no solo en micas
    div.className = `product con-compra${product.comprada ? ' comprada' : ''}`;
    div.innerHTML = `
        <h3>${escapeHtml(product.name)}</h3>
        ${CON_PRECIOS ? `<p><span>Precio:</span> $${(product.price ?? 0).toFixed(2)}</p>` : ''}
        <p><span>Cantidad:</span> ${product.quantity}</p>
        ${buildProductDetails(product)}
        ${product.comprada ? `<p class="compra-nota">Comprada el ${fechaCompra}</p>` : ''}
        <button class="buyBtn" data-id="${product.id}"
            aria-label="${product.comprada ? 'Quitar la marca de comprada' : 'Marcar como comprada'}"
            title="${product.comprada ? 'Comprada: clic para quitar la marca' : 'Marcar como comprada'}">✓</button>
        <button class="deleteBtn" data-id="${product.id}" aria-label="Eliminar producto">✕</button>
    `;
    // El id del documento no cambia aunque la lista se redibuje, así que el
    // clic siempre cae en el producto correcto
    div.querySelector('.buyBtn').addEventListener('click', () => toggleComprada(product.id));
    div.querySelector('.deleteBtn').addEventListener('click', () => deleteProduct(product.id));
    list.appendChild(div);
}

function clearAllProductLists() {
    LISTA_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function renderAllProducts(products) {
    clearAllProductLists();
    products.forEach(addProductToDOM);

    // Micas viejas sin tipo: suman al subtotal, así que se muestran para poder borrarlas
    const sinTipoHeader = document.getElementById('micasSinTipoHeader');
    const sinTipoList   = document.getElementById('micasSinTipoList');
    if (sinTipoHeader && sinTipoList)
        sinTipoHeader.style.display = sinTipoList.children.length ? '' : 'none';

    const compradas = products.filter(p => p.comprada).length;
    const boton = document.getElementById('borrarCompradasBtn');
    if (boton) {
        boton.disabled = compradas === 0;
        boton.textContent = `Borrar compradas (${compradas})`;
    }

    if (CON_PRECIOS) updateTotalPrice();
}

// ========== Eliminar ==========
async function deleteProduct(id) {
    const product = currentItems.find(p => p.id === id);
    if (!product) return;
    if (!confirm(`¿Borrar "${product.name}" de la lista?`)) return;

    try {
        await ITEMS_REF.doc(id).delete();
    } catch (err) {
        console.error('Error al borrar en Firestore:', err);
        showToast('No se pudo borrar. Revisa tu conexión.', 'error', 5000);
        return;
    }
    showToast('Producto eliminado', 'error');

    // Una mica que se borra sin palomear nunca se compró: su registro se anula
    if (product.category === 'Micas' && !product.comprada) anularRegistroMica(product);
}

// ========== Borrar las ya compradas ==========
async function borrarCompradas() {
    const compradas = currentItems.filter(p => p.comprada);
    if (!compradas.length) return;
    const n = compradas.length;
    if (!confirm(`¿Quitar de la lista ${n} producto${n === 1 ? '' : 's'} ya comprado${n === 1 ? '' : 's'}? Las micas siguen contando en Analytics.`)) return;

    try {
        const lote = db.batch();
        compradas.forEach(p => lote.delete(ITEMS_REF.doc(p.id)));
        await lote.commit();
    } catch (err) {
        console.error('Error al borrar las compradas:', err);
        showToast('No se pudieron borrar. Revisa tu conexión.', 'error', 5000);
        return;
    }
    showToast(`${n} producto${n === 1 ? '' : 's'} fuera de la lista`, 'success');
}

// ========== Marcar como comprada ==========
async function toggleComprada(id) {
    const product = currentItems.find(p => p.id === id);
    if (!product) return;

    const comprada = !product.comprada;
    const ok = await actualizarItem(id, { comprada: comprada ? Date.now() : null });
    if (!ok) return;

    // Analytics solo lleva micas por ahora; las demás categorías se palomean igual
    // pero no registran nada
    if (product.category !== 'Micas') {
        showToast(comprada ? 'Marcada como comprada' : 'Ya no está marcada como comprada',
            comprada ? 'success' : 'default');
        return;
    }

    if (!comprada) {
        showToast('Ya no está marcada como comprada');
        await marcarComprada(product, false);
        return;
    }
    const registrado = await marcarComprada(product, true);
    showToast(registrado ? 'Marcada como comprada' : 'Marcada en la lista, pero Analytics no se actualizó',
        registrado ? 'success' : 'error');
}

// ========== Totales ==========
function updateCategorySubtotal(category) {
    const total = currentItems
        .filter(p => p.category === category)
        .reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0);

    const el = document.getElementById(`${category.toLowerCase().replace(' ', '')}Subtotal`);
    if (el) el.textContent = `Subtotal: $${total.toFixed(2)}`;
    return total;
}

function updateTotalPrice() {
    const grand = CATEGORIAS.reduce((sum, cat) => sum + updateCategorySubtotal(cat), 0);
    const el = document.getElementById('totalPrice');
    if (el) el.textContent = `Total General: $${grand.toFixed(2)}`;
}

// ========== Formulario ==========
function hideAllOptions() {
    OPTION_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function clearAllSelections() {
    ['micaType', 'hidrogelType', 'fundasNuevasType', 'unaHoraType'].forEach(name =>
        document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.checked = false)
    );
    document.querySelectorAll('#fundaColors input[type="checkbox"], #fundaTypes input[type="checkbox"]')
        .forEach(cb => cb.checked = false);
}

function setPrecio(valor) {
    const campo = document.getElementById('productPrice');
    if (campo) campo.value = valor;
}

function initFormulario() {
    document.getElementById('productCategory').addEventListener('change', function () {
        hideAllOptions();
        clearAllSelections();
        setPrecio('');

        const map = {
            'Micas':         'micaOptions',
            'Hidrogel':      'hidrogelOptions',
            'Fundas':        ['fundaColors', 'fundaTypes'],
            'Fundas nuevas': 'fundasNuevasOptions',
            '1hora':         'unaHoraOptions',
        };

        const target = map[this.value];
        if (!target) return;
        (Array.isArray(target) ? target : [target])
            .forEach(id => document.getElementById(id).style.display = 'block');
    });

    // Precios automáticos por tipo de mica
    document.querySelectorAll('input[name="micaType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            setPrecio(PRECIOS_MICA[this.value] ?? '');
        });
    });

    // Precios automáticos por tipo de hidrogel
    document.querySelectorAll('input[name="hidrogelType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            setPrecio(this.value === 'privacidad' ? PRECIO_HIDROGEL.privacidad : PRECIO_HIDROGEL.otros);
        });
    });

    // Cantidad automática según fundas seleccionadas
    const updateFundaQuantity = () => {
        const count = document.querySelectorAll('#fundaColors input:checked, #fundaTypes input:checked').length;
        document.getElementById('productQuantity').value = count;
    };
    document.querySelectorAll('#fundaColors input, #fundaTypes input')
        .forEach(cb => cb.addEventListener('change', updateFundaQuantity));

    const borrarBtn = document.getElementById('borrarCompradasBtn');
    if (borrarBtn) borrarBtn.addEventListener('click', borrarCompradas);

    document.getElementById('addProductBtn').addEventListener('click', onAgregarProducto);

    hideAllOptions();
}

async function onAgregarProducto() {
    const name     = document.getElementById('productName').value.trim();
    const quantity = document.getElementById('productQuantity').value;
    const category = document.getElementById('productCategory').value;
    // En la lista de un local no se captura precio: lo pones tú al comprar
    const price    = CON_PRECIOS ? document.getElementById('productPrice').value : '0';

    if (!name || !quantity || !category || (CON_PRECIOS && !price)) {
        showToast('Por favor, rellena todos los campos.', 'error');
        return;
    }

    const typeMap = {
        'Micas':         'micaType',
        'Hidrogel':      'hidrogelType',
        'Fundas nuevas': 'fundasNuevasType',
        '1hora':         'unaHoraType',
    };

    const typeInput = typeMap[category]
        ? document.querySelector(`input[name="${typeMap[category]}"]:checked`)
        : null;

    // Analytics cuenta micas por tipo y por modelo: sin tipo o con varios
    // modelos en un renglón ("17, 11, 13, 15") no se pueden atribuir.
    if (category === 'Micas' && !typeInput) {
        showToast('Selecciona el tipo de mica (9D, 9H o Privacidad).', 'error');
        return;
    }
    if (category === 'Micas' && name.replace(/[\s.,;]+$/, '').includes(',')) {
        showToast('Un modelo por renglón: agrega cada mica por separado.', 'error', 5000);
        return;
    }

    const colors = category === 'Fundas'
        ? [...document.querySelectorAll('#fundaColors input:checked')].map(c => c.value)
        : [];

    const fundaTypes = category === 'Fundas'
        ? [...document.querySelectorAll('#fundaTypes input:checked')].map(c => c.value)
        : [];

    const product = {
        name,
        // Sin precio capturado, las micas y el hidrogel ya tienen tarifa conocida por tipo
        price:      parseFloat(price) || precioPorDefecto(category, typeInput?.value),
        quantity:   parseInt(quantity),
        category,
        type:       typeInput?.value ?? '',
        colors,
        fundaTypes,
    };

    const ref = await agregarItem(product);
    if (!ref) return;
    showToast('Producto agregado', 'success');

    if (category === 'Micas') registrarCompraMica({ ...product, id: ref.id }).catch(() => {});

    document.getElementById('productName').value = '';
    document.querySelectorAll('#fundaColors input, #fundaTypes input').forEach(cb => cb.checked = false);
}

function precioPorDefecto(category, tipo) {
    if (category === 'Micas')    return PRECIOS_MICA[tipo] ?? 0;
    if (category === 'Hidrogel') return tipo === 'privacidad' ? PRECIO_HIDROGEL.privacidad : PRECIO_HIDROGEL.otros;
    return 0;
}

// ========== Analytics: registro de compra de mica ==========

let _aliasMap = null;

async function cargarAliases(ruta = './analytics/aliases.csv') {
    if (_aliasMap) return _aliasMap;
    try {
        const resp = await fetch(ruta);
        const text = await resp.text();
        _aliasMap = new Map();
        text.trim().split('\n').slice(1).forEach(linea => {
            const [alias, nombre] = linea.split(',').map(s => s.trim());
            if (alias && nombre) _aliasMap.set(alias.toLowerCase(), nombre);
        });
    } catch (e) {
        console.warn('aliases.csv no disponible, se usará nombre original:', e);
        _aliasMap = new Map();
    }
    return _aliasMap;
}

function normalizarNombre(nombreOriginal, aliasMap) {
    const clave = nombreOriginal.trim().toLowerCase();
    return aliasMap.get(clave) ?? nombreOriginal.trim();
}

async function registrarCompraMica(product) {
    try {
        const aliasMap = await cargarAliases(window.RUTA_ALIASES);
        const nombre   = normalizarNombre(product.name, aliasMap);
        const ahora    = new Date();
        const doc = await db.collection('micas_compras').add({
            nombre,
            nombre_original: product.name,
            tipo:     product.type,
            precio:   product.price,
            cantidad: product.quantity,
            local:    LOCAL_ID,
            fecha:    firebase.firestore.FieldValue.serverTimestamp(),
            mes:      ahora.getMonth() + 1,
            año:      ahora.getFullYear(),
            // Hasta que se palomee en la lista no cuenta como compra
            estado:   'pendiente',
        });
        // El id del registro se guarda en el producto para poder marcarlo después
        if (product.id) await actualizarItem(product.id, { analyticsId: doc.id });
    } catch (err) {
        console.error('Error registrando analytics de mica:', err);
        showToast(`"${product.name}" no se registró en Analytics. Revisa tu conexión.`, 'error', 6000);
    }
}

// El registro de Analytics de una mica de la lista. Los productos agregados antes
// de que se guardara el id se buscan por nombre, tipo y cantidad.
async function buscarRegistroMica(product) {
    if (product.analyticsId) return db.collection('micas_compras').doc(product.analyticsId);
    try {
        const snap = await db.collection('micas_compras')
            .where('nombre_original', '==', product.name)
            .where('tipo', '==', product.type)
            .get();
        const candidatos = snap.docs
            .filter(d => d.data().cantidad === product.quantity && !d.data().anulado)
            .sort((a, b) => (b.data().fecha?.toMillis() ?? 0) - (a.data().fecha?.toMillis() ?? 0));
        const doc = candidatos[0];
        if (!doc) return null;
        // Se guarda cuál es, para que marcar y desmarcar caigan siempre en el mismo
        if (product.id) await actualizarItem(product.id, { analyticsId: doc.id });
        return doc.ref;
    } catch (err) {
        console.error('No se pudo buscar el registro de la mica:', err);
        return null;
    }
}

// `comprado` es la fecha en que se compró de verdad; Analytics la prefiere sobre
// `fecha`, que es cuando se anotó en la lista.
async function marcarComprada(product, comprada) {
    try {
        const ref = await buscarRegistroMica(product);
        if (!ref) return false;
        await ref.update(comprada
            ? { comprado: firebase.firestore.FieldValue.serverTimestamp(), estado: 'comprado' }
            : { comprado: firebase.firestore.FieldValue.delete(), estado: 'pendiente' });
        return true;
    } catch (err) {
        console.error('No se pudo marcar la compra en Analytics:', err);
        return false;
    }
}

// Se borró de la lista sin haberla comprado: el registro deja de contar
async function anularRegistroMica(product) {
    try {
        const ref = await buscarRegistroMica(product);
        if (!ref) return;
        await ref.update({ anulado: true, estado: 'anulado' });
    } catch (err) {
        console.error('No se pudo anular el registro de la mica:', err);
    }
}

// ========== Arranque ==========
// `local`: id del local dueño de esta lista. `conPrecios`: si se ven precios y totales.
function initLista({ local, conPrecios = true }) {
    LOCAL_ID    = local;
    CON_PRECIOS = conPrecios;

    initFormulario();

    ITEMS_REF.where('local', '==', local).onSnapshot(snap => {
        currentItems = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.creado ?? 0) - (b.creado ?? 0));
        renderAllProducts(currentItems);
    }, err => {
        console.error('Error al leer la lista:', err);
        showToast('No se pudo cargar la lista. Revisa tu conexión.', 'error', 6000);
    });
}
