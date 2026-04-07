// ========== Carga de aliases ==========

async function cargarAliases() {
    try {
        const resp = await fetch('./aliases.csv');
        const text = await resp.text();
        const map = new Map();
        text.trim().split('\n').slice(1).forEach(linea => {
            const [alias, nombre] = linea.split(',').map(s => s.trim());
            if (alias && nombre) map.set(alias.toLowerCase(), nombre);
        });
        return map;
    } catch (e) {
        console.warn('aliases.csv no disponible:', e);
        return new Map();
    }
}

function normalizarNombre(nombreOriginal, aliasMap) {
    const clave = (nombreOriginal || '').trim().toLowerCase();
    return aliasMap.get(clave) ?? (nombreOriginal || '').trim();
}

// ========== Carga de datos de Firestore ==========

async function cargarDatos() {
    const snap = await db.collection('micas_compras').get();
    return snap.docs.map(d => d.data());
}

// ========== Dashboard: resumen ==========

function renderDashboard(docs) {
    const totalUds = docs.reduce((s, d) => s + (d.cantidad || 0), 0);
    const totalInv = docs.reduce((s, d) => s + (d.precio || 0) * (d.cantidad || 0), 0);

    // Modelo más vendido
    const porModelo = {};
    docs.forEach(d => { porModelo[d.nombre] = (porModelo[d.nombre] || 0) + (d.cantidad || 0); });
    const mejorModelo = Object.entries(porModelo).sort((a, b) => b[1] - a[1])[0];

    // Tipo más vendido
    const porTipo = {};
    docs.forEach(d => { porTipo[d.tipo] = (porTipo[d.tipo] || 0) + (d.cantidad || 0); });
    const mejorTipo = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0];

    document.getElementById('stat-total').textContent   = totalUds.toLocaleString('es-MX');
    document.getElementById('stat-invertido').textContent = `$${totalInv.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-modelo').textContent  = mejorModelo ? `${mejorModelo[0]} (${mejorModelo[1]} uds)` : '—';
    document.getElementById('stat-tipo').textContent    = mejorTipo   ? `${mejorTipo[0]} (${mejorTipo[1]} uds)` : '—';
}

// ========== Ranking por modelo ==========

let rankingData  = [];
let sortCol      = 'total';
let sortDir      = -1; // -1 = desc, 1 = asc

function buildRankingData(docs) {
    const totalGlobal = docs.reduce((s, d) => s + (d.cantidad || 0), 0);
    const map = {};

    docs.forEach(d => {
        if (!map[d.nombre]) map[d.nombre] = { nombre: d.nombre, '9D': 0, '9H': 0, Privacidad: 0 };
        map[d.nombre][d.tipo] = (map[d.nombre][d.tipo] || 0) + (d.cantidad || 0);
    });

    return Object.values(map).map(row => ({
        ...row,
        total: row['9D'] + row['9H'] + row.Privacidad,
        pct:   totalGlobal > 0 ? ((row['9D'] + row['9H'] + row.Privacidad) / totalGlobal * 100).toFixed(1) : '0.0',
    }));
}

function renderRanking(docs) {
    rankingData = buildRankingData(docs);
    sortAndRenderRanking();

    document.querySelectorAll('#tabla-ranking th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) sortDir *= -1;
            else { sortCol = col; sortDir = -1; }
            sortAndRenderRanking();
        });
    });
}

function sortAndRenderRanking() {
    const sorted = [...rankingData].sort((a, b) => {
        const av = sortCol === 'nombre' ? a[sortCol] : parseFloat(a[sortCol]);
        const bv = sortCol === 'nombre' ? b[sortCol] : parseFloat(b[sortCol]);
        if (av < bv) return sortDir;
        if (av > bv) return -sortDir;
        return 0;
    });

    const tbody = document.getElementById('tbody-ranking');
    tbody.innerHTML = sorted.map(row => `
        <tr>
            <td>${row.nombre}</td>
            <td>${row['9D']}</td>
            <td>${row['9H']}</td>
            <td>${row['Privacidad']}</td>
            <td><strong>${row.total}</strong></td>
            <td>${row.pct}%</td>
        </tr>
    `).join('');
}

// ========== Gráfica de dona: distribución por tipo ==========

function renderDonut(docs) {
    const total9D        = docs.filter(d => d.tipo === '9D').reduce((s, d) => s + (d.cantidad || 0), 0);
    const total9H        = docs.filter(d => d.tipo === '9H').reduce((s, d) => s + (d.cantidad || 0), 0);
    const totalPrivacidad = docs.filter(d => d.tipo === 'Privacidad').reduce((s, d) => s + (d.cantidad || 0), 0);

    new Chart(document.getElementById('chart-donut'), {
        type: 'doughnut',
        data: {
            labels: ['9D', '9H', 'Privacidad'],
            datasets: [{
                data: [total9D, total9H, totalPrivacidad],
                backgroundColor: ['#6c63ff', '#48bfe3', '#f4a261'],
                borderWidth: 0,
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.raw} uds`
                    }
                }
            }
        }
    });
}

// ========== Gráfica de líneas: tendencia mensual ==========

function renderTendencia(docs) {
    // Obtener meses únicos con datos, ordenados
    const mesesSet = new Set(docs.map(d => `${d.año}-${String(d.mes).padStart(2, '0')}`));
    const meses = [...mesesSet].sort();

    const serie = (tipo) => meses.map(m => {
        const [anio, mes] = m.split('-').map(Number);
        return docs
            .filter(d => d.año === anio && d.mes === mes && d.tipo === tipo)
            .reduce((s, d) => s + (d.cantidad || 0), 0);
    });

    // Formato de etiquetas legible: "Apr 2026"
    const labels = meses.map(m => {
        const [anio, mes] = m.split('-').map(Number);
        return new Date(anio, mes - 1).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
    });

    new Chart(document.getElementById('chart-lineas'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '9D',
                    data: serie('9D'),
                    borderColor: '#6c63ff',
                    backgroundColor: 'rgba(108,99,255,0.1)',
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: '9H',
                    data: serie('9H'),
                    borderColor: '#48bfe3',
                    backgroundColor: 'rgba(72,191,227,0.1)',
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: 'Privacidad',
                    data: serie('Privacidad'),
                    borderColor: '#f4a261',
                    backgroundColor: 'rgba(244,162,97,0.1)',
                    tension: 0.3,
                    fill: true,
                },
            ]
        },
        options: {
            spanGaps: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// ========== Proyecciones SMA(2) ==========

function calcularProyecciones(docs) {
    const meses = [...new Set(docs.map(d => `${d.año}-${String(d.mes).padStart(2, '0')}`))]
        .sort();

    if (meses.length < 2) return null;

    const ultimosDos = meses.slice(-2);

    // Mes siguiente (1-based): si enero actual → febrero siguiente = 2
    const mesProximo = (new Date().getMonth() + 2) % 12 || 12;
    const factorEstacional = mesProximo === 12 ? 1.3 : 1.0;

    const agrupado = {};
    for (const doc of docs) {
        const claveMes = `${doc.año}-${String(doc.mes).padStart(2, '0')}`;
        if (!ultimosDos.includes(claveMes)) continue;
        const clave = `${doc.nombre}||${doc.tipo}`;
        agrupado[clave] = (agrupado[clave] || 0) + (doc.cantidad || 0);
    }

    return Object.entries(agrupado)
        .map(([clave, suma]) => {
            const [nombre, tipo] = clave.split('||');
            const proyeccion = Math.ceil((suma / 2) * factorEstacional);
            return { nombre, tipo, proyeccion };
        })
        .sort((a, b) => b.proyeccion - a.proyeccion)
        .slice(0, 5);
}

function renderProyecciones(proyecciones) {
    const contenedor = document.getElementById('proyecciones-contenido');
    if (!proyecciones) {
        contenedor.innerHTML = '<p class="muted">Acumulando datos… Las proyecciones estarán disponibles con al menos 2 meses de historial.</p>';
        return;
    }
    const mesProximo = new Date(new Date().getFullYear(), new Date().getMonth() + 1)
        .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    contenedor.innerHTML = `
        <p class="chart-note">Basado en el promedio de los últimos 2 meses. Proyección para <strong>${mesProximo}</strong>:</p>
        ${proyecciones.map(p => `
            <div class="recomendacion">
                Comprar <strong>~${p.proyeccion} uds</strong> de <strong>${p.nombre}</strong>
                <span class="recomendacion-tipo">${p.tipo}</span>
            </div>
        `).join('')}
    `;
}

// ========== Init ==========

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const [docs] = await Promise.all([cargarDatos(), cargarAliases()]);

        if (docs.length === 0) {
            document.querySelector('.stat-grid').innerHTML =
                '<p class="muted" style="grid-column:1/-1">Aún no hay compras registradas. Agrega micas desde la lista principal.</p>';
            document.getElementById('proyecciones-contenido').innerHTML =
                '<p class="muted">Sin datos aún.</p>';
            return;
        }

        renderDashboard(docs);
        renderRanking(docs);
        renderDonut(docs);
        renderTendencia(docs);
        renderProyecciones(calcularProyecciones(docs));
    } catch (err) {
        console.error('Error cargando analytics:', err);
    }
});
