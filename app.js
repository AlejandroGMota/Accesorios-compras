// ========== Notificaciones ==========
let toastTimer;
function showToast(message, type = 'default', duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'show' + (type !== 'default' ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, duration);
}

// ========== Referencia Firestore ==========
const PRODUCTS_REF = db.collection('app').doc('productos');
let currentProducts = [];

// ========== Datos ==========
async function saveProducts(products) {
    currentProducts = products;
    try {
        await PRODUCTS_REF.set({ items: products });
    } catch (err) {
        console.error('Error al guardar en Firestore:', err);
        showToast('Error al guardar. Revisa tu conexión.', 'error', 5000);
    }
}

function clearAllProductLists() {
    const lists = [
        'micas9DList', 'micas9HList', 'micasPrivacidadList', 'micasSinTipoList',
        'hidrogelList', 'fundasList', 'fundasNuevasList',
        'unaHoraList', 'refaccionesList', 'otrosList'
    ];
    lists.forEach(id => document.getElementById(id).innerHTML = '');
}

function renderAllProducts(products) {
    clearAllProductLists();
    products.forEach((product, index) => addProductToDOM(product, index));
    // Micas viejas sin tipo: suman al subtotal, así que se muestran para poder borrarlas
    document.getElementById('micasSinTipoHeader').style.display =
        document.getElementById('micasSinTipoList').children.length ? '' : 'none';

    const compradas = products.filter(p => p.category === 'Micas' && p.comprada).length;
    const boton = document.getElementById('borrarCompradasBtn');
    boton.hidden = compradas === 0;
    boton.textContent = `Borrar compradas (${compradas})`;

    updateTotalPrice();
}

// ========== DOM: Producto ==========
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
        html += `<p><span>Tipo:</span> ${product.type}</p>`;
    if (product.category === 'Fundas' && product.colors?.length)
        html += `<p><span>Colores:</span> ${product.colors.join(', ')}</p>`;
    if (product.category === 'Fundas' && product.fundaTypes?.length)
        html += `<p><span>Tipo:</span> ${product.fundaTypes.join(', ')}</p>`;
    if (['Fundas nuevas', '1hora'].includes(product.category) && product.type)
        html += `<p><span>Tipo:</span> ${product.type}</p>`;
    return html;
}

function addProductToDOM(product, index) {
    const list = getProductList(product);
    if (!list) return;

    // En micas se puede marcar la compra: esa fecha es la que usa Analytics
    const esMica = product.category === 'Micas';
    const fechaCompra = product.comprada
        ? new Date(product.comprada).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
        : '';

    const div = document.createElement('div');
    div.className = `product${esMica ? ' con-compra' : ''}${product.comprada ? ' comprada' : ''}`;
    div.innerHTML = `
        <h3>${product.name}</h3>
        <p><span>Precio:</span> $${product.price.toFixed(2)}</p>
        <p><span>Cantidad:</span> ${product.quantity}</p>
        ${buildProductDetails(product)}
        ${product.comprada ? `<p class="compra-nota">Comprada el ${fechaCompra}</p>` : ''}
        ${esMica ? `<button class="buyBtn" onclick="toggleComprada(${index})"
            aria-label="${product.comprada ? 'Quitar la marca de comprada' : 'Marcar como comprada'}"
            title="${product.comprada ? 'Comprada: clic para quitar la marca' : 'Marcar como comprada'}">✓</button>` : ''}
        <button class="deleteBtn" onclick="deleteProduct(${index})" aria-label="Eliminar producto">✕</button>
    `;
    list.appendChild(div);
}

// ========== Eliminar ==========
async function deleteProduct(index) {
    const product = currentProducts[index];
    currentProducts.splice(index, 1);
    await saveProducts(currentProducts);
    showToast('Producto eliminado', 'error');

    // Una mica que se borra sin palomear nunca se compró: su registro se anula
    if (product?.category === 'Micas' && !product.comprada) anularRegistroMica(product);
}

// ========== Borrar las micas ya compradas ==========
async function borrarCompradas() {
    const compradas = currentProducts.filter(p => p.category === 'Micas' && p.comprada);
    if (!compradas.length) return;
    if (!confirm(`¿Quitar de la lista ${compradas.length} mica${compradas.length === 1 ? '' : 's'} ya comprada${compradas.length === 1 ? '' : 's'}? Siguen contando en Analytics.`)) return;

    currentProducts = currentProducts.filter(p => !(p.category === 'Micas' && p.comprada));
    await saveProducts(currentProducts);
    showToast(`${compradas.length} de la lista`, 'success');
}

// ========== Marcar una mica como comprada ==========
async function toggleComprada(index) {
    const product = currentProducts[index];
    if (!product) return;

    const comprada = !product.comprada;
    product.comprada = comprada ? Date.now() : null;
    await saveProducts(currentProducts);

    if (!comprada) {
        showToast('Ya no está marcada como comprada');
        await marcarComprada(product, false);
        return;
    }
    const ok = await marcarComprada(product, true);
    showToast(ok ? 'Marcada como comprada' : 'Marcada en la lista, pero Analytics no se actualizó', ok ? 'success' : 'error');
}

// ========== Totales ==========
function updateCategorySubtotal(category) {
    const total = currentProducts
        .filter(p => p.category === category)
        .reduce((sum, p) => sum + p.price * p.quantity, 0);

    const el = document.getElementById(`${category.toLowerCase().replace(' ', '')}Subtotal`);
    if (el) el.textContent = `Subtotal: $${total.toFixed(2)}`;
    return total;
}

function updateTotalPrice() {
    const categories = ['Micas', 'Hidrogel', 'Fundas', 'Fundas nuevas', '1hora', 'Refacciones', 'Otros'];
    const grand = categories.reduce((sum, cat) => sum + updateCategorySubtotal(cat), 0);
    document.getElementById('totalPrice').textContent = `Total General: $${grand.toFixed(2)}`;
}

// ========== Formulario: opciones de categoría ==========
const OPTION_IDS = ['micaOptions', 'hidrogelOptions', 'fundaColors', 'fundaTypes', 'fundasNuevasOptions', 'unaHoraOptions'];

function hideAllOptions() {
    OPTION_IDS.forEach(id => document.getElementById(id).style.display = 'none');
}

function clearAllSelections() {
    ['micaType', 'hidrogelType', 'fundasNuevasType', 'unaHoraType'].forEach(name =>
        document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.checked = false)
    );
    document.querySelectorAll('#fundaColors input[type="checkbox"], #fundaTypes input[type="checkbox"]')
        .forEach(cb => cb.checked = false);
}

document.getElementById('productCategory').addEventListener('change', function () {
    hideAllOptions();
    clearAllSelections();
    document.getElementById('productPrice').value = '';

    const map = {
        'Micas':        'micaOptions',
        'Hidrogel':     'hidrogelOptions',
        'Fundas':       ['fundaColors', 'fundaTypes'],
        'Fundas nuevas':'fundasNuevasOptions',
        '1hora':        'unaHoraOptions',
    };

    const target = map[this.value];
    if (!target) return;
    (Array.isArray(target) ? target : [target])
        .forEach(id => document.getElementById(id).style.display = 'block');
});

// Precios automáticos por tipo de mica
document.querySelectorAll('input[name="micaType"]').forEach(radio => {
    radio.addEventListener('change', function () {
        const prices = { '9D': 60, '9H': 35, 'Privacidad': 18 };
        document.getElementById('productPrice').value = prices[this.value] ?? '';
    });
});

// Precios automáticos por tipo de hidrogel
document.querySelectorAll('input[name="hidrogelType"]').forEach(radio => {
    radio.addEventListener('change', function () {
        document.getElementById('productPrice').value = this.value === 'privacidad' ? 330 : 180;
    });
});

// Cantidad automática según fundas seleccionadas
function updateFundaQuantity() {
    const count = document.querySelectorAll('#fundaColors input:checked, #fundaTypes input:checked').length;
    document.getElementById('productQuantity').value = count;
}
document.querySelectorAll('#fundaColors input, #fundaTypes input')
    .forEach(cb => cb.addEventListener('change', updateFundaQuantity));

// ========== Agregar producto ==========
document.getElementById('addProductBtn').onclick = async function () {
    const name     = document.getElementById('productName').value.trim();
    const price    = document.getElementById('productPrice').value;
    const quantity = document.getElementById('productQuantity').value;
    const category = document.getElementById('productCategory').value;

    if (!name || !price || !quantity || !category) {
        showToast('Por favor, rellena todos los campos.', 'error');
        return;
    }

    const typeMap = {
        'Micas':        'micaType',
        'Hidrogel':     'hidrogelType',
        'Fundas nuevas':'fundasNuevasType',
        '1hora':        'unaHoraType',
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
        price:      parseFloat(price),
        quantity:   parseInt(quantity),
        category,
        type:       typeInput?.value ?? '',
        colors,
        fundaTypes,
    };

    currentProducts.push(product);
    await saveProducts(currentProducts);
    showToast('Producto agregado', 'success');

    if (category === 'Micas') registrarCompraMica(product).catch(() => {});

    document.getElementById('productName').value = '';
    document.querySelectorAll('#fundaColors input, #fundaTypes input').forEach(cb => cb.checked = false);
};

// ========== Analytics: registro de compra de mica ==========

let _aliasMap = null;

async function cargarAliases() {
    if (_aliasMap) return _aliasMap;
    try {
        const resp = await fetch('./analytics/aliases.csv');
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
        const aliasMap = await cargarAliases();
        const nombre   = normalizarNombre(product.name, aliasMap);
        const ahora    = new Date();
        const doc = await db.collection('micas_compras').add({
            nombre,
            nombre_original: product.name,
            tipo:     product.type,
            precio:   product.price,
            cantidad: product.quantity,
            fecha:    firebase.firestore.FieldValue.serverTimestamp(),
            mes:      ahora.getMonth() + 1,
            año:      ahora.getFullYear(),
            // Hasta que se palomee en la lista no cuenta como compra
            estado:   'pendiente',
        });
        // Se guarda el id en el producto para poder marcar después cuándo se compró
        const enLista = currentProducts.find(p =>
            !p.analyticsId && p.category === 'Micas' && p.name === product.name &&
            p.type === product.type && p.quantity === product.quantity && p.price === product.price);
        if (enLista) {
            enLista.analyticsId = doc.id;
            await saveProducts(currentProducts);
        }
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
            .filter(d => d.data().cantidad === product.quantity && !d.data().comprado)
            .sort((a, b) => (b.data().fecha?.toMillis() ?? 0) - (a.data().fecha?.toMillis() ?? 0));
        return candidatos[0]?.ref ?? null;
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

// ========== Inicialización ==========
window.addEventListener('DOMContentLoaded', () => {
    hideAllOptions();

    PRODUCTS_REF.onSnapshot(snap => {
        currentProducts = snap.exists ? (snap.data().items || []) : [];
        renderAllProducts(currentProducts);
    });
});
