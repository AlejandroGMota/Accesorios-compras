// Índice de locales: la liga de cada lista y cuánto lleva pendiente.

const LOCALES_REF = db.collection('locales');
const ITEMS_REF   = db.collection('items');

const TIANGUIS_ID = 'tianguis';

// El tianguis es un local más, pero conserva su URL de siempre
const ligaDe = id => id === TIANGUIS_ID ? 'index.html' : `local.html?id=${encodeURIComponent(id)}`;

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let locales = [];
let items   = [];

function render() {
    const cont = document.getElementById('listaLocales');
    const activos = locales.filter(l => l.activo !== false);

    if (!activos.length) {
        cont.innerHTML = '<p class="muted">Todavía no hay locales. Créalos en <a href="admin.html">Admin</a>.</p>';
        return;
    }

    cont.innerHTML = activos.map(l => {
        const suyos     = items.filter(i => i.local === l.id);
        const pendiente = suyos.filter(i => !i.comprada).length;
        const detalle   = pendiente
            ? `${pendiente} por comprar`
            : (suyos.length ? 'Todo comprado' : 'Lista vacía');
        return `
        <a class="local-card" href="${ligaDe(l.id)}">
            <span class="local-nombre">${escapeHtml(l.nombre)}</span>
            <span class="local-detalle">${detalle}</span>
        </a>`;
    }).join('');
}

LOCALES_REF.onSnapshot(snap => {
    locales = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
    render();
}, err => {
    console.error('No se pudieron cargar los locales:', err);
    document.getElementById('listaLocales').innerHTML =
        '<p class="muted">No se pudo cargar. Revisa tu conexión.</p>';
});

ITEMS_REF.onSnapshot(snap => {
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
}, err => console.error('No se pudieron contar los pendientes:', err));
