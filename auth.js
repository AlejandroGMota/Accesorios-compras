// Candado de las páginas de admin y de la lista global.
//
// Ojo con qué protege y qué no: las listas de los locales escriben sin cuenta,
// así que `items` sigue abierto en las reglas. Este login esconde la pantalla,
// no los datos. Lo que sí queda cerrado de verdad es crear y borrar locales:
// eso las reglas solo lo permiten con esta sesión.

const PLANTILLA_LOGIN = `
<div id="authOverlay" class="auth-overlay">
    <form class="card auth-card" id="authForm">
        <h2>Entrar</h2>
        <p class="chart-note">Esta pantalla es solo para ti. Las listas de los locales no piden cuenta.</p>

        <label for="authEmail">Correo</label>
        <input type="email" id="authEmail" autocomplete="username" required>

        <label for="authPass">Contraseña</label>
        <input type="password" id="authPass" autocomplete="current-password" required>

        <p id="authError" class="auth-error" hidden></p>
        <button type="submit" class="btn-primary" id="authBtn">Entrar</button>
    </form>
</div>`;

const ERRORES = {
    'auth/invalid-email':         'Ese correo no tiene buena forma.',
    'auth/invalid-credential':    'Correo o contraseña incorrectos.',
    'auth/wrong-password':        'Correo o contraseña incorrectos.',
    'auth/user-not-found':        'Correo o contraseña incorrectos.',
    'auth/too-many-requests':     'Demasiados intentos. Espera un momento.',
    'auth/network-request-failed':'Sin conexión. Revisa tu internet.',
    'auth/operation-not-allowed': 'Falta activar Email/Password en la consola de Firebase.',
};

function mensajeDeError(codigo = '') {
    // Este trae el dominio dentro del propio código, así que no cabe en la tabla.
    // Sale al abrir desde localhost: la llave de API solo acepta el dominio real.
    if (codigo.startsWith('auth/requests-from-referer'))
        return 'Este dominio no está autorizado para iniciar sesión. Pruébalo en accesories.alejandrogmota.com, o agrega localhost a los dominios permitidos de la llave de API.';
    return ERRORES[codigo] ?? 'No se pudo entrar. Intenta de nuevo.';
}

// Deja la página tapada hasta que haya sesión. Devuelve el usuario.
function protegerPagina() {
    return new Promise(resolve => {
        document.body.insertAdjacentHTML('beforeend', PLANTILLA_LOGIN);
        const overlay = document.getElementById('authOverlay');
        const form    = document.getElementById('authForm');
        const error   = document.getElementById('authError');
        const boton   = document.getElementById('authBtn');

        const fallar = msg => {
            error.textContent = msg;
            error.hidden = false;
        };

        form.addEventListener('submit', async ev => {
            ev.preventDefault();
            error.hidden = true;
            boton.disabled = true;
            boton.textContent = 'Entrando…';
            try {
                await firebase.auth().signInWithEmailAndPassword(
                    document.getElementById('authEmail').value.trim(),
                    document.getElementById('authPass').value);
            } catch (err) {
                console.error('Login fallido:', err.code, err.message);
                fallar(mensajeDeError(err.code));
            }
            boton.disabled = false;
            boton.textContent = 'Entrar';
        });

        firebase.auth().onAuthStateChanged(async user => {
            if (!user) {
                overlay.hidden = false;
                return;
            }
            // Tener sesión no basta: quien administra son los UID que estén en
            // la colección `admins`. Se comprueba aquí para avisar en pantalla
            // en vez de dejar que fallen los guardados uno por uno.
            if (!await esAdmin(user)) {
                overlay.hidden = false;
                fallar('Esta cuenta no tiene permiso de administrador. Falta el documento admins/' + user.uid + ' en Firestore.');
                await firebase.auth().signOut();
                return;
            }
            overlay.hidden = true;
            agregarBotonSalir(user);
            resolve(user);
        });
    });
}

async function esAdmin(user) {
    try {
        return (await firebase.firestore().collection('admins').doc(user.uid).get()).exists;
    } catch (err) {
        console.error('No se pudo comprobar si la cuenta es admin:', err);
        return false;
    }
}

function agregarBotonSalir(user) {
    if (document.getElementById('authSalir')) return;
    const nav = document.querySelector('.header-nav');
    if (!nav) return;
    const boton = document.createElement('button');
    boton.id = 'authSalir';
    boton.className = 'btn-mini';
    boton.textContent = 'Salir';
    boton.title = user.email;
    boton.addEventListener('click', () => firebase.auth().signOut().then(() => location.reload()));
    nav.appendChild(boton);
}
