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

function renderDonut(docs) {
    const pzsPorTipo = sumaPor(docs, d => d.tipo);

    new Chart(document.getElementById('chart-donut'), {
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

    new Chart(document.getElementById('chart-lineas'), {
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
async function cargarPendientes(aliasMap) {
    const pendientes = new Map();
    try {
        const doc   = await db.collection('app').doc('productos').get();
        const items = doc.exists ? (doc.data().items || []) : [];
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

// ========== Pestañas ==========

const SUBTITULOS = {
    micas:    'Historial de compras · Micas',
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

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const [crudos, aliasMap] = await Promise.all([cargarDatos(), cargarAliases()]);
        const { docs, sinTipo, pendientes: sinPalomear } = prepararDocs(crudos, aliasMap);

        if (docs.length === 0) {
            document.querySelector('.stat-grid').innerHTML =
                '<p class="muted" style="grid-column:1/-1">Aún no hay compras registradas. Agrega micas desde la lista principal.</p>';
            document.getElementById('proyecciones-contenido').innerHTML =
                '<p class="muted">Sin datos aún.</p>';
            return;
        }

        const pendientes = await cargarPendientes(aliasMap);

        renderDashboard(docs, sinTipo, sinPalomear);
        renderRanking(docs);
        renderDonut(docs);
        renderTendencia(docs);
        renderPrevision(calcularPrevision(docs, pendientes));

        // El botón vuelve a leer la lista de compras, que cambia mientras se arma el pedido
        const boton = document.getElementById('btn-reponer');
        boton.addEventListener('click', async () => {
            boton.disabled = true;
            boton.textContent = 'Calculando…';
            renderReposicion(calcularReposicion(docs, await cargarPendientes(aliasMap)));
            boton.disabled = false;
            boton.textContent = 'Actualizar';
        });
    } catch (err) {
        console.error('Error cargando analytics:', err);
    }
});
