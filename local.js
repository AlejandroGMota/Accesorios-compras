// Lista de un local. El local viene en la URL: local.html?id=<idDelLocal>
// Misma pantalla que el tianguis pero sin precios ni totales: aquí solo se
// anota lo que hace falta, el precio lo pone el dueño al comprar.

function mostrarAviso(html) {
    const aviso = document.getElementById('avisoLocal');
    aviso.innerHTML = html;
    aviso.hidden = false;
    // Sin local válido no hay nada que anotar
    document.querySelectorAll('.container > .card:not(#avisoLocal), .lista-toolbar, .category-header')
        .forEach(el => el.hidden = true);
}

window.addEventListener('DOMContentLoaded', async () => {
    const id = new URLSearchParams(location.search).get('id');

    if (!id) {
        mostrarAviso('<h2>Falta el local</h2><p class="muted">Este enlace no dice de qué local es la lista. Ábrela desde <a href="locales.html">Locales</a>.</p>');
        return;
    }

    let local;
    try {
        const doc = await LOCALES_REF.doc(id).get();
        if (!doc.exists) {
            mostrarAviso('<h2>Local no encontrado</h2><p class="muted">Este local ya no existe. Revisa la lista en <a href="locales.html">Locales</a>.</p>');
            return;
        }
        local = doc.data();
    } catch (err) {
        console.error('No se pudo cargar el local:', err);
        mostrarAviso('<h2>No se pudo cargar</h2><p class="muted">Revisa tu conexión y vuelve a intentar.</p>');
        return;
    }

    document.getElementById('nombreLocal').textContent = local.nombre;
    document.title = `${local.nombre} · Lista`;

    if (local.activo === false) {
        const aviso = document.getElementById('avisoLocal');
        aviso.innerHTML = '<p class="muted">Este local está marcado como inactivo. Lo que anotes aquí no aparecerá en la lista global.</p>';
        aviso.hidden = false;
    }

    initLista({ local: id, conPrecios: false });
});
