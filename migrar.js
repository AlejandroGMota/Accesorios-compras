// Migración de una sola vez: del documento único `app/productos` (un array de
// productos) a la colección `items` (un documento por producto).
//
// El array se guardaba entero con `set()`, así que dos personas escribiendo a
// la vez se pisaban. Con un documento por producto eso desaparece, y además
// cada producto queda con el `local` al que pertenece.

const PRODUCTOS_REF = db.collection('app').doc('productos');
const ITEMS_REF     = db.collection('items');
const LOCALES_REF   = db.collection('locales');
const MICAS_REF     = db.collection('micas_compras');
const MIGRACION_REF = db.collection('app').doc('migracion_locales');

const TIANGUIS_ID = 'tianguis';
const LOTE_MAX    = 400;

const salida = document.getElementById('salida');
const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function log(linea, clase = '') {
    const p = document.createElement('p');
    p.className = clase || 'chart-note';
    p.innerHTML = linea;
    salida.appendChild(p);
}

function limpiar() { salida.innerHTML = ''; }

// ========== Qué hay que hacer ==========
async function inspeccionar() {
    const [viejo, yaMigrados, hecha] = await Promise.all([
        PRODUCTOS_REF.get(),
        ITEMS_REF.where('local', '==', TIANGUIS_ID).get(),
        MIGRACION_REF.get(),
    ]);

    const productos = viejo.exists ? (viejo.data().items ?? []) : [];

    // Los registros sin `local` son de antes de que hubiera locales
    const micas = await MICAS_REF.get();
    const sinLocal = micas.docs.filter(d => !d.data().local);

    return {
        productos,
        yaEnItems: yaMigrados.size,
        micasSinLocal: sinLocal,
        yaHecha: hecha.exists,
    };
}

async function revisar() {
    limpiar();
    log('Leyendo…');
    let estado;
    try {
        estado = await inspeccionar();
    } catch (err) {
        limpiar();
        log(`No se pudo leer: ${escapeHtml(err.message)}`, 'muted');
        return null;
    }

    limpiar();
    log(`<strong>${estado.productos.length}</strong> productos en el documento viejo <code>app/productos</code>.`);
    log(`<strong>${estado.yaEnItems}</strong> productos ya en <code>items</code> con local «tianguis».`);
    log(`<strong>${estado.micasSinLocal.length}</strong> registros de <code>micas_compras</code> sin campo <code>local</code>.`);

    if (estado.yaHecha)
        log('⚠️ Ya se corrió la migración antes. Volver a correrla duplicaría los productos.', 'muted');
    if (estado.yaEnItems && !estado.yaHecha)
        log('⚠️ Ya hay productos en <code>items</code>. Revisa antes de migrar.', 'muted');

    document.getElementById('migrarBtn').disabled = estado.yaHecha;
    return estado;
}

// ========== Migrar ==========
async function migrar() {
    const estado = await revisar();
    if (!estado || estado.yaHecha) return;

    const resumen = `Se van a crear ${estado.productos.length} productos y a marcar ${estado.micasSinLocal.length} registros de Analytics. El documento viejo no se toca. ¿Continuar?`;
    if (!confirm(resumen)) return;

    document.getElementById('migrarBtn').disabled = true;
    document.getElementById('revisarBtn').disabled = true;

    try {
        // 1· El tianguis como local
        await LOCALES_REF.doc(TIANGUIS_ID).set(
            { nombre: 'Tianguis', activo: true, creado: Date.now() }, { merge: true });
        log('✓ Local «Tianguis» creado.');

        // 2· Cada producto del array a su propio documento
        const base = Date.now();
        await porLotes(estado.productos, (lote, producto, i) => {
            lote.set(ITEMS_REF.doc(), {
                name:        producto.name ?? '',
                price:       producto.price ?? 0,
                quantity:    producto.quantity ?? 0,
                category:    producto.category ?? 'Otros',
                type:        producto.type ?? '',
                colors:      producto.colors ?? [],
                fundaTypes:  producto.fundaTypes ?? [],
                comprada:    producto.comprada ?? null,
                analyticsId: producto.analyticsId ?? '',
                local:       TIANGUIS_ID,
                creado:      base + i,   // conserva el orden que tenían en el array
            });
        });
        log(`✓ ${estado.productos.length} productos migrados a <code>items</code>.`);

        // 3· Analytics: todo lo viejo es del tianguis
        await porLotes(estado.micasSinLocal, (lote, doc) => {
            lote.update(doc.ref, { local: TIANGUIS_ID });
        });
        log(`✓ ${estado.micasSinLocal.length} registros de Analytics marcados como «tianguis».`);

        // 4· Queda constancia para no correrla dos veces
        await MIGRACION_REF.set({
            hecha: Date.now(),
            productos: estado.productos.length,
            micas: estado.micasSinLocal.length,
        });

        log('<strong>Listo.</strong> Abre la <a href="index.html">lista del tianguis</a> y revisa que esté todo.', 'chart-note');
    } catch (err) {
        console.error('La migración falló:', err);
        log(`✕ Falló: ${escapeHtml(err.message)}. El documento viejo sigue intacto.`, 'muted');
        document.getElementById('revisarBtn').disabled = false;
    }
}

// Firestore no acepta lotes de más de 500 escrituras
async function porLotes(elementos, agregar) {
    for (let i = 0; i < elementos.length; i += LOTE_MAX) {
        const trozo = elementos.slice(i, i + LOTE_MAX);
        const lote  = db.batch();
        trozo.forEach((el, j) => agregar(lote, el, i + j));
        await lote.commit();
    }
}

// Crear `locales/tianguis` pide sesión con las reglas nuevas, así que la
// migración entera va detrás del login igual que el admin
protegerPagina().then(() => {
    document.getElementById('revisarBtn').addEventListener('click', revisar);
    document.getElementById('migrarBtn').addEventListener('click', migrar);
});
