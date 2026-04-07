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
        'micas9DList', 'micas9HList', 'micasPrivacidadList',
        'hidrogelList', 'fundasList', 'fundasNuevasList',
        'unaHoraList', 'refaccionesList', 'otrosList'
    ];
    lists.forEach(id => document.getElementById(id).innerHTML = '');
}

function renderAllProducts(products) {
    clearAllProductLists();
    products.forEach((product, index) => addProductToDOM(product, index));
    updateTotalPrice();
}

// ========== DOM: Producto ==========
function getProductList(product) {
    if (product.category === 'Micas') {
        const map = { '9D': 'micas9DList', '9H': 'micas9HList', 'Privacidad': 'micasPrivacidadList' };
        return document.getElementById(map[product.type]);
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

    const div = document.createElement('div');
    div.className = 'product';
    div.innerHTML = `
        <h3>${product.name}</h3>
        <p><span>Precio:</span> $${product.price.toFixed(2)}</p>
        <p><span>Cantidad:</span> ${product.quantity}</p>
        ${buildProductDetails(product)}
        <button class="deleteBtn" onclick="deleteProduct(${index})" aria-label="Eliminar producto">✕</button>
    `;
    list.appendChild(div);
}

// ========== Eliminar ==========
async function deleteProduct(index) {
    currentProducts.splice(index, 1);
    await saveProducts(currentProducts);
    showToast('Producto eliminado', 'error');
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
        await db.collection('micas_compras').add({
            nombre,
            nombre_original: product.name,
            tipo:     product.type,
            precio:   product.price,
            cantidad: product.quantity,
            fecha:    firebase.firestore.FieldValue.serverTimestamp(),
            mes:      ahora.getMonth() + 1,
            año:      ahora.getFullYear(),
        });
    } catch (err) {
        console.error('Error registrando analytics de mica:', err);
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
