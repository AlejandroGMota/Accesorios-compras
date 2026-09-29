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
    // El tipo de funda vive en `type` desde que es radio; las fundas anotadas
    // antes lo traen en `fundaTypes[]`, a veces con más de uno
    if (product.category === 'Fundas') {
        const tipo = product.type || product.fundaTypes?.join(', ');
        if (tipo) html += `<p><span>Tipo:</span> ${escapeHtml(tipo)}</p>`;
    }
    if (['Fundas nuevas', '1hora'].includes(product.category) && product.type)
        html += `<p><span>Tipo:</span> ${escapeHtml(product.type)}</p>`;
    return html;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// La cantidad es el acceso a la compra parcial: el número es justo el dato que
// hay que corregir, así que se toca ahí mismo en vez de en un tercer botón
// pegado al ✓ y al ✕ (34px cada uno, ya bastante junto para un pulgar). Solo
// aparece cuando hay algo que partir y el renglón sigue abierto.
function buildCantidadLinea(product) {
    const parcial = !product.comprada && product.quantity > 1;
    if (!parcial) return `<p><span>Cantidad:</span> ${product.quantity}</p>`;
    return `<p class="cantidad-linea"><span>Cantidad:</span> ${product.quantity}
        <button class="parcialBtn" type="button"
            aria-label="Compré menos de ${product.quantity}">compré menos</button></p>`;
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
        ${buildCantidadLinea(product)}
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
    div.querySelector('.parcialBtn')?.addEventListener('click', () => abrirPanelParcial(div, product));
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

    // Lo que se borra sin palomear nunca se compró: su registro se anula
    if (!product.comprada) anularRegistro(product);
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

    if (!comprada) {
        showToast('Ya no está marcada como comprada');
        await marcarComprada(product, false);
        return;
    }
    const registrado = await marcarComprada(product, true);
    showToast(registrado ? 'Marcada como comprada' : 'Marcada en la lista, pero Analytics no se actualizó',
        registrado ? 'success' : 'error');
}

// ========== Compra parcial ==========
// El ✓ sigue siendo un solo toque y cierra el renglón entero: ese es el caso
// normal y no se le pone nada en medio. Esto es el camino de al lado, para
// cuando el proveedor no tenía todo.

// Chips con las cantidades posibles. El total no está entre ellas porque para
// eso está el ✓; y se topan en 12 para no llenar la pantalla en un renglón de 40.
const MAX_CHIPS_PARCIAL = 12;

function abrirPanelParcial(card, product) {
    // Segundo toque en «compré menos»: se cierra
    const abierto = card.querySelector('.parcial-panel');
    if (abierto) { cerrarPanelParcial(card); return; }

    const max   = product.quantity - 1;
    const chips = Array.from({ length: Math.min(max, MAX_CHIPS_PARCIAL) }, (_, i) => i + 1);

    const panel = document.createElement('div');
    panel.className = 'parcial-panel';
    panel.innerHTML = `
        <p class="parcial-titulo">¿Cuántas compraste?</p>
        <div class="parcial-chips">
            ${chips.map(n => `<button class="parcial-chip" type="button" data-n="${n}">${n}</button>`).join('')}
            ${max > MAX_CHIPS_PARCIAL
                ? '<button class="parcial-chip otra" type="button" data-n="otra">Otra…</button>' : ''}
            <button class="parcial-chip cancelar" type="button" data-n="cancelar">Cancelar</button>
        </div>
        <p class="parcial-nota">Lo que falte se queda pendiente en la lista.</p>
    `;

    panel.querySelectorAll('.parcial-chip').forEach(btn =>
        btn.addEventListener('click', async () => {
            const valor = btn.dataset.n;
            cerrarPanelParcial(card);
            if (valor === 'cancelar') return;

            const n = valor === 'otra'
                ? parseInt(prompt(`De ${product.quantity}, ¿cuántas compraste?`) ?? '', 10)
                : parseInt(valor, 10);

            if (!Number.isFinite(n) || n < 1) return;
            // Se compró todo (o más de lo pedido): es el camino normal del ✓
            if (n >= product.quantity) { await toggleComprada(product.id); return; }
            await comprarParcial(product, n);
        }));

    card.classList.add('parcial-abierto');
    card.appendChild(panel);
}

function cerrarPanelParcial(card) {
    card.querySelector('.parcial-panel')?.remove();
    card.classList.remove('parcial-abierto');
}

// Se compró parte del renglón. Lo comprado queda como una compra cerrada y lo
// que faltó sigue pendiente, con la cantidad ya bajada, para poder palomearlo
// en la siguiente vuelta. El renglón no se cierra ni se borra.
async function comprarParcial(product, cantidad) {
    const restante = product.quantity - cantidad;
    const spec     = specRegistro(product.category);

    // Los dos movimientos de historial van juntos o no van: bajar el pendiente
    // sin escribir lo comprado perdería esas piezas, y al revés las contaría dos veces.
    let registrado = false;
    try {
        const datos     = await datosRegistro(product, cantidad);
        const pendiente = await buscarRegistro(product);
        const lote      = db.batch();
        // El pendiente del renglón pasa a valer solo lo que falta
        if (pendiente) lote.update(pendiente, { cantidad: restante });
        lote.set(db.collection(spec.col).doc(), {
            ...datos,
            estado:   'comprado',
            comprado: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await lote.commit();
        registrado = true;
    } catch (err) {
        console.error(`Error registrando la compra parcial en ${spec.col}:`, err);
    }

    // La lista se actualiza aunque el historial haya fallado: si no, la
    // herramienta deja de servir para lo único que no puede fallar, que es
    // saber qué falta. El pendiente se corrige solo al palomear (marcarComprada
    // reescribe `cantidad`).
    const ok = await actualizarItem(product.id, { quantity: restante });
    if (!ok) return;

    showToast(registrado
        ? `Compraste ${cantidad}. Quedan ${restante} pendientes.`
        : `Quedan ${restante} pendientes, pero Analytics no se actualizó.`,
        registrado ? 'success' : 'error', registrado ? 3500 : 6000);
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
    ['micaType', 'hidrogelType', 'fundaType', 'fundasNuevasType', 'unaHoraType'].forEach(name =>
        document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.checked = false)
    );
    document.querySelectorAll('#fundaColors input[type="checkbox"]').forEach(cb => cb.checked = false);
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

    // La cantidad es una pieza por color marcado. Antes también sumaba los tipos,
    // así que «2 colores + 1 tipo» daba 3: un número que no eran piezas de nada.
    const updateFundaQuantity = () => {
        const count = document.querySelectorAll('#fundaColors input:checked').length;
        document.getElementById('productQuantity').value = count;
    };
    document.querySelectorAll('#fundaColors input')
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
        'Fundas':        'fundaType',
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

    // Sin tipo no se puede saber qué rota más rápido, que es justo la pregunta
    // que se quiere responder de fundas
    if (category === 'Fundas' && !typeInput) {
        showToast('Selecciona el tipo de funda.', 'error');
        return;
    }

    // `'0'` es una cadena con contenido, así que se cuela por la validación de
    // arriba. En fundas pasa solo: sin colores marcados la cantidad queda en 0.
    if (parseInt(quantity) < 1) {
        showToast(category === 'Fundas'
            ? 'Marca al menos un color.'
            : 'La cantidad tiene que ser 1 o más.', 'error');
        return;
    }

    const colors = category === 'Fundas'
        ? [...document.querySelectorAll('#fundaColors input:checked')].map(c => c.value)
        : [];

    const product = {
        name,
        // Sin precio capturado, las micas y el hidrogel ya tienen tarifa conocida por tipo
        price:      parseFloat(price) || precioPorDefecto(category, typeInput?.value),
        quantity:   parseInt(quantity),
        category,
        type:       typeInput?.value ?? '',
        colors,
        // Se sigue escribiendo el campo viejo (con un solo tipo dentro) para no
        // romper lo que ya lea `fundaTypes` de los items existentes
        fundaTypes: category === 'Fundas' && typeInput ? [typeInput.value] : [],
    };

    const ref = await agregarItem(product);
    if (!ref) return;
    showToast('Producto agregado', 'success');

    registrarCompra({ ...product, id: ref.id }).catch(() => {});

    document.getElementById('productName').value = '';
    document.querySelectorAll('#fundaColors input').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="fundaType"]').forEach(r => r.checked = false);
    if (category === 'Fundas') document.getElementById('productQuantity').value = 0;
}

function precioPorDefecto(category, tipo) {
    if (category === 'Micas')    return PRECIOS_MICA[tipo] ?? 0;
    if (category === 'Hidrogel') return tipo === 'privacidad' ? PRECIO_HIDROGEL.privacidad : PRECIO_HIDROGEL.otros;
    return 0;
}

// ========== Analytics: registro de compras ==========
// Cada compra deja su rastro en una colección de historial. Micas y Fundas
// tienen la suya porque cada una tiene su propio análisis (y micas ya lleva
// meses de datos reales que no se mueven de sitio); el resto comparte
// `compras` con un campo `categoria`, porque el documento es idéntico y así
// Analytics las lee de un tirón en vez de con una consulta por categoría.
const REGISTRO_POR_CATEGORIA = {
    'Micas':  { col: 'micas_compras',  campoNombre: 'nombre' },
    'Fundas': { col: 'fundas_compras', campoNombre: 'modelo' },
};
const REGISTRO_COMPARTIDO = { col: 'compras', campoNombre: 'nombre' };

function specRegistro(category) {
    return REGISTRO_POR_CATEGORIA[category] ?? REGISTRO_COMPARTIDO;
}

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

// El tipo, siempre en un solo string. Las fundas viejas lo traían en
// `fundaTypes[]` con varios tipos por renglón; desde que el tipo es radio es
// uno solo y vive en `type`, igual que en las demás categorías.
function tipoDeRegistro(product) {
    if (product.category === 'Fundas')
        return product.type || product.fundaTypes?.[0] || '';
    return product.type ?? '';
}

// El documento de historial de un producto. `cantidad` se pasa aparte porque
// no siempre es la del renglón: en una compra parcial es lo que se compró.
async function datosRegistro(product, cantidad) {
    const aliasMap = await cargarAliases(window.RUTA_ALIASES);
    const spec     = specRegistro(product.category);
    const ahora    = new Date();
    const datos = {
        // Un iPhone 15 es el mismo modelo lleve mica o funda: mismos alias
        [spec.campoNombre]:               normalizarNombre(product.name, aliasMap),
        [`${spec.campoNombre}_original`]: product.name,
        tipo:     tipoDeRegistro(product),
        precio:   product.price ?? 0,
        cantidad,
        // El local del producto, no el de la pantalla: la lista global maneja
        // items de todos los locales y ahí `LOCAL_ID` no está puesto
        local:    product.local ?? LOCAL_ID,
        fecha:    firebase.firestore.FieldValue.serverTimestamp(),
        mes:      ahora.getMonth() + 1,
        año:      ahora.getFullYear(),
        // Hasta que se palomee en la lista no cuenta como compra
        estado:   'pendiente',
    };
    // Los colores son metadata para el dueño: no entran en ningún cálculo,
    // porque después no hay forma de saber cuál color se fue
    if (product.category === 'Fundas') datos.colores = product.colors ?? [];
    // En la colección compartida hay que poder distinguir de qué categoría es
    if (spec.col === REGISTRO_COMPARTIDO.col) datos.categoria = product.category;
    return datos;
}

async function registrarCompra(product) {
    const spec = specRegistro(product.category);
    try {
        const datos = await datosRegistro(product, product.quantity);
        const doc   = await db.collection(spec.col).add(datos);
        // El id del registro se guarda en el producto para poder marcarlo después
        if (product.id) await actualizarItem(product.id, { analyticsId: doc.id });
        return doc;
    } catch (err) {
        console.error(`Error registrando analytics en ${spec.col}:`, err);
        showToast(`"${product.name}" no se registró en Analytics. Revisa tu conexión.`, 'error', 6000);
        return null;
    }
}

// El registro de historial de un producto de la lista. Los productos agregados
// antes de que se guardara el id se buscan por nombre, tipo y cantidad.
async function buscarRegistro(product) {
    const spec = specRegistro(product.category);
    const col  = db.collection(spec.col);
    if (product.analyticsId) return col.doc(product.analyticsId);
    try {
        const snap = await col
            .where(`${spec.campoNombre}_original`, '==', product.name)
            .where('tipo', '==', tipoDeRegistro(product))
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
        console.error('No se pudo buscar el registro de la compra:', err);
        return null;
    }
}

// `comprado` es la fecha en que se compró de verdad; Analytics la prefiere sobre
// `fecha`, que es cuando se anotó en la lista.
async function marcarComprada(product, comprada) {
    try {
        let ref = await buscarRegistro(product);
        // Renglones anotados antes de que su categoría registrara nada: no hay
        // pendiente que actualizar, así que el registro nace ya comprado
        if (!ref) {
            if (!comprada) return false;
            ref = await registrarCompra(product);
            if (!ref) return false;
        }
        await ref.update(comprada
            ? { comprado: firebase.firestore.FieldValue.serverTimestamp(),
                estado:   'comprado',
                // La cantidad pudo haber bajado por una compra parcial anterior
                cantidad: product.quantity }
            : { comprado: firebase.firestore.FieldValue.delete(), estado: 'pendiente' });
        return true;
    } catch (err) {
        console.error('No se pudo marcar la compra en Analytics:', err);
        return false;
    }
}

// Se borró de la lista sin haberla comprado: el registro deja de contar
async function anularRegistro(product) {
    try {
        const ref = await buscarRegistro(product);
        if (!ref) return;
        await ref.update({ anulado: true, estado: 'anulado' });
    } catch (err) {
        console.error('No se pudo anular el registro de la compra:', err);
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
