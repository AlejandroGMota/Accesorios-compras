// Lista global: todo lo que hay que comprar, de todos los locales juntos.
// Reusa lista-core.js (ITEMS_REF, toggleComprada, deleteProduct, showToast).
//
// La vista que importa al ir con el proveedor es «junto por producto»: no se
// compran 1 caja del local A y 1 del B, se compran 2 y luego se reparten. La
// vista «separado por local» es la del regreso, para repartir lo que trajiste.

const ETIQUETAS_CATEGORIA = {
    'Micas': 'Micas', 'Hidrogel': 'Hidrogel', 'Fundas': 'Fundas',
    'Fundas nuevas': 'Fundas nuevas', '1hora': '1 Hora',
    'Refacciones': 'Refacciones', 'Otros': 'Otros',
};

let locales    = [];
let todos      = [];
const filtros  = { local: '', categoria: '', agrupar: true, ocultarCompradas: true };

const nombreLocal = id => locales.find(l => l.id === id)?.nombre ?? id;
const fmtDinero   = n => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ========== Filtrado ==========
function visibles() {
    const activos = new Set(locales.filter(l => l.activo !== false).map(l => l.id));
    return todos.filter(i =>
        activos.has(i.local) &&
        (!filtros.local || i.local === filtros.local) &&
        (!filtros.categoria || i.category === filtros.categoria) &&
        (!filtros.ocultarCompradas || !i.comprada));
}

// ========== Agrupado por producto ==========
// El mismo modelo anotado en dos locales es una sola compra
const claveProducto = i =>
    `${i.category}||${i.type ?? ''}||${(i.name ?? '').trim().toLowerCase()}`;

function agrupar(items) {
    const grupos = new Map();
    for (const i of items) {
        const clave = claveProducto(i);
        if (!grupos.has(clave)) {
            grupos.set(clave, {
                clave, category: i.category, type: i.type ?? '', name: i.name,
                cantidad: 0, costo: 0, items: [],
            });
        }
        const g = grupos.get(clave);
        g.cantidad += i.quantity ?? 0;
        g.costo    += (i.price ?? 0) * (i.quantity ?? 0);
        g.items.push(i);
    }
    return [...grupos.values()].sort((a, b) =>
        a.category.localeCompare(b.category, 'es') ||
        (a.type ?? '').localeCompare(b.type ?? '', 'es') ||
        a.name.localeCompare(b.name, 'es'));
}

// Cómo se reparte un producto entre locales: "Centro 2 · Tianguis 1"
function reparto(grupo) {
    const porLocal = new Map();
    for (const i of grupo.items)
        porLocal.set(i.local, (porLocal.get(i.local) ?? 0) + (i.quantity ?? 0));
    return [...porLocal.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${escapeHtml(nombreLocal(id))} ${n}`)
        .join(' · ');
}

// ========== Render ==========
function render() {
    const items = visibles();
    renderStats(items);

    const cont = document.getElementById('contenidoGlobal');
    if (!items.length) {
        cont.innerHTML = `<div class="card"><p class="muted">${
            filtros.ocultarCompradas
                ? 'No hay nada pendiente con estos filtros.'
                : 'No hay nada con estos filtros.'}</p></div>`;
        return;
    }

    cont.innerHTML = filtros.agrupar ? vistaAgrupada(items) : vistaPorLocal(items);
    cont.querySelectorAll('button[data-ids]').forEach(b =>
        b.addEventListener('click', () => palomearGrupo(b.dataset.ids.split(','))));
    cont.querySelectorAll('button[data-id]').forEach(b =>
        b.addEventListener('click', () => toggleComprada(b.dataset.id)));
}

function vistaAgrupada(items) {
    const grupos = agrupar(items);
    let html = '';
    let categoriaActual = null;

    for (const g of grupos) {
        if (g.category !== categoriaActual) {
            if (categoriaActual !== null) html += '</tbody></table></div></div>';
            categoriaActual = g.category;
            html += `
            <div class="card">
                <h2>${ETIQUETAS_CATEGORIA[g.category] ?? escapeHtml(g.category)}</h2>
                <div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Reparto</th><th>Costo</th><th></th></tr></thead>
                <tbody>`;
        }
        const todasCompradas = g.items.every(i => i.comprada);
        html += `
            <tr class="${todasCompradas ? 'fila-comprada' : ''}">
                <td>${escapeHtml(g.name)}</td>
                <td>${escapeHtml(g.type) || '<span class="cero">—</span>'}</td>
                <td><strong>${g.cantidad}</strong></td>
                <td class="reparto">${reparto(g)}</td>
                <td>${g.costo ? fmtDinero(g.costo) : '<span class="cero">—</span>'}</td>
                <td><button class="btn-mini" data-ids="${g.items.map(i => i.id).join(',')}">
                    ${todasCompradas ? 'Desmarcar' : 'Comprado'}</button></td>
            </tr>`;
    }
    return html + (categoriaActual !== null ? '</tbody></table></div></div>' : '');
}

function vistaPorLocal(items) {
    const porLocal = new Map();
    for (const i of items) {
        if (!porLocal.has(i.local)) porLocal.set(i.local, []);
        porLocal.get(i.local).push(i);
    }

    return [...porLocal.entries()]
        .sort((a, b) => nombreLocal(a[0]).localeCompare(nombreLocal(b[0]), 'es'))
        .map(([id, suyos]) => {
            const filas = suyos
                .sort((a, b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'))
                .map(i => `
                <tr class="${i.comprada ? 'fila-comprada' : ''}">
                    <td>${escapeHtml(i.name)}</td>
                    <td>${ETIQUETAS_CATEGORIA[i.category] ?? escapeHtml(i.category)}</td>
                    <td>${escapeHtml(i.type ?? '') || '<span class="cero">—</span>'}</td>
                    <td>${i.quantity}</td>
                    <td><button class="btn-mini" data-id="${i.id}">
                        ${i.comprada ? 'Desmarcar' : 'Comprado'}</button></td>
                </tr>`).join('');
            return `
            <div class="card">
                <h2>${escapeHtml(nombreLocal(id))}</h2>
                <div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Producto</th><th>Categoría</th><th>Tipo</th><th>Cant.</th><th></th></tr></thead>
                <tbody>${filas}</tbody></table></div>
            </div>`;
        }).join('');
}

function renderStats(items) {
    const pendientes = items.filter(i => !i.comprada);
    const piezas     = pendientes.reduce((s, i) => s + (i.quantity ?? 0), 0);
    const costo      = pendientes.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 0), 0);
    const conCola    = new Set(pendientes.map(i => i.local)).size;

    document.getElementById('statPendientes').textContent = agrupar(pendientes).length;
    document.getElementById('statPiezas').textContent     = piezas;
    document.getElementById('statCosto').textContent      = fmtDinero(costo);
    document.getElementById('statLocales').textContent    = conCola;
}

// Comprar un producto lo palomea en todos los locales que lo pidieron
async function palomearGrupo(ids) {
    const items    = ids.map(id => todos.find(i => i.id === id)).filter(Boolean);
    if (!items.length) return;
    const marcando = !items.every(i => i.comprada);

    // currentItems es lo que lista-core consulta para saber de qué producto se trata
    currentItems = todos;
    for (const i of items) {
        if (!!i.comprada === marcando) continue;
        await toggleComprada(i.id);
    }
}

// ========== Filtros ==========
function initFiltros() {
    const selCat = document.getElementById('filtroCategoria');
    CATEGORIAS.forEach(c => {
        const op = document.createElement('option');
        op.value = c;
        op.textContent = ETIQUETAS_CATEGORIA[c] ?? c;
        selCat.appendChild(op);
    });

    selCat.addEventListener('change', e => { filtros.categoria = e.target.value; render(); });
    document.getElementById('filtroLocal').addEventListener('change', e => {
        filtros.local = e.target.value; render();
    });
    document.querySelectorAll('input[name="vistaGlobal"]').forEach(r =>
        r.addEventListener('change', e => { filtros.agrupar = e.target.value === 'agrupada'; render(); }));
    document.getElementById('ocultarCompradas').addEventListener('change', e => {
        filtros.ocultarCompradas = e.target.checked; render();
    });
}

function llenarSelectLocales() {
    const sel = document.getElementById('filtroLocal');
    const previo = sel.value;
    sel.innerHTML = '<option value="">Todos los locales</option>';
    locales.filter(l => l.activo !== false).forEach(l => {
        const op = document.createElement('option');
        op.value = l.id;
        op.textContent = l.nombre;
        sel.appendChild(op);
    });
    sel.value = previo;
}

// ========== Arranque ==========
window.addEventListener('DOMContentLoaded', async () => {
    await protegerPagina();
    initFiltros();

    LOCALES_REF.onSnapshot(snap => {
        locales = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
        llenarSelectLocales();
        render();
    }, err => console.error('No se pudieron cargar los locales:', err));

    ITEMS_REF.onSnapshot(snap => {
        todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        currentItems = todos;
        render();
    }, err => {
        console.error('No se pudo cargar la lista global:', err);
        document.getElementById('contenidoGlobal').innerHTML =
            '<div class="card"><p class="muted">No se pudo cargar. Revisa tu conexión.</p></div>';
    });
});
