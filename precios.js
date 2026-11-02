// Precios de proveedor, compartidos por las listas (lista-core.js) y el panel
// de admin. Se cargan antes que cualquiera de los dos.

// Precios de proveedor. Las micas van por pieza: la 9D y la 9H se compran por
// caja de PZS_POR_CAJA y su precio de caja sale de multiplicar. Los cambia el
// admin en admin.html (documento `config/precios`); estos valores solo se usan
// mientras ese documento carga o si todavía no existe.
const PZS_POR_CAJA = 10;
const PRECIOS_BASE = {
    micas:    { '9D': 5, '9H': 3, 'Privacidad': 13 },
    hidrogel: { privacidad: 330, otros: 180 },
};
let PRECIOS = PRECIOS_BASE;

const micaPorCaja = tipo => tipo === '9D' || tipo === '9H';

function precioMica(tipo) {
    const pieza = PRECIOS.micas[tipo];
    if (pieza == null) return 0;
    return micaPorCaja(tipo) ? pieza * PZS_POR_CAJA : pieza;
}

const precioHidrogel = tipo =>
    tipo === 'privacidad' ? PRECIOS.hidrogel.privacidad : PRECIOS.hidrogel.otros;

// Lo que falte en el documento se completa con la base, para que un campo
// borrado a mano en la consola no deje una mica en $0
function aplicarPrecios(datos = {}) {
    PRECIOS = {
        micas:    { ...PRECIOS_BASE.micas,    ...datos.micas },
        hidrogel: { ...PRECIOS_BASE.hidrogel, ...datos.hidrogel },
    };
}

function escucharPrecios() {
    db.collection('config').doc('precios').onSnapshot(
        doc => aplicarPrecios(doc.exists ? doc.data() : {}),
        err => console.warn('No se pudieron leer los precios; se usan los de base:', err));
}
