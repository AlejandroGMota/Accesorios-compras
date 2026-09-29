// Lista del tianguis. Es un local más (`tianguis`), pero con su URL de siempre
// y con precios y totales a la vista. La lógica vive en lista-core.js, que
// comparte con la lista de cada local.

const LOCAL_TIANGUIS = 'tianguis';

window.addEventListener('DOMContentLoaded', () => {
    initLista({ local: LOCAL_TIANGUIS, conPrecios: true });
});
