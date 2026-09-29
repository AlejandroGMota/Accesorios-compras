// ========== Unidades ==========
// 9D y 9H se compran por caja de 10 pzs: en esos registros `cantidad` son cajas
// y `precio` es por caja. Privacidad se compra por pieza. Todo lo que compara
// tipos entre sí (totales, %, dona, tendencia) se cuenta en piezas.

const TIPOS        = ['9D', '9H', 'Privacidad'];
const PZS_POR_CAJA = { '9D': 10, '9H': 10, 'Privacidad': 1 };
const COLORES      = { '9D': '#6c63ff', '9H': '#48bfe3', 'Privacidad': '#f4a261' };

const esPorCaja = tipo => PZS_POR_CAJA[tipo] > 1;
const fmtNum    = n => n.toLocaleString('es-MX', { maximumFractionDigits: 1 });
const fmtDinero = n => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural    = (n, uno, varios) => `${fmtNum(n)} ${n === 1 ? uno : varios}`;

// "280 pzs (28 cajas)" para 9D/9H, "25 pzs" para privacidad
function fmtPiezas(pzs, tipo) {
    const base = `${fmtNum(pzs)} pzs`;
    return tipo && esPorCaja(tipo) ? `${base} (${plural(pzs / PZS_POR_CAJA[tipo], 'caja', 'cajas')})` : base;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sumaPor(docs, clave, valor = d => d.pzs) {
    return docs.reduce((acc, d) => {
        const k = clave(d);
        acc[k] = (acc[k] || 0) + valor(d);
        return acc;
    }, {});
}

const mayor = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];

// ========== Normalización de nombres ==========

// Clave para comparar nombres: minúsculas, sin notas de encargo ("deja 50…",
// "encargó…"), sin teléfonos y sin puntuación sobrante. Así "E40," y "e40",
// o "Y9 prime" y "y9 prime", caen en el mismo modelo.
// En iPhone se quita el prefijo: "13", "ip 13", "ip13" e "iPhone 13" dan "13",
// y "13pm" / "ip13promax" / "iphone 13 pro max" dan "13 pro max".
// "op a38" es OPPO: se expande a "oppo a38".
function claveNombre(nombre) {
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

async function cargarAliases() {
    try {
        const resp = await fetch('./aliases.csv');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const map = new Map();
        text.trim().split('\n').slice(1).forEach(linea => {
            const [alias, nombre] = linea.split(',').map(s => s.trim());
            if (!alias || !nombre) return;
            map.set(claveNombre(alias), nombre);
            // Registros viejos guardaron el nombre ya normalizado
            if (!map.has(claveNombre(nombre))) map.set(claveNombre(nombre), nombre);
        });
        return map;
    } catch (e) {
        console.warn('aliases.csv no disponible:', e);
        return new Map();
    }
}

// Convención de captura para modelos sin alias: "a24" / "s23 fe" a secas son
// Samsung; OPPO siempre lleva prefijo ("oppo a58", "op a38").
const PATRONES_MODELO = [
    [/^a ?(\d{2}s?)$/,                     m => `Samsung Galaxy A${m[1]}`],
    [/^s ?(\d{2})( ?(fe|plus|ultra))?$/,   m => `Samsung Galaxy S${m[1]}${m[3] ? ` ${m[3] === 'fe' ? 'FE' : m[3][0].toUpperCase() + m[3].slice(1)}` : ''}`],
    [/^oppo a ?(\d{2})$/,                  m => `OPPO A${m[1]}`],
];

function modeloPorPatron(clave) {
    for (const [re, nombre] of PATRONES_MODELO) {
        const m = clave.match(re);
        if (m) return nombre(m);
    }
    return null;
}

// Modelo de un registro: primero por lo que se escribió en la lista y luego por
// el nombre guardado, que en registros viejos viene de otra versión de aliases
// (así un "a58" viejo guardado como "OPPO A58" no se vuelve Samsung).
function modeloDe(d, aliasMap) {
    for (const n of [d.nombre_original, d.nombre]) {
        const modelo = aliasMap.get(claveNombre(n));
        if (modelo) return { modelo, conAlias: true };
    }
    const clave  = claveNombre(d.nombre_original || d.nombre);
    const modelo = modeloPorPatron(clave);
    return modelo ? { modelo, conAlias: true } : { modelo: clave || '(sin nombre)', conAlias: false };
}

// Cuándo se compró de verdad: `comprado` lo pone la lista al marcar la mica o al
// borrarla. Si no está (registros viejos), queda `fecha`, que es cuando se anotó.
function fechaDe(d) {
    const fecha = d.comprado?.toDate ? d.comprado.toDate()
        : d.fecha?.toDate ? d.fecha.toDate()
        : new Date(d.año, (d.mes || 1) - 1, 15);
    return isNaN(fecha) ? null : fecha;
}

// ========== Carga de datos de Firestore ==========

async function cargarDatos() {
    const snap = await db.collection('micas_compras').get();
    return snap.docs.map(d => d.data());
}

// Los registros de antes de que hubiera locales son del tianguis
const localDe = d => d.local || 'tianguis';

async function cargarLocales() {
    try {
        const snap = await db.collection('locales').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
    } catch (e) {
        console.warn('No se pudieron cargar los locales:', e);
        return [];
    }
}

function prepararDocs(crudos, aliasMap) {
    const docs = [];
    let sinTipo = 0, pendientes = 0;
    for (const d of crudos) {
        // Solo cuentan las compras confirmadas con la paloma en la lista. Los
        // registros viejos no traen `estado` y se siguen contando como antes.
        if (d.anulado || d.estado === 'anulado') continue;
        if (d.estado === 'pendiente') { pendientes++; continue; }
        if (!PZS_POR_CAJA[d.tipo]) { sinTipo++; continue; }
        const cantidad = Number(d.cantidad) || 0;
        docs.push({
            ...modeloDe(d, aliasMap),
            tipo:      d.tipo,
            cantidad,                                   // cajas (9D/9H) o piezas (Privacidad)
            pzs:       cantidad * PZS_POR_CAJA[d.tipo],
            invertido: (Number(d.precio) || 0) * cantidad,
            fecha:     fechaDe(d),
        });
    }
    return { docs, sinTipo, pendientes };
}

// ========== Dashboard: resumen ==========

function renderDashboard(docs, sinTipo, pendientes = 0) {
    const totalPzs = docs.reduce((s, d) => s + d.pzs, 0);
    const totalInv = docs.reduce((s, d) => s + d.invertido, 0);
    const cantidadPorTipo = sumaPor(docs, d => d.tipo, d => d.cantidad);
    const mejorModelo = mayor(sumaPor(docs, d => d.modelo));
    const mejorTipo   = mayor(sumaPor(docs, d => d.tipo));

    document.getElementById('stat-total').textContent = `${fmtNum(totalPzs)} pzs`;
    document.getElementById('stat-total-detalle').textContent = TIPOS
        .map(t => esPorCaja(t)
            ? `${plural(cantidadPorTipo[t] || 0, 'caja', 'cajas')} ${t}`
            : `${fmtNum(cantidadPorTipo[t] || 0)} pzs ${t.toLowerCase()}`)
        .join(' · ');
    document.getElementById('stat-invertido').textContent = fmtDinero(totalInv);
    document.getElementById('stat-modelo').textContent = mejorModelo ? `${mejorModelo[0]} (${fmtNum(mejorModelo[1])} pzs)` : '—';
    document.getElementById('stat-tipo').textContent   = mejorTipo   ? `${mejorTipo[0]} (${fmtPiezas(mejorTipo[1], mejorTipo[0])})` : '—';

    const avisos = [];
    if (sinTipo)    avisos.push(`${plural(sinTipo, 'registro', 'registros')} sin tipo de mica`);
    if (pendientes) avisos.push(`${plural(pendientes, 'mica anotada', 'micas anotadas')} en la lista sin palomear como comprada${pendientes === 1 ? '' : 's'}`);
    document.getElementById('nota-resumen').textContent = avisos.length
        ? `No se ${avisos.length === 1 && !sinTipo && pendientes === 1 ? 'cuenta' : 'cuentan'} aquí: ${avisos.join(' · ')}.`
        : '';
}

// ========== Ranking por modelo ==========

let rankingData  = [];
let sortCol      = 'pzs';
let sortDir      = -1; // -1 = desc, 1 = asc

function buildRankingData(docs) {
    const totalPzs = docs.reduce((s, d) => s + d.pzs, 0);
    const map = {};

    for (const d of docs) {
        map[d.modelo] ??= { nombre: d.modelo, conAlias: d.conAlias, '9D': 0, '9H': 0, Privacidad: 0, pzs: 0, invertido: 0 };
        const row = map[d.modelo];
        row[d.tipo]    += d.cantidad;
        row.pzs        += d.pzs;
        row.invertido  += d.invertido;
    }

    return Object.values(map).map(row => ({ ...row, pct: totalPzs > 0 ? row.pzs / totalPzs * 100 : 0 }));
}

function renderRanking(docs) {
    rankingData = buildRankingData(docs);
    sortAndRenderRanking();

    const sinAlias = rankingData.filter(r => !r.conAlias).length;
    document.getElementById('nota-ranking').textContent = sinAlias
        ? `En cursiva: ${plural(sinAlias, 'nombre que no está', 'nombres que no están')} en aliases.csv y no se agrupan con su modelo.`
        : '';

    document.querySelectorAll('#tabla-ranking th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) sortDir *= -1;
            else { sortCol = col; sortDir = col === 'nombre' ? 1 : -1; }
            sortAndRenderRanking();
        });
    });
}

function sortAndRenderRanking() {
    const sorted = [...rankingData].sort((a, b) => {
        const cmp = sortCol === 'nombre'
            ? a.nombre.localeCompare(b.nombre, 'es')
            : a[sortCol] - b[sortCol];
        return cmp * sortDir;
    });

    const celda = n => n ? fmtNum(n) : '<span class="cero">–</span>';
    const tbody = document.getElementById('tbody-ranking');
    tbody.innerHTML = sorted.map(row => `
        <tr>
            <td${row.conAlias ? '' : ' class="sin-alias"'}>${escapeHtml(row.nombre)}</td>
            <td>${celda(row['9D'])}</td>
            <td>${celda(row['9H'])}</td>
            <td>${celda(row['Privacidad'])}</td>
            <td><strong>${fmtNum(row.pzs)}</strong></td>
            <td>${fmtDinero(row.invertido)}</td>
            <td>${row.pct.toFixed(1)}%</td>
        </tr>
    `).join('');
}

// ========== Gráfica de dona: distribución por tipo ==========

// Chart.js no deja reusar un canvas que ya tiene una gráfica encima: al cambiar
// de local o de periodo hay que tirar la anterior antes de dibujar.
function pintarChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    Chart.getChart(canvas)?.destroy();
    return new Chart(canvas, config);
}

function renderDonut(docs) {
    const pzsPorTipo = sumaPor(docs, d => d.tipo);

    pintarChart('chart-donut', {
        type: 'doughnut',
        data: {
            labels: TIPOS,
            datasets: [{
                data: TIPOS.map(t => pzsPorTipo[t] || 0),
                backgroundColor: TIPOS.map(t => COLORES[t]),
                borderWidth: 0,
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${fmtPiezas(ctx.raw, ctx.label)}`
                    }
                }
            }
        }
    });
}

// ========== Gráfica de líneas: tendencia mensual ==========

const claveMes = f => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;

// Todos los meses entre la primera y la última compra, incluidos los vacíos
function rangoMeses(docs) {
    const fechas = docs.map(d => d.fecha).sort((a, b) => a - b);
    const meses  = [];
    const cursor = new Date(fechas[0].getFullYear(), fechas[0].getMonth(), 1);
    while (cursor <= fechas[fechas.length - 1]) {
        meses.push(claveMes(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return meses;
}

function renderTendencia(docs) {
    const conFecha = docs.filter(d => d.fecha);
    if (!conFecha.length) return;

    const meses = rangoMeses(conFecha);
    const pzsPorMesTipo = sumaPor(conFecha, d => `${claveMes(d.fecha)}|${d.tipo}`);

    // Formato de etiquetas legible: "abr 2026"
    const labels = meses.map(m => {
        const [anio, mes] = m.split('-').map(Number);
        return new Date(anio, mes - 1).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
    });

    pintarChart('chart-lineas', {
        type: 'line',
        data: {
            labels,
            datasets: TIPOS.map(tipo => ({
                label: tipo,
                data: meses.map(m => pzsPorMesTipo[`${m}|${tipo}`] || 0),
                borderColor: COLORES[tipo],
                backgroundColor: `${COLORES[tipo]}1a`,
                tension: 0.3,
                fill: true,
            })),
        },
        options: {
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${fmtPiezas(ctx.raw, ctx.dataset.label)}`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

// ========== Previsión de compra ==========
// Promedio mensual ponderado de los últimos 6 meses: cada mes que pasa pesa la
// mitad cada 3 meses, así manda la tendencia actual y no la de hace años. El mes
// en curso se lleva a mes completo (si ya lleva al menos una semana), y diciembre
// sube 30% por temporada.

const MESES_HISTORIAL   = 6;
const VIDA_MEDIA_MESES  = 3;
const MESES_A_PROYECTAR = 3;
const DIAS_MINIMOS_MES  = 7;
const TOP_POR_TIPO      = 8;
const FACTOR_DICIEMBRE  = 1.3;
const DIA_MS            = 24 * 60 * 60 * 1000;

const diasDelMes = (anio, mes) => new Date(anio, mes + 1, 0).getDate();

// Meses del historial que se pueden usar, del más viejo al actual
function mesesDeHistorial(hoy, primera) {
    const meses = [];
    for (let i = MESES_HISTORIAL - 1; i >= 0; i--) {
        const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        if (f < new Date(primera.getFullYear(), primera.getMonth(), 1)) continue;
        const dias   = diasDelMes(f.getFullYear(), f.getMonth());
        const enCurso = i === 0;
        // El mes en curso va a medias: se proyecta a mes completo, salvo que apenas empiece
        const escala = !enCurso ? 1
            : hoy.getDate() >= DIAS_MINIMOS_MES ? dias / hoy.getDate()
            : 0;
        meses.push({ clave: claveMes(f), peso: Math.pow(0.5, i / VIDA_MEDIA_MESES), escala });
    }
    return meses.filter(m => m.escala > 0);
}

function calcularPrevision(docs, pendientes = new Map()) {
    const conFecha = docs.filter(d => d.fecha);
    if (!conFecha.length) return null;

    const hoy     = new Date();
    const primera = new Date(Math.min(...conFecha.map(d => d.fecha)));
    const meses   = mesesDeHistorial(hoy, primera);
    if (!meses.length) return null;

    const pesoTotal = meses.reduce((s, m) => s + m.peso, 0);
    const enHistorial = new Map(meses.map(m => [m.clave, m]));

    // Piezas por modelo y tipo en cada mes del historial
    const porMes = {};
    for (const d of conFecha) {
        if (!enHistorial.has(claveMes(d.fecha))) continue;
        const clave = `${d.tipo}||${d.modelo}`;
        (porMes[clave] ??= {});
        porMes[clave][claveMes(d.fecha)] = (porMes[clave][claveMes(d.fecha)] || 0) + d.pzs;
    }

    // Meses que se proyectan
    const futuros = [];
    for (let k = 1; k <= MESES_A_PROYECTAR; k++) {
        const f = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1);
        futuros.push({
            etiqueta: f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''),
            factor:   f.getMonth() === 11 ? FACTOR_DICIEMBRE : 1,
        });
    }

    // Reparte la compra mes a mes sobre la demanda acumulada: un modelo que gasta
    // media caja al mes pide una caja cada dos meses, no una cada mes.
    // Lo que ya está en la lista de compras se descuenta de los primeros meses.
    const repartir = (pzsMes, tipo, enLista) => {
        let pzs = 0, comprado = 0, cubierto = enLista;
        return futuros.map(f => {
            pzs += pzsMes * f.factor;
            const acumulado = Math.round(pzs / PZS_POR_CAJA[tipo]);
            const compra = Math.max(0, acumulado - comprado);
            comprado = acumulado;
            const yaTengo = Math.min(cubierto, compra);
            cubierto -= yaTengo;
            return compra - yaTengo;
        });
    };

    const porTipo = Object.fromEntries(TIPOS.map(t => [t, []]));
    for (const [clave, porClaveMes] of Object.entries(porMes)) {
        const [tipo, modelo] = clave.split('||');
        const pzsMes = meses.reduce((s, m) => s + (porClaveMes[m.clave] || 0) * m.escala * m.peso, 0) / pesoTotal;
        const compras = repartir(pzsMes, tipo, pendientes.get(clave) || 0);
        if (!compras.some(c => c > 0)) continue;
        porTipo[tipo].push({ modelo, pzsMes, compras, total: compras.reduce((a, b) => a + b, 0) });
    }
    for (const t of TIPOS) porTipo[t].sort((a, b) => b.pzsMes - a.pzsMes);

    return { meses: meses.length, futuros, porTipo };
}

function renderPrevision(prev) {
    const contenedor = document.getElementById('proyecciones-contenido');
    if (!prev) {
        contenedor.innerHTML = '<p class="muted">Acumulando datos… La previsión necesita al menos un mes de historial.</p>';
        return;
    }

    const tabla = (tipo) => {
        const filas = prev.porTipo[tipo];
        if (!filas.length) return '<p class="muted">Sin compras en el periodo.</p>';

        const unidad  = esPorCaja(tipo) ? 'cajas' : 'pzs';
        const visibles = filas.slice(0, TOP_POR_TIPO);
        const resto    = filas.slice(TOP_POR_TIPO);
        const suma     = (lista, i) => lista.reduce((s, f) => s + f.compras[i], 0);

        const renglon = (nombre, compras, total, clase = '') => `
            <tr${clase}>
                <td>${escapeHtml(nombre)}</td>
                ${compras.map(c => `<td>${c ? fmtNum(c) : '<span class="cero">–</span>'}</td>`).join('')}
                <td><strong>${fmtNum(total)}</strong></td>
            </tr>`;

        return `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${tipo} · ${unidad}</th>
                            ${prev.futuros.map(f => `<th>${f.etiqueta}</th>`).join('')}
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visibles.map(f => renglon(f.modelo, f.compras, f.total)).join('')}
                        ${resto.length ? renglon(`Otros ${resto.length} modelos`, prev.futuros.map((_, i) => suma(resto, i)), resto.reduce((s, f) => s + f.total, 0)) : ''}
                        ${renglon('Total', prev.futuros.map((_, i) => suma(filas, i)), filas.reduce((s, f) => s + f.total, 0), ' class="fila-total"')}
                    </tbody>
                </table>
            </div>`;
    };

    contenedor.innerHTML = `
        <p class="chart-note">
            Cuánto comprar en los próximos ${MESES_A_PROYECTAR} meses, según los últimos ${prev.meses} meses de compras
            (los meses recientes pesan más: a los ${VIDA_MEDIA_MESES} meses, la mitad). 9D y 9H en cajas de ${PZS_POR_CAJA['9D']} pzs;
            privacidad en piezas. Diciembre sube ${Math.round((FACTOR_DICIEMBRE - 1) * 100)}% por temporada.
            Ya se descontó lo que tienes en la lista de compras.
        </p>
        ${TIPOS.map(t => `<div class="prevision-tipo">${tabla(t)}</div>`).join('')}
    `;
}


// ========== Qué falta comprar ==========
// Cada modelo tiene su ritmo: cada cuántos días se vuelve a comprar. Con la
// última compra y esa cadencia (de los últimos 6 meses) se ve qué ya toca
// reponer. Lo que ya esté en la lista de compras se descuenta.

const UMBRAL_AVISO     = 0.8;   // desde el 80% de la cadencia ya aparece
const DIAS_MINIMO_RITMO = 21;   // dos compras muy juntas no dicen nada del ritmo
const CADENCIA_MINIMA   = 15;   // piso, para que un par de compras seguidas no dé «cada 2 días»
const MAX_FILAS_FALTA   = 12;

const claveDia = f => `${f.getFullYear()}-${f.getMonth()}-${f.getDate()}`;

function mediana(nums) {
    const orden = [...nums].sort((a, b) => a - b);
    return orden[Math.floor(orden.length / 2)];
}

// Varias capturas del mismo día son una sola compra
function comprasPorDia(compras) {
    const dias = new Map();
    for (const c of compras) {
        const dia = claveDia(c.fecha);
        if (dias.has(dia)) dias.get(dia).cantidad += c.cantidad;
        else dias.set(dia, { fecha: c.fecha, cantidad: c.cantidad });
    }
    return [...dias.values()].sort((a, b) => a.fecha - b.fecha);
}

// Lo que hay ahora en la lista de compras, por modelo y tipo
async function cargarPendientes(aliasMap, local = '') {
    const pendientes = new Map();
    try {
        // Cada producto es un documento de `items`; antes eran un array dentro
        // de un solo documento. Sin local, se cuentan los de todos.
        const ref   = local ? db.collection('items').where('local', '==', local) : db.collection('items');
        const snap  = await ref.get();
        const items = snap.docs.map(d => d.data());
        for (const p of items) {
            if (p.category !== 'Micas' || !PZS_POR_CAJA[p.type]) continue;
            // Las ya palomeadas cuentan como compra hecha; descontarlas otra vez
            // haría que la previsión pidiera de menos
            if (p.comprada) continue;
            const { modelo } = modeloDe({ nombre_original: p.name, nombre: p.name }, aliasMap);
            const clave = `${p.type}||${modelo}`;
            pendientes.set(clave, (pendientes.get(clave) || 0) + (Number(p.quantity) || 0));
        }
    } catch (e) {
        console.warn('No se pudo leer la lista de compras:', e);
    }
    return pendientes;
}

function calcularReposicion(docs, pendientes) {
    const hoy   = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - MESES_HISTORIAL, hoy.getDate());

    const grupos = {};
    for (const d of docs) {
        if (!d.fecha || d.fecha < desde) continue;
        (grupos[`${d.tipo}||${d.modelo}`] ??= []).push(d);
    }

    const filas = [];
    for (const [clave, compras] of Object.entries(grupos)) {
        const [tipo, modelo] = clave.split('||');
        const dias = comprasPorDia(compras);
        if (dias.length < 2) continue;   // con una sola compra no se sabe cada cuánto

        const ultima   = dias[dias.length - 1].fecha;
        const periodo  = (ultima - dias[0].fecha) / DIA_MS;
        if (periodo < DIAS_MINIMO_RITMO) continue;   // todas las compras casi el mismo día

        const cadencia = Math.max(CADENCIA_MINIMA, Math.round(periodo / (dias.length - 1)));
        const diasSin  = Math.floor((hoy - ultima) / DIA_MS);
        const urgencia = diasSin / cadencia;
        if (urgencia < UMBRAL_AVISO) continue;

        const tipica  = mediana(dias.map(d => d.cantidad));
        const enLista = pendientes.get(clave) || 0;
        filas.push({ modelo, tipo, ultima, cadencia, diasSin, urgencia, tipica, enLista, comprar: Math.max(0, tipica - enLista) });
    }
    return filas.sort((a, b) => b.urgencia - a.urgencia);
}

function renderReposicion(todas) {
    const contenedor = document.getElementById('reponer-contenido');
    const filas = todas.slice(0, MAX_FILAS_FALTA);
    const ocultas = todas.length - filas.length;
    if (!filas.length) {
        contenedor.innerHTML = '<p class="muted">Ningún modelo pasó de su ritmo de compra. No falta nada por ahora.</p>';
        return;
    }

    const cantidad = (n, tipo) => esPorCaja(tipo) ? plural(n, 'caja', 'cajas') : `${fmtNum(n)} pzs`;

    contenedor.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Modelo</th>
                        <th>Tipo</th>
                        <th>Última</th>
                        <th>Cada</th>
                        <th>Sin comprar</th>
                        <th>En lista</th>
                        <th>Comprar</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas.map(f => `
                        <tr${f.urgencia >= 1 ? ' class="alerta"' : ''}>
                            <td>${escapeHtml(f.modelo)}</td>
                            <td>${f.tipo}</td>
                            <td>${f.ultima.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</td>
                            <td>${f.cadencia} d</td>
                            <td>${f.diasSin} d</td>
                            <td>${f.enLista ? cantidad(f.enLista, f.tipo) : '<span class="cero">–</span>'}</td>
                            <td><strong>${f.comprar ? cantidad(f.comprar, f.tipo) : 'ya en la lista'}</strong></td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p class="chart-note">
            En rojo, los que ya pasaron su ritmo de compra. «Comprar» es lo que sueles llevar de ese modelo,
            menos lo que ya tienes en la lista.${ocultas ? ` Hay ${ocultas} más con menos urgencia.` : ''}
        </p>`;
}

// ========== Fundas ==========
// Dos preguntas: qué modelos piden más funda (ranking de ventas) y qué tipo rota
// más rápido (días entre comprar y vender). Las compras las escribe la lista al
// palomear (`fundas_compras`) y las ventas la pantalla de ventas
// (`fundas_ventas`), así que todo aquí tiene que aguantar que vengan vacías.

const TIPOS_FUNDA = ['Magsafe', 'Transparente', '3 piezas', 'Diseño hombre', 'Diseño mujer', 'Uso rudo', 'Color', 'Para personalizar'];
// Los 8 tipos de arriba en orden; de ahí se repite, para que un tipo nuevo que
// alguien agregue al formulario no se quede sin color.
const PALETA_FUNDA = ['#6c63ff', '#48bfe3', '#f4a261', '#2a9d8f', '#e76f51', '#9d4edd', '#ff70a6', '#8d99ae'];

const PISO_ROTACION   = 10;   // piezas emparejadas mínimas para dar un número de días
const PISO_MODELO     = 10;   // unidades vendidas mínimas para no marcar el renglón como poco dato
const DIAS_PARADO     = 60;   // desde cuándo un lote sin vender es dinero parado
const MAX_FILAS_FUNDA = 15;

const fmtPct = n => `${Math.round(n * 100)}%`;
const fmtDia = f => f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const pzs    = n => plural(n, 'pieza', 'piezas');

// Los 7 tipos conocidos primero y en su orden; lo que llegue de más, alfabético.
function ordenarTipos(tipos) {
    const lista = [...tipos];
    return [
        ...TIPOS_FUNDA.filter(t => lista.includes(t)),
        ...lista.filter(t => !TIPOS_FUNDA.includes(t)).sort((a, b) => a.localeCompare(b, 'es')),
    ];
}

const colorTipo = (tipo, orden) => PALETA_FUNDA[orden.indexOf(tipo) % PALETA_FUNDA.length];

// ---------- Lectura y limpieza ----------

async function cargarColeccionFundas(nombre) {
    try {
        const snap = await db.collection(nombre).get();
        return { docs: snap.docs.map(d => d.data()), error: null };
    } catch (e) {
        console.warn(`No se pudo leer ${nombre}:`, e);
        return { docs: [], error: e.code === 'permission-denied' ? 'permiso' : 'error' };
    }
}

// Una pieza es de un solo tipo: la rotación se calcula por tipo y una compra con
// varios tipos marcados no se puede repartir entre ellos sin inventar cómo. Se
// tolera `tipos[]` (los checkboxes de la lista) mientras traiga uno solo.
function tipoDeFunda(d) {
    if (typeof d.tipo === 'string' && d.tipo.trim()) return { tipo: d.tipo.trim(), mixto: false };
    const tipos = (Array.isArray(d.tipos) ? d.tipos : Array.isArray(d.tipo) ? d.tipo : [])
        .filter(t => typeof t === 'string' && t.trim());
    if (tipos.length === 1) return { tipo: tipos[0].trim(), mixto: false };
    return { tipo: null, mixto: tipos.length > 1 };
}

// Piezas enteras: media funda no existe, y un `cantidad` raro (texto, 0, negativo)
// no debe entrar al emparejado como si fuera una pieza.
function piezasDe(d) {
    const n = Math.round(Number(d.cantidad));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

const modeloDeFunda = (d, aliasMap) =>
    modeloDe({ nombre_original: d.modelo_original, nombre: d.modelo }, aliasMap);

function prepararComprasFundas(crudos, aliasMap) {
    const lotes = [];
    const diag  = { pendientes: 0, mixtas: 0, sinTipo: 0, invalidas: 0 };
    for (const d of crudos) {
        if (d.anulado === true || d.estado === 'anulado') continue;   // dedazo borrado de la lista
        // Solo lo palomeado. Si la lista todavía no escribiera `estado`, la fecha
        // de palomeo alcanza para saber que la compra se hizo de verdad.
        if (d.estado !== 'comprado' && !(d.estado === undefined && d.comprado)) { diag.pendientes++; continue; }
        const { tipo, mixto } = tipoDeFunda(d);
        const piezas = piezasDe(d);
        const fecha  = fechaDe(d);
        if (!piezas || !fecha) { diag.invalidas++; continue; }

        // Color y tipo son la MISMA dimensión: «Azul» es una variante y «Magsafe»
        // es otra, no un color y un tipo de la misma funda. Que en la pantalla
        // estén en dos grupos de casillas es un accidente de cómo quedó, no una
        // diferencia real. Así que cada variante marcada es una funda distinta y
        // el lote se expande en uno por variante, con una pieza cada uno.
        const variantes = [
            ...(Array.isArray(d.colores) ? d.colores : []),
            ...(Array.isArray(d.tipos)   ? d.tipos   : (tipo ? [tipo] : [])),
        ];
        const base = {
            ...modeloDeFunda(d, aliasMap),
            fecha,
            local:     localDe(d),
            invertido: (Number(d.precio) || 0) * piezas,
        };
        if (!variantes.length) { diag.sinTipo++; lotes.push({ ...base, tipo: tipo || '(sin variante)', piezas }); continue; }

        // El importe se reparte entre las variantes para que el total invertido
        // siga cuadrando aunque el lote se haya partido
        const porPieza = base.invertido / variantes.length;
        variantes.forEach(v => lotes.push({ ...base, tipo: v, piezas: 1, invertido: porPieza }));
    }
    return { lotes, diag };
}

function prepararVentasFundas(crudos, aliasMap) {
    const ventas = [];
    const diag   = { anuladas: 0, sinTipo: 0, invalidas: 0 };
    for (const d of crudos) {
        // Una venta mal capturada se marca, no se borra: es el único historial de
        // ventas que hay.
        if (d.anulada === true || d.anulado === true || d.estado === 'anulado') { diag.anuladas++; continue; }
        const { tipo } = tipoDeFunda(d);
        if (!tipo) { diag.sinTipo++; continue; }
        const piezas = piezasDe(d);
        const fecha  = fechaDe(d);
        if (!piezas || !fecha) { diag.invalidas++; continue; }
        ventas.push({ ...modeloDeFunda(d, aliasMap), tipo, piezas, fecha, local: localDe(d) });
    }
    return { ventas, diag };
}

// ---------- Emparejado de ventas con compras ----------
// No se sabe qué pieza física se vendió, así que se supone que se vende primero
// lo que se compró primero. `clave` decide el grano: por tipo (juntando modelos)
// para la rotación, y por modelo+tipo para saber qué lote lleva parado.
//
// A igual fecha entra primero la compra: no se puede vender lo que no ha llegado,
// y una funda comprada y vendida el mismo día son 0 días de verdad. Como los
// eventos se procesan en orden, cualquier lote que esté en la cola se compró
// antes o el mismo día que la venta, así que los días nunca salen negativos.
function emparejarVentasConCompras(lotes, ventas, clave) {
    const grupos = new Map();
    const eventosDe = k => {
        if (!grupos.has(k)) grupos.set(k, []);
        return grupos.get(k);
    };
    lotes.forEach((l, i)  => eventosDe(clave(l)).push({ orden: 0, i, fecha: l.fecha, lote: l }));
    ventas.forEach((v, i) => eventosDe(clave(v)).push({ orden: 1, i, fecha: v.fecha, venta: v }));

    const resultado = new Map();
    for (const [k, eventos] of grupos) {
        eventos.sort((a, b) => a.fecha - b.fecha || a.orden - b.orden || a.i - b.i);

        const cola      = [];   // lotes con piezas sin vender, en orden de compra
        const pares     = [];   // { dias, piezas, fechaVenta } de cada emparejamiento
        const huerfanas = [];   // { piezas, fechaVenta } de ventas sin compra que las respalde

        for (const ev of eventos) {
            if (ev.lote) { cola.push({ fecha: ev.fecha, restantes: ev.lote.piezas, lote: ev.lote }); continue; }
            let porAsignar = ev.venta.piezas;
            while (porAsignar > 0) {
                if (!cola.length) {                        // se vendió algo que nunca se compró aquí
                    huerfanas.push({ piezas: porAsignar, fechaVenta: ev.fecha });
                    break;
                }
                const lote    = cola[0];
                const tomadas = Math.min(porAsignar, lote.restantes);
                pares.push({
                    dias:       Math.round((ev.fecha - lote.fecha) / DIA_MS),
                    piezas:     tomadas,
                    fechaVenta: ev.fecha,
                });
                lote.restantes -= tomadas;
                porAsignar     -= tomadas;
                if (lote.restantes === 0) cola.shift();
            }
        }
        resultado.set(k, { pares, huerfanas, cola });
    }
    return resultado;
}

// Mediana ponderada por piezas, no por emparejamiento: la población son las
// fundas, así que un lote de 30 pesa 30 veces más que una pieza suelta. Se usa
// mediana y no promedio porque una sola venta de un lote viejo arrastraría el
// promedio de todo el tipo.
function medianaPonderada(pares) {
    const orden = [...pares].sort((a, b) => a.dias - b.dias);
    const total = orden.reduce((s, p) => s + p.piezas, 0);
    if (!total) return null;
    const mitad = total / 2;
    let acc = 0;
    for (let i = 0; i < orden.length; i++) {
        acc += orden[i].piezas;
        if (acc > mitad) return orden[i].dias;
        // Frontera exacta: la mediana queda entre esta observación y la siguiente
        if (acc === mitad) {
            const sig = orden[i + 1];
            return sig ? (orden[i].dias + sig.dias) / 2 : orden[i].dias;
        }
    }
    return orden[orden.length - 1].dias;
}

// ---------- Cálculos por vista ----------

// El emparejado corre sobre todo el historial (la cola de una variante depende de todas las
// ventas anteriores), y la ventana solo decide qué emparejamientos se reportan.
function calcularRotacion(emparejadoPorTipo, tipos, desde) {
    const enVentana = f => !desde || f >= desde;

    const filas = tipos.map(tipo => {
        const r           = emparejadoPorTipo.get(tipo) || { pares: [], huerfanas: [] };
        const pares       = r.pares.filter(p => enVentana(p.fechaVenta));
        const huerfanas   = r.huerfanas.filter(h => enVentana(h.fechaVenta));
        const emparejadas = pares.reduce((s, p) => s + p.piezas, 0);
        const sinRespaldo = huerfanas.reduce((s, h) => s + h.piezas, 0);
        const vendidas    = emparejadas + sinRespaldo;
        return {
            tipo, emparejadas, sinRespaldo, vendidas,
            cobertura:  vendidas ? emparejadas / vendidas : null,
            dias:       emparejadas ? medianaPonderada(pares) : null,
            suficiente: emparejadas >= PISO_ROTACION,
        };
    });

    // Rota más rápido primero. Los que no llegan al piso van al final: su mediana
    // no es comparable y no debe mezclarse con las que sí lo son.
    const solidas = filas.filter(f => f.suficiente).sort((a, b) => a.dias - b.dias || b.emparejadas - a.emparejadas);
    const flojas  = filas.filter(f => !f.suficiente).sort((a, b) => b.vendidas - a.vendidas || b.emparejadas - a.emparejadas);

    return {
        filas:       [...solidas, ...flojas],
        solidas,
        masRapido:   solidas[0] || null,
        emparejadas: filas.reduce((s, f) => s + f.emparejadas, 0),
        sinRespaldo: filas.reduce((s, f) => s + f.sinRespaldo, 0),
    };
}

// Lo que quedó sin emparejar, por modelo+variante. Este emparejado va con otra clave a
// propósito: el de la rotación junta modelos, así que una venta de un modelo
// podría consumir el lote de otro y el sobrante no diría nada del modelo.
function calcularParado(emparejadoPorModeloTipo, hoy) {
    const filas = [];
    for (const [clave, r] of emparejadoPorModeloTipo) {
        const vivos = r.cola.filter(l => l.restantes > 0);   // ya vienen en orden de compra
        if (!vivos.length) continue;
        const viejo = vivos[0];
        const dias  = Math.round((hoy - viejo.fecha) / DIA_MS);
        if (dias < DIAS_PARADO) continue;
        filas.push({
            modelo:   viejo.lote.modelo,
            conAlias: viejo.lote.conAlias,
            tipo:     viejo.lote.tipo,
            piezas:   viejo.restantes,
            total:    vivos.reduce((s, l) => s + l.restantes, 0),
            desde:    viejo.fecha,
            dias,
        });
    }
    return filas.sort((a, b) => b.dias - a.dias || b.total - a.total);
}

function calcularRankingFundas(lotesVentana, ventasVentana) {
    const total = ventasVentana.reduce((s, v) => s + v.piezas, 0);
    const map   = new Map();
    const fila  = d => {
        if (!map.has(d.modelo)) {
            map.set(d.modelo, { modelo: d.modelo, conAlias: d.conAlias, vendidas: 0, compradas: 0, porTipo: {}, ultima: null });
        }
        const f = map.get(d.modelo);
        f.conAlias = f.conAlias || d.conAlias;
        return f;
    };

    for (const l of lotesVentana) fila(l).compradas += l.piezas;
    for (const v of ventasVentana) {
        const f = fila(v);
        f.vendidas       += v.piezas;
        f.porTipo[v.tipo] = (f.porTipo[v.tipo] || 0) + v.piezas;
        if (!f.ultima || v.fecha > f.ultima) f.ultima = v.fecha;
    }

    const filas = [...map.values()].map(f => ({ ...f, pct: total ? f.vendidas / total * 100 : 0 }));
    return { filas, total, conPocoDato: filas.filter(f => f.vendidas && f.vendidas < PISO_MODELO).length };
}

function calcularFundas(lotes, ventas, desde, hoy) {
    const enVentana = f => !desde || f >= desde;
    const tipos     = ordenarTipos(new Set([...lotes, ...ventas].map(d => d.tipo)));
    return {
        tipos, lotes, ventas,
        lotesVentana:  lotes.filter(l => enVentana(l.fecha)),
        ventasVentana: ventas.filter(v => enVentana(v.fecha)),
        rotacion: calcularRotacion(emparejarVentasConCompras(lotes, ventas, d => d.tipo), tipos, desde),
        parado:   calcularParado(emparejarVentasConCompras(lotes, ventas, d => `${d.modelo}||${d.tipo}`), hoy),
        ranking:  calcularRankingFundas(lotes.filter(l => enVentana(l.fecha)), ventas.filter(v => enVentana(v.fecha))),
        tendenciaModelos: calcularTendenciaModelos(ventas, desde, hoy),
    };
}

// Cada variante marcada en el renglón es una funda, así que se cuenta una por
// una. Un renglón de «Azul, Rojo + Transparente» aporta 2 al conteo de colores
// y 1 al de tipos: son tres fundas distintas, no tres etiquetas de la misma.
function contarVariantes(lotes) {
    const por = {};
    for (const l of lotes) por[l.tipo] = (por[l.tipo] || 0) + l.piezas;
    return Object.entries(por)
        .map(([nombre, piezas]) => ({ nombre, piezas }))
        .sort((a, b) => b.piezas - a.piezas || a.nombre.localeCompare(b.nombre));
}

function renderVariantesFundas(vista) {
    const cont = document.getElementById('f-variantes-contenido');
    if (!cont) return;
    const filas = contarVariantes(vista.lotesVentana);

    if (!filas.length) {
        cont.innerHTML = '<p class="muted">Todavía no hay compras de fundas registradas en el periodo.</p>';
        return;
    }

    const total = filas.reduce((s, f) => s + f.piezas, 0);
    cont.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>Variante</th><th>Piezas</th><th>%</th></tr></thead>
                <tbody>
                    ${filas.map(f => `
                        <tr>
                            <td>${escapeHtml(f.nombre)}</td>
                            <td>${fmtNum(f.piezas)}</td>
                            <td>${(f.piezas / total * 100).toFixed(0)}%</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

// El peso del negocio no está en el total vendido, sino en **hacia dónde va**:
// un modelo que se empieza a pedir hay que surtirlo, y uno que se apaga hay que
// dejar de comprarlo antes de llenarse de fundas que nadie quiere. El ranking
// no distingue las dos cosas: un iPhone 13 que se muere puede seguir arriba por
// lo que vendió hace meses.
//
// Se parte el periodo a la mitad y se compara. Con poco volumen cualquier
// comparación es ruido, así que por debajo del piso no se clasifica: se dice
// que no alcanza, igual que en la rotación.
const PISO_TENDENCIA = 6;   // piezas en todo el periodo para poder opinar

function clasificarTendencia(reciente, anterior) {
    if (!anterior && reciente)  return { estado: 'nuevo',    etiqueta: 'Nuevo' };
    if (anterior && !reciente)  return { estado: 'apagado',  etiqueta: 'Se apagó' };
    const r = reciente / anterior;
    if (r >= 1.5)  return { estado: 'sube-fuerte', etiqueta: 'Subiendo fuerte' };
    if (r >= 1.15) return { estado: 'sube',        etiqueta: 'Subiendo' };
    if (r <= 0.5)  return { estado: 'cae-fuerte',  etiqueta: 'Cayendo fuerte' };
    if (r <= 0.85) return { estado: 'cae',         etiqueta: 'Bajando' };
    return { estado: 'estable', etiqueta: 'Estable' };
}

function calcularTendenciaModelos(ventas, desde, hoy) {
    // Sin periodo elegido se miran los últimos 180 días, para tener dos mitades
    // comparables en vez de arrastrar todo el historial contra nada.
    const inicio = desde ?? new Date(hoy.getTime() - 180 * DIA_MS);
    const corte  = new Date((inicio.getTime() + hoy.getTime()) / 2);
    const dias   = Math.round((hoy - corte) / DIA_MS);

    const por = new Map();
    for (const v of ventas) {
        if (v.fecha < inicio) continue;
        const k = v.modelo;
        if (!por.has(k)) por.set(k, { modelo: k, conAlias: v.conAlias, reciente: 0, anterior: 0 });
        por.get(k)[v.fecha >= corte ? 'reciente' : 'anterior'] += v.piezas;
    }

    const filas = [...por.values()].map(f => {
        const total = f.reciente + f.anterior;
        const suficiente = total >= PISO_TENDENCIA;
        const cambio = f.anterior ? (f.reciente - f.anterior) / f.anterior : null;
        return { ...f, total, suficiente, cambio, ...clasificarTendencia(f.reciente, f.anterior) };
    });

    // Primero lo accionable: lo que más cae y lo que más sube. Lo estable y lo
    // que no alcanza piso van al final, que es donde no hay que mirar.
    const peso = { 'cae-fuerte': 0, 'cae': 1, 'sube-fuerte': 2, 'sube': 3, 'nuevo': 4, 'apagado': 5, 'estable': 6 };
    filas.sort((a, b) =>
        (a.suficiente === b.suficiente ? 0 : a.suficiente ? -1 : 1)
        || peso[a.estado] - peso[b.estado]
        || b.total - a.total);

    return { filas, dias };
}

// ---------- Vistas ----------

const celdaModelo = f => `<td${f.conAlias ? '' : ' class="sin-alias"'}>${escapeHtml(f.modelo)}</td>`;

// A · Resumen
function renderResumenFundas(vista, diag, etiquetaPeriodo) {
    const vendidas  = vista.ventasVentana.reduce((s, v) => s + v.piezas, 0);
    const compradas = vista.lotesVentana.reduce((s, l) => s + l.piezas, 0);
    const invertido = vista.lotesVentana.reduce((s, l) => s + l.invertido, 0);
    const mejor     = [...vista.ranking.filas].sort((a, b) => b.vendidas - a.vendidas)[0];
    const rapido    = vista.rotacion.masRapido;
    const sinRespaldo = vista.rotacion.sinRespaldo;

    const poner = (id, valor, sub = '') => {
        document.getElementById(`f-stat-${id}`).textContent     = valor;
        document.getElementById(`f-stat-${id}-sub`).textContent = sub;
    };

    poner('vendidas', vendidas ? pzs(vendidas) : '—',
        sinRespaldo ? `${fmtNum(sinRespaldo)} sin compra que las respalde` : etiquetaPeriodo);
    poner('compradas', compradas ? pzs(compradas) : '—',
        compradas ? fmtDinero(invertido) : etiquetaPeriodo);
    poner('modelo', mejor && mejor.vendidas ? mejor.modelo : '—',
        mejor && mejor.vendidas
            ? `${pzs(mejor.vendidas)}${mejor.vendidas < PISO_MODELO ? ' · todavía es poco dato' : ''}`
            : 'sin ventas registradas');
    poner('tipo', rapido ? rapido.tipo : 'Acumulando datos',
        rapido
            ? `mediana de ${fmtNum(rapido.dias)} días · ${pzs(rapido.emparejadas)} emparejadas`
            : `ningún tipo llega a ${PISO_ROTACION} piezas emparejadas`);

    const avisos = [];
    if (diag.compras.pendientes) avisos.push(`${plural(diag.compras.pendientes, 'funda anotada', 'fundas anotadas')} en la lista sin palomear`);
    if (diag.compras.mixtas)     avisos.push(`${plural(diag.compras.mixtas, 'compra', 'compras')} con más de un tipo marcado, que no se pueden repartir por tipo`);
    if (diag.compras.sinTipo)    avisos.push(`${plural(diag.compras.sinTipo, 'compra', 'compras')} sin tipo de funda`);
    if (diag.ventas.sinTipo)     avisos.push(`${plural(diag.ventas.sinTipo, 'venta', 'ventas')} sin tipo de funda`);
    if (diag.ventas.anuladas)    avisos.push(`${plural(diag.ventas.anuladas, 'venta anulada', 'ventas anuladas')}`);
    const invalidas = diag.compras.invalidas + diag.ventas.invalidas;
    if (invalidas)               avisos.push(`${plural(invalidas, 'registro', 'registros')} sin cantidad o sin fecha usable`);

    document.getElementById('f-nota-resumen').textContent = avisos.length
        ? `Fuera de la cuenta: ${avisos.join(' · ')}.`
        : '';
}

// B · Ranking de modelos
let fundasRanking = [];
let fSortCol      = 'vendidas';
let fSortDir      = -1;

const F_COLUMNAS = [
    { col: 'modelo',    titulo: 'Modelo' },
    { col: 'vendidas',  titulo: 'Vendidas' },
    { col: 'compradas', titulo: 'Compradas' },
    { col: 'pct',       titulo: '% vendido' },
    { col: 'ultima',    titulo: 'Última venta' },
];

function renderRankingFundas(vista) {
    fundasRanking = vista.ranking.filas;
    const contenedor = document.getElementById('f-ranking-contenido');

    if (!vista.ventas.length) {
        contenedor.innerHTML = `<p class="muted">Todavía no hay ventas registradas${
            vista.lotes.length ? `, pero ya hay ${pzs(vista.lotes.reduce((s, l) => s + l.piezas, 0))} compradas. Registra las ventas y este ranking se llena solo.` : '.'}</p>`;
        return;
    }
    if (!fundasRanking.some(f => f.vendidas)) {
        contenedor.innerHTML = '<p class="muted">Ninguna venta cae en el periodo elegido. Prueba con un periodo más amplio.</p>';
        return;
    }

    contenedor.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table" id="f-tabla-ranking">
                <thead>
                    <tr>
                        ${F_COLUMNAS.map(c => `<th class="sortable" data-col="${c.col}">${c.titulo} ↕</th>`).join('')}
                        <th>Tipos vendidos</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
        <p class="chart-note">
            ${vista.ranking.conPocoDato
                ? `Con * los modelos de menos de ${PISO_MODELO} unidades vendidas: son el primer dato que llegó, no una tendencia. `
                : ''}«Compradas» cuenta solo lo comprado dentro del periodo, así que un modelo puede tener ventas y 0 compras si lo surtiste antes.
        </p>`;
    ordenarRankingFundas();
}

function ordenarRankingFundas() {
    const tbody = document.querySelector('#f-tabla-ranking tbody');
    if (!tbody) return;

    const valor = (f, col) => col === 'ultima' ? (f.ultima ? f.ultima.getTime() : 0) : f[col];
    const filas = [...fundasRanking].sort((a, b) => {
        const cmp = fSortCol === 'modelo'
            ? a.modelo.localeCompare(b.modelo, 'es')
            : valor(a, fSortCol) - valor(b, fSortCol);
        return cmp * fSortDir;
    });

    const desglose = porTipo => Object.entries(porTipo)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${escapeHtml(t)} ${fmtNum(n)}`)
        .join(' · ') || '<span class="cero">–</span>';

    tbody.innerHTML = filas.map(f => `
        <tr>
            <td${f.conAlias ? '' : ' class="sin-alias"'}>${escapeHtml(f.modelo)}${f.vendidas && f.vendidas < PISO_MODELO ? ' *' : ''}</td>
            <td><strong>${f.vendidas ? fmtNum(f.vendidas) : '<span class="cero">–</span>'}</strong></td>
            <td>${f.compradas ? fmtNum(f.compradas) : '<span class="cero">–</span>'}</td>
            <td>${f.pct.toFixed(1)}%</td>
            <td>${f.ultima ? fmtDia(f.ultima) : '<span class="cero">–</span>'}</td>
            <td>${desglose(f.porTipo)}</td>
        </tr>`).join('');
}

// C · Rotación por tipo
function renderRotacionFundas(vista) {
    const contenedor = document.getElementById('f-rotacion-contenido');
    const grafica    = document.getElementById('f-rotacion-grafica');
    const { filas, solidas } = vista.rotacion;

    if (!filas.length || !filas.some(f => f.vendidas)) {
        contenedor.innerHTML = `<p class="muted">${vista.lotes.length
            ? 'Sin ventas en el periodo no hay nada que emparejar: la rotación necesita los dos eventos, comprar y vender.'
            : 'Todavía no hay compras ni ventas de fundas registradas.'}</p>`;
        grafica.hidden = true;
        return;
    }

    const primeraFloja = filas.findIndex(f => !f.suficiente);

    const dias = f => f.suficiente ? `<strong>${fmtNum(f.dias)} d</strong>`
        : f.vendidas ? `<span class="cero">insuficiente (${fmtNum(f.emparejadas)} pzs)</span>`
        : '<span class="cero">sin ventas</span>';   // comprado y nunca vendido

    const renglon = f => `
        <tr>
            <td>${escapeHtml(f.tipo)}</td>
            <td>${dias(f)}</td>
            <td>${fmtNum(f.emparejadas)}</td>
            <td>${f.cobertura === null
                    ? '<span class="cero">–</span>'
                    : `${fmtNum(f.emparejadas)} de ${fmtNum(f.vendidas)} (${fmtPct(f.cobertura)})`}</td>
            <td>${f.sinRespaldo ? fmtNum(f.sinRespaldo) : '<span class="cero">–</span>'}</td>
        </tr>`;

    contenedor.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Tipo</th>
                        <th>Días para venderse</th>
                        <th>Pzs emparejadas</th>
                        <th>Cobertura</th>
                        <th>Sin respaldo</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas.map((f, i) => (i === primeraFloja && primeraFloja > 0
                        ? `<tr class="fila-total"><td colspan="5">Debajo de ${PISO_ROTACION} piezas emparejadas · no son comparables entre sí</td></tr>`
                        : '') + renglon(f)).join('')}
                </tbody>
            </table>
        </div>
        <p class="chart-note">
            <strong>Se supone que se vende primero lo que se compró primero</strong>, como en el
            aparador: el que llega nuevo se pone atrás y sale lo de adelante. Nadie anota qué funda
            concreta se llevó el cliente, así que para poder medir cuánto tardó en venderse hay que
            emparejar cada venta con alguna compra, y la más vieja es la apuesta razonable.
            <strong>Es una aproximación, no un rastreo pieza por pieza.</strong>
            El número es la mediana de días —no el promedio, que una sola venta de un lote viejo
            arrastraría—, y pesa por piezas: un lote de 30 cuenta 30 veces más que una suelta.
            Con menos de ${PISO_ROTACION} piezas emparejadas es ruido, no rotación, y esas filas no
            pueden ganar el destacado del resumen.
        </p>
        <p class="chart-note">
            «Sin respaldo» son ventas que ninguna compra del historial explica: stock de antes de este
            sistema, una compra que no se anotó, un nombre que no se reconoció como el mismo modelo, o una
            compra con varios tipos marcados. Si crece para un tipo, algo se está anotando distinto entre
            compra y venta.
        </p>`;

    // Solo las que cruzan el piso: meter las flojas en la misma gráfica las haría
    // ver comparables cuando no lo son.
    grafica.hidden = solidas.length < 2;
    if (!grafica.hidden) {
        pintarChart('f-chart-rotacion', {
            type: 'bar',
            data: {
                labels: solidas.map(f => f.tipo),
                datasets: [{
                    label: 'Días para venderse (mediana)',
                    data: solidas.map(f => f.dias),
                    backgroundColor: solidas.map(f => colorTipo(f.tipo, vista.tipos)),
                    borderWidth: 0,
                }],
            },
            options: {
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${fmtNum(ctx.raw)} días · ${pzs(solidas[ctx.dataIndex].emparejadas)} emparejadas` } },
                },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });
    }
}

// D · Qué lleva mucho sin venderse
function renderParadoFundas(vista) {
    const contenedor = document.getElementById('f-parado-contenido');

    if (!vista.lotes.length) {
        contenedor.innerHTML = '<p class="muted">Todavía no hay compras de fundas registradas.</p>';
        return;
    }

    const todas   = vista.parado;
    const filas   = todas.slice(0, MAX_FILAS_FUNDA);
    const ocultas = todas.length - filas.length;

    if (!filas.length) {
        contenedor.innerHTML = `<p class="muted">Ningún lote lleva más de ${DIAS_PARADO} días esperando venta.</p>`;
        return;
    }

    contenedor.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Modelo</th>
                        <th>Tipo</th>
                        <th>Esperando</th>
                        <th>Pzs del lote</th>
                        <th>Pzs sin vender</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas.map(f => `
                        <tr${f.dias >= DIAS_PARADO * 2 ? ' class="alerta"' : ''}>
                            ${celdaModelo(f)}
                            <td>${escapeHtml(f.tipo)}</td>
                            <td><strong>${fmtNum(f.dias)} d</strong></td>
                            <td>${fmtNum(f.piezas)}</td>
                            <td>${fmtNum(f.total)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p class="chart-note">
            El lote más viejo de cada modelo y variante que no se pudo emparejar con ninguna venta,
            con más de ${DIAS_PARADO} días desde que se compró. En rojo, los de más de ${DIAS_PARADO * 2} días.
            «Pzs del lote» son las de ese lote; «Pzs sin vender», todas las de ese modelo y tipo.
            ${ocultas ? `Hay ${ocultas} más con menos días. ` : ''}
            No usa el filtro de periodo: cualquier venta, de cuando sea, descuenta stock.
        </p>
        <p class="chart-note">
            Un modelo aquí puede querer decir que de verdad no se vende, o que se vendió y nadie lo anotó.
            Con estos datos no se puede distinguir un caso del otro.
        </p>`;
}

// E · Tendencia mensual
function renderTendenciaModelos(vista) {
    const cont = document.getElementById('f-tendencia-modelos-contenido');
    if (!cont) return;
    const { filas, dias } = vista.tendenciaModelos;

    if (!filas.length) {
        cont.innerHTML = '<p class="muted">Todavía no hay ventas registradas. Esta tabla es la que dice qué empezar a surtir y qué dejar de comprar, así que es la que más gana con cada venta que anotes.</p>';
        return;
    }

    const flecha = { 'sube-fuerte': '▲▲', 'sube': '▲', 'estable': '=', 'cae': '▼', 'cae-fuerte': '▼▼', 'nuevo': '★', 'apagado': '—' };
    const pct = f => f.cambio === null ? '—'
        : `${f.cambio > 0 ? '+' : ''}${Math.round(f.cambio * 100)}%`;

    cont.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Modelo</th>
                        <th>Últimos ${dias} días</th>
                        <th>${dias} días antes</th>
                        <th>Cambio</th>
                        <th>Va</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas.map(f => `
                        <tr${!f.suficiente ? ' class="insuficiente"' : f.estado.startsWith('cae') ? ' class="alerta"' : ''}>
                            ${celdaModelo(f)}
                            <td>${fmtNum(f.reciente)}</td>
                            <td>${fmtNum(f.anterior)}</td>
                            <td>${f.suficiente ? pct(f) : '—'}</td>
                            <td>${f.suficiente
                                ? `${flecha[f.estado]} ${f.etiqueta}`
                                : `<span class="muted">Insuficiente (${f.total} pz)</span>`}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p class="chart-note">
            Se parte el periodo a la mitad y se compara. Con menos de ${PISO_TENDENCIA} piezas en
            todo el periodo no se opina: dos ventas de diferencia no son una tendencia.
            <strong>Lo que cae va primero</strong>, porque es dinero a punto de quedarse parado.
        </p>`;
}

function renderTendenciaFundas(vista) {
    const aviso   = document.getElementById('f-tendencia-aviso');
    const grafica = document.getElementById('f-tendencia-grafica');
    const ventas  = vista.ventas;

    const meses = ventas.length ? rangoMeses(ventas) : [];
    if (meses.length < 2) {
        aviso.innerHTML = `<p class="muted">${ventas.length
            ? 'Acumulando datos: con un solo mes de ventas no hay tendencia que dibujar, y menos estacionalidad.'
            : 'Todavía no hay ventas registradas.'}</p>`;
        grafica.hidden = true;
        return;
    }

    aviso.innerHTML = '';
    grafica.hidden  = false;

    const porMesTipo = sumaPor(ventas, v => `${claveMes(v.fecha)}|${v.modelo}`, v => v.piezas);
    // Por modelo de teléfono, no por variante: lo que decide qué comprar es que
    // el iPhone 13 se esté apagando y el 16 despegando, no que el azul suba.
    // Solo los 6 con más ventas, o la gráfica se vuelve ilegible.
    const conVentas = [...new Set(ventas.map(v => v.modelo))]
        .map(m => ({ m, piezas: ventas.filter(v => v.modelo === m).reduce((s, v) => s + v.piezas, 0) }))
        .sort((a, b) => b.piezas - a.piezas)
        .slice(0, 6)
        .map(x => x.m);
    const labels     = meses.map(m => {
        const [anio, mes] = m.split('-').map(Number);
        return new Date(anio, mes - 1).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
    });

    pintarChart('f-chart-tendencia', {
        type: 'line',
        data: {
            labels,
            datasets: conVentas.map(tipo => ({
                label: tipo,
                data: meses.map(m => porMesTipo[`${m}|${tipo}`] || 0),
                borderColor: colorTipo(tipo, vista.tipos),
                backgroundColor: `${colorTipo(tipo, vista.tipos)}1a`,
                tension: 0.3,
                fill: true,
            })),
        },
        options: {
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${pzs(ctx.raw)}` } },
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
    });
}

// ---------- Init ----------

const ETIQUETAS_PERIODO = { 30: 'últimos 30 días', 90: 'últimos 90 días', 365: 'último año', 0: 'todo el historial' };

async function initFundas(aliasMap, locales) {
    const selLocal   = document.getElementById('filtro-local-fundas');
    const selPeriodo = document.getElementById('filtro-periodo-fundas');

    locales.forEach(l => {
        const op = document.createElement('option');
        op.value = l.id;
        op.textContent = l.nombre;
        selLocal.appendChild(op);
    });
    // Con un solo local no hay nada que separar
    document.getElementById('f-campo-local').hidden = locales.length < 2;

    const [compras, ventasCrudas] = await Promise.all([
        cargarColeccionFundas('fundas_compras'),
        cargarColeccionFundas('fundas_ventas'),
    ]);

    const error = compras.error || ventasCrudas.error;
    if (error) {
        const aviso = document.getElementById('f-aviso');
        aviso.textContent = error === 'permiso'
            ? 'Firestore no deja leer fundas_compras / fundas_ventas. Faltan las reglas de esas dos colecciones: hay que publicarlas en la consola de Firebase.'
            : 'No se pudieron leer las fundas de Firestore. Revisa la consola del navegador.';
        aviso.hidden = false;
    }

    function pintar() {
        const local = selLocal.value;
        const dias  = Number(selPeriodo.value) || 0;
        const hoy   = new Date();
        const desde = dias > 0 ? new Date(hoy.getTime() - dias * DIA_MS) : null;

        // Se filtra antes de limpiar, para que los contadores de lo que quedó
        // fuera sean también los de ese local y no los de todos
        const filtrar = docs => local ? docs.filter(d => localDe(d) === local) : docs;
        const { lotes,  diag: diagCompras } = prepararComprasFundas(filtrar(compras.docs), aliasMap);
        const { ventas, diag: diagVentas }  = prepararVentasFundas(filtrar(ventasCrudas.docs), aliasMap);

        const vista = calcularFundas(lotes, ventas, desde, hoy);

        renderResumenFundas(vista, { compras: diagCompras, ventas: diagVentas }, ETIQUETAS_PERIODO[dias] || '');
        renderRankingFundas(vista);
        renderVariantesFundas(vista);
        renderRotacionFundas(vista);
        renderParadoFundas(vista);
        renderTendenciaModelos(vista);
        renderTendenciaFundas(vista);
    }

    selLocal.addEventListener('change', pintar);
    selPeriodo.addEventListener('change', pintar);

    // Un solo listener para ordenar: volver a colgarlo en cada pintada acabaría
    // invirtiendo el orden varias veces por clic.
    document.getElementById('f-ranking-contenido').addEventListener('click', e => {
        const th = e.target.closest('th.sortable');
        if (!th) return;
        const col = th.dataset.col;
        if (fSortCol === col) fSortDir *= -1;
        else { fSortCol = col; fSortDir = col === 'modelo' ? 1 : -1; }
        ordenarRankingFundas();
    });

    pintar();
}


// ========== Pestañas ==========

const SUBTITULOS = {
    micas:    'Historial de compras · Micas',
    fundas:   'Compras y ventas · Fundas',
    hidrogel: 'Pedidos a KASR · Hidrogel',
};

function mostrarPestana(nombre) {
    if (!SUBTITULOS[nombre]) nombre = 'micas';
    document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === nombre));
    document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== `panel-${nombre}`; });
    document.querySelector('.header-subtitle').textContent = SUBTITULOS[nombre];
}

document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => { location.hash = tab.dataset.tab; });
});
window.addEventListener('hashchange', () => mostrarPestana(location.hash.slice(1)));
mostrarPestana(location.hash.slice(1));

// ========== Init ==========

async function initMicas(aliasMap, locales) {
    const crudos = await cargarDatos();

    const selector = document.getElementById('filtro-local');
    locales.forEach(l => {
        const op = document.createElement('option');
        op.value = l.id;
        op.textContent = l.nombre;
        selector.appendChild(op);
    });
    // Con un solo local no hay nada que separar
    selector.closest('.filtro-local').hidden = locales.length < 2;

    const vacio = mensaje => {
        document.querySelector('.stat-grid').innerHTML =
            `<p class="muted" style="grid-column:1/-1">${mensaje}</p>`;
        document.getElementById('proyecciones-contenido').innerHTML = '<p class="muted">Sin datos aún.</p>';
    };

    let docsActuales = [];

    async function pintar(local) {
        const filtrados = local ? crudos.filter(d => localDe(d) === local) : crudos;
        const { docs, sinTipo, pendientes: sinPalomear } = prepararDocs(filtrados, aliasMap);
        docsActuales = docs;

        if (docs.length === 0) {
            vacio(local
                ? 'Este local todavía no tiene compras registradas.'
                : 'Aún no hay compras registradas. Agrega micas desde la lista principal.');
            document.getElementById('reponer-contenido').innerHTML = '';
            return;
        }

        const pendientes = await cargarPendientes(aliasMap, local);
        renderDashboard(docs, sinTipo, sinPalomear);
        renderRanking(docs);
        renderDonut(docs);
        renderTendencia(docs);
        renderPrevision(calcularPrevision(docs, pendientes));
    }

    await pintar('');

    selector.addEventListener('change', async () => {
        document.getElementById('reponer-contenido').innerHTML = '';
        await pintar(selector.value);
    });

    // El botón vuelve a leer la lista de compras, que cambia mientras se arma el pedido
    const boton = document.getElementById('btn-reponer');
    boton.addEventListener('click', async () => {
        boton.disabled = true;
        boton.textContent = 'Calculando…';
        const pendientes = await cargarPendientes(aliasMap, selector.value);
        renderReposicion(calcularReposicion(docsActuales, pendientes));
        boton.disabled = false;
        boton.textContent = 'Actualizar';
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    // Los alias y los locales los ocupan las dos pestañas. De ahí cada una va
    // por su lado: si la de fundas truena, micas sigue pintando igual.
    const [aliasMap, locales] = await Promise.all([cargarAliases(), cargarLocales()]);
    initMicas(aliasMap, locales).catch(err => console.error('Error cargando micas:', err));
    initFundas(aliasMap, locales).catch(err => console.error('Error cargando fundas:', err));
});
