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

// Precios: viven en precios.js, compartido con el panel de admin

const LISTA_IDS = [
    'micas9DList', 'micas9HList', 'micasPrivacidadList', 'micasSinTipoList',
    'hidrogelList', 'fundasList', 'fundasNuevasList',
    'unaHoraList', 'refaccionesList', 'otrosList'
];

const OPTION_IDS = ['micaOptions', 'hidrogelOptions', 'fundaColors', 'fundaTypes', 'fundasNuevasOptions', 'unaHoraOptions'];

// ========== Datos ==========
// Sin señal (el tianguis no tiene) Firestore guarda cada cambio en el teléfono
// al instante, lo muestra en la lista y lo sube solo cuando vuelve la red,
// aunque la app se cierre en medio (enablePersistence lo deja en IndexedDB).
//
// Pero la promesa de .set() / .update() / .commit() se cumple hasta que el
// SERVIDOR contesta. Esperarla sin señal es quedarse colgado: el botón no
// respondía, se le volvía a picar y se guardaba el mismo renglón 5 veces. Por
// eso nunca se espera: el cambio ya está guardado en cuanto se llama. Si el
// servidor lo rechaza después (reglas), ahí sí se avisa.
function enviar(promesa, mensaje = 'El servidor rechazó un cambio. Revisa la lista.') {
    promesa.catch(err => {
        console.error(mensaje, err);
        showToast(mensaje, 'error', 6000);
    });
}

// La hora del teléfono, no la del servidor: un cambio hecho sin señal el sábado
// puede subirse hasta el lunes, y serverTimestamp() le pondría la del lunes.
const ahoraTs = () => firebase.firestore.Timestamp.now();

function actualizarItem(id, cambios) {
    enviar(ITEMS_REF.doc(id).update(cambios));
    return true;
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
function textoCantidad(product) {
    if (!product.piezas) return product.quantity;
    const cajas = `${product.quantity} caja${product.quantity === 1 ? '' : 's'}`;
    // El local piensa en piezas; el que compra, en cajas
    return CON_PRECIOS ? `${cajas} (${product.piezas} pzs)` : `${product.piezas} pzs (${cajas})`;
}

function buildCantidadLinea(product) {
    const parcial = !product.comprada && product.quantity > 1;
    if (!parcial) return `<p><span>Cantidad:</span> ${textoCantidad(product)}</p>`;
    return `<p class="cantidad-linea"><span>Cantidad:</span> ${textoCantidad(product)}
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
    div.className = `product con-compra${product.comprada ? ' comprada' : ''}${product.sinSubir ? ' sin-subir' : ''}`;
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

// La lista se vuelve a dibujar entera con cada cambio (también los que llegan
// de otro teléfono). La posición se guarda y se devuelve: si no, al borrar o
// palomear algo abajo, la página brincaba.
function renderAllProducts(products) {
    const y = window.scrollY;
    clearAllProductLists();
    products.forEach(addProductToDOM);
    if (window.scrollY !== y) window.scrollTo(0, y);

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
    const y = window.scrollY;
    const ok = await confirmarBorrado({
        titulo:   product.name,
        detalle:  `${etiquetaTipo(product)} · ${detalleRenglon(product)}`,
        boton:    'Eliminar',
    });
    if (!ok) return;

    enviar(ITEMS_REF.doc(id).delete(), `El servidor no dejó borrar "${product.name}".`);
    showToast('Producto eliminado', 'error');
    mantenerPosicion(y);

    // Lo que se borra sin palomear nunca se compró: su registro se anula
    if (!product.comprada) anularRegistro(product);
}

// Al cerrar un diálogo el navegador devuelve el foco a donde estaba; en
// Android eso llegó a subir la página. Se suelta el foco y se regresa a la
// posición de antes, también en el siguiente cuadro.
function mantenerPosicion(y) {
    document.activeElement?.blur?.();
    const volver = () => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); };
    volver();
    requestAnimationFrame(volver);
    setTimeout(volver, 150);
}

// ========== Borrar las ya compradas ==========
async function borrarCompradas() {
    const compradas = currentItems.filter(p => p.comprada);
    if (!compradas.length) return;
    const n = compradas.length;
    const y = window.scrollY;
    const ok = await confirmarBorrado({
        titulo:   `Quitar ${n} comprado${n === 1 ? '' : 's'}`,
        detalle:  compradas.map(p => p.name).join(', '),
        boton:    `Quitar ${n}`,
    });
    if (!ok) return;

    const lote = db.batch();
    compradas.forEach(p => lote.delete(ITEMS_REF.doc(p.id)));
    enviar(lote.commit(), 'El servidor no dejó borrar las compradas.');
    showToast(`${n} producto${n === 1 ? '' : 's'} fuera de la lista`, 'success');
    mantenerPosicion(y);
}

// ========== Marcar como comprada ==========
async function toggleComprada(id) {
    const product = currentItems.find(p => p.id === id);
    if (!product) return;

    const comprada = !product.comprada;
    actualizarItem(id, { comprada: comprada ? Date.now() : null });

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

// En fundas cada casilla marcada es una funda concreta, así que la pregunta no
// es «cuántas compraste» sino «cuáles». En las demás categorías la cantidad es
// un número suelto y da igual qué pieza: ahí siguen los chips de números.
const variantesDe = p => [
    ...(p.colors ?? []).map(v => ({ v, clase: 'color' })),
    ...(p.fundaTypes ?? []).map(v => ({ v, clase: 'tipo' })),
];

function abrirPanelParcial(card, product) {
    // Segundo toque en la cantidad: se cierra
    const abierto = card.querySelector('.parcial-panel');
    if (abierto) { cerrarPanelParcial(card); return; }

    const variantes = product.category === 'Fundas' ? variantesDe(product) : [];
    const panel = document.createElement('div');
    panel.className = 'parcial-panel';

    if (variantes.length > 1) {
        panel.innerHTML = `
            <p class="parcial-titulo">¿Cuáles compraste?</p>
            <div class="parcial-chips">
                ${variantes.map(({ v, clase }) =>
                    `<button class="parcial-chip variante ${clase}" type="button" data-v="${escapeHtml(v)}" aria-pressed="false">${escapeHtml(v)}</button>`).join('')}
            </div>
            <div class="parcial-chips">
                <button class="parcial-chip aceptar" type="button" data-n="aceptar" disabled>Listo</button>
                <button class="parcial-chip cancelar" type="button" data-n="cancelar">Cancelar</button>
            </div>
            <p class="parcial-nota">Lo que no marques se queda pendiente en la lista.</p>
        `;

        const elegidas = new Set();
        const aceptar  = panel.querySelector('.aceptar');
        panel.querySelectorAll('.variante').forEach(btn =>
            btn.addEventListener('click', () => {
                const v = btn.dataset.v;
                elegidas.has(v) ? elegidas.delete(v) : elegidas.add(v);
                btn.setAttribute('aria-pressed', String(elegidas.has(v)));
                aceptar.disabled = elegidas.size === 0;
                aceptar.textContent = elegidas.size ? `Listo · ${elegidas.size}` : 'Listo';
            }));

        panel.querySelector('.cancelar').addEventListener('click', () => cerrarPanelParcial(card));
        aceptar.addEventListener('click', async () => {
            cerrarPanelParcial(card);
            if (!elegidas.size) return;
            // Se marcaron todas: es el camino normal del ✓
            if (elegidas.size >= variantes.length) { await toggleComprada(product.id); return; }
            await comprarParcial(product, {
                colores: (product.colors ?? []).filter(c => elegidas.has(c)),
                tipos:   (product.fundaTypes ?? []).filter(t => elegidas.has(t)),
            });
        });
    } else {
        const max   = product.quantity - 1;
        const chips = Array.from({ length: Math.min(max, MAX_CHIPS_PARCIAL) }, (_, i) => i + 1);
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
                if (n >= product.quantity) { await toggleComprada(product.id); return; }
                await comprarParcial(product, n);
            }));
    }

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
async function comprarParcial(product, elegido) {
    const spec = specRegistro(product.category);

    // `elegido` es un número en las categorías normales, o `{colores, tipos}`
    // en fundas, donde cada variante marcada es una funda concreta.
    const porVariante = typeof elegido === 'object' && elegido !== null;
    const compradas   = porVariante
        ? { colores: elegido.colores ?? [], tipos: elegido.tipos ?? [] }
        : null;
    const cantidad = porVariante
        ? compradas.colores.length + compradas.tipos.length
        : elegido;

    const quedan = porVariante ? {
        colors:     (product.colors ?? []).filter(c => !compradas.colores.includes(c)),
        fundaTypes: (product.fundaTypes ?? []).filter(t => !compradas.tipos.includes(t)),
    } : null;
    const restante = porVariante
        ? quedan.colors.length + quedan.fundaTypes.length
        : product.quantity - cantidad;

    // Los tres movimientos van en un solo lote, incluido el del renglón.
    //
    // Antes el renglón se actualizaba aparte, para que la lista siguiera
    // sirviendo aunque Analytics fallara. El problema era la dirección
    // contraria: si el historial se escribía y el renglón no, el renglón
    // conservaba su cantidad vieja, y al palomearlo después `marcarComprada`
    // reescribía el pendiente con esa cantidad. Comprar 6 de 10 y que fallara
    // esa segunda escritura acababa registrando 6 + 10 = 16 piezas. Nada lo
    // avisaba y la inflación entraba directo a la previsión de compra.
    //
    // Con todo en el mismo lote, o pasa entero o no pasa nada: si falla, el
    // usuario ve el error y lo vuelve a intentar sobre un estado íntegro.
    try {
        const datos     = await datosRegistro(product, cantidad, compradas);
        const pendiente = await buscarRegistro(product);
        const lote      = db.batch();

        // El pendiente del renglón pasa a valer solo lo que falta
        if (pendiente) lote.update(pendiente, {
            cantidad: restante,
            ...(quedan ? { colores: quedan.colors, tipos: quedan.fundaTypes } : {}),
        });
        lote.set(db.collection(spec.col).doc(), {
            ...datos,
            estado:   'comprado',
            comprado: ahoraTs(),
        });
        lote.update(ITEMS_REF.doc(product.id), {
            quantity: restante,
            // Las piezas anotadas ya no cuadran con las cajas que faltan
            piezas:   firebase.firestore.FieldValue.delete(),
            ...(quedan ? { colors: quedan.colors, fundaTypes: quedan.fundaTypes } : {}),
        });

        // Sin esperar al servidor (ver `enviar`): el lote ya quedó en el teléfono
        enviar(lote.commit(), 'El servidor rechazó la compra parcial. Revisa ese renglón.');
    } catch (err) {
        console.error(`Error registrando la compra parcial en ${spec.col}:`, err);
        showToast('No se pudo guardar la compra parcial. Nada cambió: vuelve a intentarlo.',
            'error', 6000);
        return;
    }

    const falta = quedan ? [...quedan.colors, ...quedan.fundaTypes].join(', ') : null;
    showToast(falta
        ? `Compraste ${cantidad}. Falta: ${falta}.`
        : `Compraste ${cantidad}. Quedan ${restante} pendientes.`,
        'success', 4000);
}

// ========== Totales ==========
// En micas e hidrogel el precio cambia con el tipo, así que el subtotal se
// desglosa por tipo (en este orden) y al final va el de toda la categoría
const TIPOS_SUBTOTAL = {
    Micas:    { '9D': '9D', '9H': '9H', 'Privacidad': 'Privacidad' },
    Hidrogel: { matte: 'Matte', privacidad: 'Privacidad', hd: 'HD', blueray: 'Blueray' },
};

function updateCategorySubtotal(category) {
    const items = currentItems.filter(p => p.category === category);
    const importe = p => (p.price ?? 0) * p.quantity;
    const total = items.reduce((sum, p) => sum + importe(p), 0);

    const el = document.getElementById(`${category.toLowerCase().replace(' ', '')}Subtotal`);
    if (!el) return total;

    const tipos = TIPOS_SUBTOTAL[category];
    if (!tipos) {
        el.textContent = `Subtotal: $${total.toFixed(2)}`;
        return total;
    }
    const porTipo = new Map();
    items.forEach(p => {
        const tipo = tipos[p.type] ?? 'Sin tipo';
        porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + importe(p));
    });
    const partes = [...Object.values(tipos), 'Sin tipo']
        .filter(t => porTipo.has(t))
        .map(t => `${t}: $${porTipo.get(t).toFixed(2)}`);
    el.textContent = partes.length > 1
        ? `${partes.join(' · ')} · Total: $${total.toFixed(2)}`
        : `${partes[0] ?? 'Subtotal: $0.00'}`;
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
        // En los locales las micas se anotan por pieza, también la 9D y la 9H
        const etiqueta = document.querySelector('label[for="productQuantity"]');
        if (etiqueta) etiqueta.textContent =
            !CON_PRECIOS && this.value === 'Micas' ? 'Cantidad (piezas)' : 'Cantidad';

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
            setPrecio(precioMica(this.value) || '');
        });
    });

    // Precios automáticos por tipo de hidrogel
    document.querySelectorAll('input[name="hidrogelType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            setPrecio(precioHidrogel(this.value));
        });
    });

    // Una pieza por cada casilla marcada, sean colores o tipos: color y tipo son
    // la misma dimensión. «Azul» es una funda y «Magsafe» es otra, no un color y
    // un tipo de la misma. Por eso «Azul, Rojo + Transparente» son 3 piezas.
    //
    // No cambiar esto a contar solo colores: una funda «Para personalizar» sin
    // color quedaría en cantidad 0 y la app no dejaría agregarla.
    const updateFundaQuantity = () => {
        const count = document.querySelectorAll(
            '#fundaColors input:checked, #fundaTypes input:checked').length;
        document.getElementById('productQuantity').value = count;
    };
    document.querySelectorAll('#fundaColors input, #fundaTypes input')
        .forEach(cb => cb.addEventListener('change', updateFundaQuantity));

    const borrarBtn = document.getElementById('borrarCompradasBtn');
    if (borrarBtn) borrarBtn.addEventListener('click', borrarCompradas);

    // Un toque a la vez: mientras se arma el renglón (o se responde si está
    // repetido) el botón no hace nada
    const agregarBtn = document.getElementById('addProductBtn');
    agregarBtn.addEventListener('click', async () => {
        if (agregarBtn.disabled) return;
        agregarBtn.disabled = true;
        try {
            await onAgregarProducto();
        } finally {
            agregarBtn.disabled = false;
        }
    });

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

    // En fundas cada casilla marcada, sea color o tipo, es UNA funda por
    // comprar: «Azul, Rojo, Lila + Transparente» son cuatro. El detalle de qué
    // se consiguió de verdad se fija al comprar, no al anotar.
    if (parseInt(quantity) < 1) {
        showToast(category === 'Fundas'
            ? 'Marca al menos un color o un tipo.'
            : 'La cantidad tiene que ser 1 o más.', 'error');
        return;
    }

    const marcadas = sel => [...document.querySelectorAll(sel)].map(c => c.value);
    const colors     = category === 'Fundas' ? marcadas('#fundaColors input:checked') : [];
    const tiposFunda = category === 'Fundas' ? marcadas('#fundaTypes input:checked')  : [];

    // En un local la 9D y la 9H se anotan en piezas, pero se compran por caja:
    // `quantity` lleva las cajas (redondeando hacia arriba) para que la lista
    // global y Analytics sigan sumando lo mismo, y `piezas` lo que se anotó
    const tipo   = typeInput?.value ?? '';
    const piezas = !CON_PRECIOS && category === 'Micas' && micaPorCaja(tipo)
        ? parseInt(quantity) : null;

    const product = {
        name,
        // Sin precio capturado, las micas y el hidrogel ya tienen tarifa conocida por tipo
        price:      parseFloat(price) || precioPorDefecto(category, tipo),
        quantity:   piezas ? Math.ceil(piezas / PZS_POR_CAJA) : parseInt(quantity),
        category,
        type:       tipo,
        colors,
        fundaTypes: tiposFunda,
        ...(piezas ? { piezas } : {}),
    };

    // ¿Ya estaba pendiente el mismo modelo? Pasa al anotar una semana y volver a
    // anotar la siguiente porque no se fue por las cosas.
    const repetido = await buscarRepetido(product);
    if (repetido) {
        const accion = await preguntarRepetido(repetido, product);
        if (accion === 'cancelar') return;
        if (accion === 'reemplazar') reemplazarRenglon(repetido, product);
        if (accion === 'sumar')      reemplazarRenglon(repetido, sumarRenglones(repetido, product));
        if (accion === 'ambas')      await guardarNuevo(product);
    } else {
        await guardarNuevo(product);
    }

    document.getElementById('productName').value = '';
    document.querySelectorAll('#fundaColors input, #fundaTypes input')
        .forEach(cb => cb.checked = false);
    if (category === 'Fundas') document.getElementById('productQuantity').value = 0;
}

function precioPorDefecto(category, tipo) {
    if (category === 'Micas')    return precioMica(tipo);
    if (category === 'Hidrogel') return precioHidrogel(tipo);
    return 0;
}

// ========== Guardar un renglón nuevo ==========
// El renglón y su registro de Analytics van en un mismo lote, con el id del
// registro ya puesto en el renglón: sin señal no hay segunda escritura que
// esperar, y o se suben los dos o ninguno.
async function guardarNuevo(product) {
    const spec   = specRegistro(product.category);
    const item   = ITEMS_REF.doc();
    const reg    = db.collection(spec.col).doc();
    const datos  = await datosRegistro({ ...product, local: LOCAL_ID }, product.quantity);

    const lote = db.batch();
    lote.set(item, {
        ...product,
        local:       LOCAL_ID,
        comprada:    null,
        creado:      Date.now(),   // orden de la lista; la fecha real de compra la lleva Analytics
        analyticsId: reg.id,
    });
    lote.set(reg, datos);
    enviar(lote.commit(), `El servidor rechazó "${product.name}". Vuelve a anotarlo.`);
    showToast('Producto agregado', 'success');
    return item;
}

// ========== Renglones repetidos ==========
// Mismo modelo, misma categoría y mismo tipo, todavía sin palomear. El modelo
// se compara ya normalizado (modelos.js): «15», «ip 15» e «iPhone 15» son el
// mismo; «a15» es Samsung y no choca con el iPhone. En micas también cuentan
// los alias que comparten mica («13» y «14»): es la misma caja. En lo demás
// no: una funda de A15 no le queda a un A24.
async function buscarRepetido(product) {
    const aliasMap = await cargarAliases(window.RUTA_ALIASES);
    const opciones = { conAlias: product.category === 'Micas' };
    const modelo   = modeloCanonico(product.name, aliasMap, opciones);
    if (!modelo) return null;
    return currentItems.find(p =>
        !p.comprada &&
        p.category === product.category &&
        (p.type ?? '') === (product.type ?? '') &&
        modeloCanonico(p.name, aliasMap, opciones) === modelo) ?? null;
}

function etiquetaTipo(p) {
    const categoria = { '1hora': '1 Hora' }[p.category] ?? p.category;
    return [categoria, p.type].filter(Boolean).join(' ');
}

function detalleRenglon(p) {
    const variantes = [...(p.colors ?? []), ...(p.fundaTypes ?? [])];
    return `${textoCantidad(p)}${variantes.length ? ` · ${variantes.join(', ')}` : ''}`;
}

// Lo que queda si se juntan los dos. En fundas cada color o tipo es una funda,
// así que se juntan las casillas (sin repetir) en vez de sumar números.
function sumarRenglones(viejo, nuevo) {
    if (viejo.category === 'Fundas') {
        const colors     = [...new Set([...(viejo.colors ?? []), ...(nuevo.colors ?? [])])];
        const fundaTypes = [...new Set([...(viejo.fundaTypes ?? []), ...(nuevo.fundaTypes ?? [])])];
        return { ...nuevo, colors, fundaTypes, quantity: colors.length + fundaTypes.length };
    }
    // Micas de local: se suman las piezas y las cajas salen de ahí
    if (viejo.piezas && nuevo.piezas) {
        const piezas = viejo.piezas + nuevo.piezas;
        return { ...nuevo, piezas, quantity: Math.ceil(piezas / PZS_POR_CAJA) };
    }
    const { piezas, ...sinPiezas } = nuevo;
    return { ...sinPiezas, quantity: viejo.quantity + nuevo.quantity };
}

// El renglón viejo con los datos nuevos encima. `piezas` no se hereda: si lo
// nuevo no las trae, las del viejo ya no cuadran con las cajas.
const combinar = (viejo, nuevo) => ({ ...viejo, piezas: undefined, ...nuevo });

// Pasa al renglón que ya estaba los datos de `nuevo`. Se queda su nombre, su
// fecha y su registro de Analytics, que se ajusta a la cantidad nueva.
async function reemplazarRenglon(viejo, nuevo) {
    const borrar = firebase.firestore.FieldValue.delete();
    actualizarItem(viejo.id, {
        quantity:   nuevo.quantity,
        price:      nuevo.price,
        colors:     nuevo.colors ?? [],
        fundaTypes: nuevo.fundaTypes ?? [],
        piezas:     nuevo.piezas ?? borrar,
    });
    showToast(`"${viejo.name}" quedó en ${detalleRenglon(combinar(viejo, nuevo))}`, 'success', 4000);

    // Si el registro no aparece da igual: al palomear se escribe con la
    // cantidad del renglón (ver marcarComprada). Va aparte del renglón para que
    // un registro perdido no tumbe el cambio de la lista.
    const ref = await buscarRegistro(viejo);
    if (!ref) return;
    ref.update({
        cantidad: nuevo.quantity,
        precio:   nuevo.price ?? 0,
        ...(viejo.category === 'Fundas' ? { colores: nuevo.colors ?? [], tipos: nuevo.fundaTypes ?? [] } : {}),
    }).catch(err => console.warn('No se pudo ajustar el registro de Analytics:', err));
}

// ========== Diálogos de la app ==========
// En vez de confirm() del sistema: se ve como la app y, en Android, no le
// regresa el foco al campo de nombre al cerrarse (eso hacía brincar la página).
let dialogoApp = null;

// Abre el diálogo con `html` (un <form method="dialog"> con botones value=…) y
// resuelve con el value del botón elegido, o '' si se cierra con Esc
function abrirDialogo(html, clase = '') {
    if (!dialogoApp) {
        dialogoApp = document.createElement('dialog');
        document.body.appendChild(dialogoApp);
    }
    const d = dialogoApp;
    d.className = `dialogo-app ${clase}`;
    d.innerHTML = html;
    return new Promise(resolve => {
        d.addEventListener('close', () => resolve(d.returnValue), { once: true });
        d.returnValue = '';
        d.showModal();
    });
}

// Confirmar un borrado: true si se eligió «Eliminar»
async function confirmarBorrado({ titulo, detalle, boton }) {
    const r = await abrirDialogo(`
        <form method="dialog">
            <h3>${escapeHtml(titulo)}</h3>
            ${detalle ? `<p class="dialogo-detalle">${escapeHtml(detalle)}</p>` : ''}
            <div class="dialogo-acciones en-fila">
                <button value="cancelar" class="dialogo-cancelar" autofocus>Cancelar</button>
                <button value="borrar" class="dialogo-peligro">${escapeHtml(boton)}</button>
            </div>
        </form>`, 'dialogo-borrar');
    return r === 'borrar';
}

// Resuelve con 'reemplazar', 'sumar', 'ambas' o 'cancelar'
async function preguntarRepetido(viejo, nuevo) {
    const anotado = viejo.creado
        ? new Date(viejo.creado).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
        : '';
    const suma = sumarRenglones(viejo, nuevo);
    const r = await abrirDialogo(`
        <form method="dialog">
            <p class="dialogo-etiqueta">Ya está en la lista</p>
            <h3>${escapeHtml(etiquetaTipo(viejo))} · ${escapeHtml(viejo.name)}</h3>
            <dl>
                <dt>Ya anotado${anotado ? ` el ${escapeHtml(anotado)}` : ''}</dt>
                <dd>«${escapeHtml(viejo.name)}» · ${escapeHtml(detalleRenglon(viejo))}</dd>
                <dt>Lo que acabas de poner</dt>
                <dd>«${escapeHtml(nuevo.name)}» · ${escapeHtml(detalleRenglon(nuevo))}</dd>
            </dl>
            <div class="dialogo-acciones">
                <button value="reemplazar" class="btn-primary">Reescribir: dejar ${escapeHtml(detalleRenglon(nuevo))}</button>
                <button value="sumar">Sumar: queda en ${escapeHtml(detalleRenglon(combinar(viejo, suma)))}</button>
                <button value="ambas">Guardar los dos renglones</button>
                <button value="cancelar" class="dialogo-cancelar">Cancelar</button>
            </div>
        </form>`);
    return r || 'cancelar';
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

// El mismo Map que arma Analytics (modelos.js): las claves pasan por
// claveNombre, así «iPhone 15» encuentra el alias «15»
async function cargarAliases(ruta = './analytics/aliases.csv') {
    if (_aliasMap) return _aliasMap;
    try {
        const resp = await fetch(ruta);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        _aliasMap = parsearAliases(await resp.text());
    } catch (e) {
        console.warn('aliases.csv no disponible, se usará nombre original:', e);
        // Sin guardarlo: que se vuelva a intentar en cuanto haya señal
        return new Map();
    }
    return _aliasMap;
}

function normalizarNombre(nombreOriginal, aliasMap) {
    return aliasMap.get(claveNombre(nombreOriginal)) ?? nombreOriginal.trim();
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
async function datosRegistro(product, cantidad, compradas = null) {
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
        fecha:    ahoraTs(),
        mes:      ahora.getMonth() + 1,
        año:      ahora.getFullYear(),
        // Hasta que se palomee en la lista no cuenta como compra
        estado:   'pendiente',
    };
    // En fundas, colores y tipos SÍ entran en los cálculos: el dueño quiere
    // saber cuáles se compran más. En una compra parcial se guarda exactamente
    // lo que se consiguió, no lo que se había anotado.
    if (product.category === 'Fundas') {
        datos.colores = compradas ? compradas.colores : (product.colors ?? []);
        datos.tipos   = compradas ? compradas.tipos   : (product.fundaTypes ?? []);
    }
    // En la colección compartida hay que poder distinguir de qué categoría es
    if (spec.col === REGISTRO_COMPARTIDO.col) datos.categoria = product.category;
    return datos;
}

// Registro de un renglón que todavía no tenía (anotado antes de que su
// categoría registrara nada). Devuelve la referencia sin esperar al servidor.
async function registrarCompra(product) {
    const spec = specRegistro(product.category);
    try {
        const datos = await datosRegistro(product, product.quantity);
        const ref   = db.collection(spec.col).doc();
        enviar(ref.set(datos), `"${product.name}" no se registró en Analytics.`);
        // El id del registro se guarda en el producto para poder marcarlo después
        if (product.id) actualizarItem(product.id, { analyticsId: ref.id });
        return ref;
    } catch (err) {
        console.error(`Error registrando analytics en ${spec.col}:`, err);
        showToast(`"${product.name}" no se registró en Analytics.`, 'error', 6000);
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
        if (product.id) actualizarItem(product.id, { analyticsId: doc.id });
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
        // Sin esperar al servidor (ver `enviar`). Si el registro no existe, que
        // no tumbe nada: la lista ya quedó marcada.
        ref.update(comprada
            ? { comprado: ahoraTs(),
                estado:   'comprado',
                // La cantidad pudo haber bajado por una compra parcial anterior
                cantidad: product.quantity }
            : { comprado: firebase.firestore.FieldValue.delete(), estado: 'pendiente' })
            .catch(err => console.warn('No se pudo marcar la compra en Analytics:', err));
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
        ref.update({ anulado: true, estado: 'anulado' })
            .catch(err => console.warn('No se pudo anular el registro de la compra:', err));
    } catch (err) {
        console.error('No se pudo anular el registro de la compra:', err);
    }
}

// ========== Sin señal ==========
// El service worker (sw.js) hace que la app abra sin internet; Firestore guarda
// la lista y la cola de cambios en el teléfono. Aquí solo se avisa qué pasa.

let ultimoFromCache = false;
let pendientesDesde  = null;   // desde cuándo hay cambios sin subir

// «Todo subido» solo si de verdad estuvieron esperando: con señal cada cambio
// tarda medio segundo y el aviso taparía al de «Producto agregado»
const AVISO_SUBIDO_MS = 3000;
let desdeCache      = null;   // desde cuándo la lista sale solo del teléfono

// Al abrir con señal, la primera foto de la lista también sale del teléfono
// por un instante: solo se avisa si sigue así pasado este tiempo
const AVISO_CACHE_MS = 4000;

function prepararSinSenal() {
    if ('serviceWorker' in navigator)
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker no disponible:', err));
    // Que el navegador no borre los datos guardados si se llena el teléfono
    navigator.storage?.persist?.().catch(() => {});

    const barra = document.createElement('p');
    barra.id = 'estadoSync';
    barra.setAttribute('role', 'status');
    barra.hidden = true;
    document.querySelector('.container')?.prepend(barra);

    const repintar = () => pintarEstadoSync(ultimoFromCache);
    window.addEventListener('online', repintar);
    window.addEventListener('offline', repintar);
}

function pintarEstadoSync(fromCache) {
    ultimoFromCache = fromCache;
    const barra = document.getElementById('estadoSync');
    if (!barra) return;
    const pendientes = currentItems.filter(p => p.sinSubir).length;
    // Con una rayita de señal iOS dice que sí hay red: lo que manda es que
    // Firestore no haya podido hablar con el servidor
    desdeCache = fromCache ? (desdeCache ?? Date.now()) : null;
    if (desdeCache && Date.now() - desdeCache < AVISO_CACHE_MS)
        setTimeout(() => pintarEstadoSync(ultimoFromCache), AVISO_CACHE_MS);
    const sinRed     = !navigator.onLine || (desdeCache !== null && Date.now() - desdeCache >= AVISO_CACHE_MS);
    const cambios    = `${pendientes} cambio${pendientes === 1 ? '' : 's'}`;

    let texto = '';
    if (window.PERSISTENCIA_FALLO)
        texto = '⚠ Este navegador no deja guardar la lista en el teléfono: sin señal, lo que anotes se pierde al cerrar.';
    else if (pendientes && sinRed)
        texto = `Sin señal · ${cambios} guardado${pendientes === 1 ? '' : 's'} en el teléfono. Se suben solos cuando haya internet, aunque cierres la app.`;
    else if (pendientes)
        texto = `Subiendo ${cambios}…`;
    else if (sinRed)
        texto = 'Sin señal · ves la lista guardada en el teléfono. Puedes anotar.';

    barra.textContent = texto;
    barra.hidden = !texto;
    barra.className = pendientes ? 'pendiente' : '';

    if (pendientes) pendientesDesde ??= Date.now();
    else {
        if (pendientesDesde && !sinRed && Date.now() - pendientesDesde >= AVISO_SUBIDO_MS)
            showToast('Todo subido ✓', 'success');
        pendientesDesde = null;
    }
}

// ========== Arranque ==========
// `local`: id del local dueño de esta lista. `conPrecios`: si se ven precios y totales.
function initLista({ local, conPrecios = true }) {
    LOCAL_ID    = local;
    CON_PRECIOS = conPrecios;

    escucharPrecios();
    initFormulario();
    prepararSinSenal();

    // Con includeMetadataChanges la lista se vuelve a pintar cuando un cambio
    // termina de subir, para quitarle la marca de «falta subir»
    ITEMS_REF.where('local', '==', local).onSnapshot({ includeMetadataChanges: true }, snap => {
        currentItems = snap.docs
            .map(d => ({ id: d.id, ...d.data(), sinSubir: d.metadata.hasPendingWrites }))
            .sort((a, b) => (a.creado ?? 0) - (b.creado ?? 0));
        renderAllProducts(currentItems);
        pintarEstadoSync(snap.metadata.fromCache);
    }, err => {
        console.error('Error al leer la lista:', err);
        showToast('No se pudo cargar la lista. Revisa tu conexión.', 'error', 6000);
    });
}
