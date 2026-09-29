// Panel de locales: crear, renombrar, desactivar y borrar.
// Sin login por ahora: quien tenga la liga entra.

const LOCALES_REF = db.collection('locales');
const ITEMS_REF   = db.collection('items');

const TIANGUIS_ID = 'tianguis';

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function showToast(message, type = 'default', duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'show' + (type !== 'default' ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, duration);
}

// El id sale del nombre para que la liga se lea: "Local Centro" → local-centro
function idDesdeNombre(nombre) {
    return nombre.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

let locales = [];
let items   = [];

function ligaDe(id) {
    const base = location.href.replace(/admin\.html.*$/, '');
    return id === TIANGUIS_ID ? base : `${base}local.html?id=${encodeURIComponent(id)}`;
}

function render() {
    const tbody = document.getElementById('tbodyAdmin');
    if (!locales.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">Todavía no hay locales.</td></tr>';
        return;
    }

    tbody.innerHTML = locales.map(l => {
        const cuantos = items.filter(i => i.local === l.id).length;
        const activo  = l.activo !== false;
        return `
        <tr data-id="${l.id}">
            <td>${escapeHtml(l.nombre)}${l.id === TIANGUIS_ID ? ' <span class="etiqueta">tianguis</span>' : ''}</td>
            <td>${cuantos}</td>
            <td><a href="${ligaDe(l.id)}" target="_blank" rel="noopener">abrir</a>
                <button class="btn-mini" data-accion="copiar">copiar liga</button></td>
            <td>${activo ? 'Activo' : 'Inactivo'}</td>
            <td class="acciones">
                <button class="btn-mini" data-accion="renombrar">Renombrar</button>
                <button class="btn-mini" data-accion="activar">${activo ? 'Desactivar' : 'Activar'}</button>
                ${l.id === TIANGUIS_ID ? '' : `<button class="btn-mini peligro" data-accion="borrar" ${cuantos ? 'disabled title="Su lista no está vacía"' : ''}>Borrar</button>`}
            </td>
        </tr>`;
    }).join('');
}

document.getElementById('tbodyAdmin').addEventListener('click', async ev => {
    const boton = ev.target.closest('button[data-accion]');
    if (!boton) return;
    const id    = boton.closest('tr').dataset.id;
    const local = locales.find(l => l.id === id);
    if (!local) return;

    if (boton.dataset.accion === 'copiar') {
        try {
            await navigator.clipboard.writeText(ligaDe(id));
            showToast('Liga copiada', 'success');
        } catch {
            showToast('No se pudo copiar; ábrela y copia la barra del navegador.', 'error', 5000);
        }
        return;
    }

    if (boton.dataset.accion === 'renombrar') {
        const nombre = prompt('Nuevo nombre del local:', local.nombre);
        if (!nombre?.trim()) return;
        // El id no cambia: las ligas que ya repartiste siguen sirviendo
        await LOCALES_REF.doc(id).update({ nombre: nombre.trim() });
        showToast('Local renombrado', 'success');
        return;
    }

    if (boton.dataset.accion === 'activar') {
        const activo = local.activo === false;
        await LOCALES_REF.doc(id).update({ activo });
        showToast(activo ? 'Local activo' : 'Local desactivado; deja de sumar en la global', 'success');
        return;
    }

    if (boton.dataset.accion === 'borrar') {
        if (items.some(i => i.local === id)) {
            showToast('Vacía su lista antes de borrar el local.', 'error');
            return;
        }
        if (!confirm(`¿Borrar el local "${local.nombre}"? Su liga dejará de funcionar.`)) return;
        await LOCALES_REF.doc(id).delete();
        showToast('Local borrado', 'error');
    }
});

document.getElementById('crearLocalBtn').addEventListener('click', async () => {
    const campo  = document.getElementById('nuevoNombre');
    const nombre = campo.value.trim();
    if (!nombre) {
        showToast('Escribe el nombre del local.', 'error');
        return;
    }

    const id = idDesdeNombre(nombre);
    if (!id) {
        showToast('Ese nombre no sirve para una liga; usa letras o números.', 'error');
        return;
    }
    if (locales.some(l => l.id === id)) {
        showToast('Ya hay un local con ese nombre.', 'error');
        return;
    }

    try {
        await LOCALES_REF.doc(id).set({ nombre, activo: true, creado: Date.now() });
    } catch (err) {
        console.error('No se pudo crear el local:', err);
        showToast('No se pudo crear. Revisa tu conexión.', 'error', 5000);
        return;
    }
    campo.value = '';
    showToast(`Local "${nombre}" creado`, 'success');
});

// Nada se carga hasta que haya sesión
protegerPagina().then(() => {
    LOCALES_REF.onSnapshot(snap => {
        locales = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
        render();
    }, err => console.error('No se pudieron cargar los locales:', err));

    ITEMS_REF.onSnapshot(snap => {
        items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    }, err => console.error('No se pudieron contar los productos:', err));
});
