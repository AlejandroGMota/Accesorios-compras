// Service worker de las listas: que la app abra sin señal (el tianguis no tiene).
//
// Solo guarda la «cáscara»: el HTML, los .js, el .css, los íconos, aliases.csv
// y el SDK de Firebase. Los datos NO pasan por aquí: los guarda Firestore en el
// teléfono (enablePersistence) y ahí mismo hace la cola de lo que falta subir.
// Las peticiones a Firestore, App Check y reCAPTCHA no se tocan.
//
// Estrategia:
//   - Páginas: primero la red (para que un deploy llegue en cuanto hay señal) y,
//     si no hay, la copia guardada.
//   - Lo demás: la copia guardada al instante y, por detrás, se refresca.
//     El deploy le pone ?v=<sha> a cada .js y .css, así que una versión nueva
//     es otra URL y nunca se mezcla con la vieja.

const CACHE = 'listas-v1';

// Páginas que tienen que abrir sin señal. Al instalar se baja cada una y todo
// lo que pide, con la URL exacta (?v=…) que trae el HTML publicado.
const PAGINAS = ['./', './index.html', './local.html'];
const EXTRA   = ['./analytics/aliases.csv', './manifest.webmanifest'];

// De fuera solo el SDK de Firebase y las fuentes
const ORIGENES_EXTERNOS = ['https://www.gstatic.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

const ESPERA_RED_MS = 3000;
const esperar = ms => new Promise(resolve => setTimeout(() => resolve(null), ms));

const esCacheable = url =>
    url.origin === self.location.origin
        ? !url.pathname.endsWith('/sw.js')
        : ORIGENES_EXTERNOS.includes(url.origin) && !url.pathname.includes('recaptcha');

// src="…" y href="…" de un HTML que se pueden guardar
function recursosDe(html, base) {
    const urls = new Set();
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const ruta = m[1];
        if (/^(data:|mailto:|#|javascript:)/.test(ruta)) continue;
        const url = new URL(ruta, base);
        // Solo recursos, no las ligas a otras páginas
        const esFuente = url.origin === 'https://fonts.googleapis.com' && url.pathname !== '/';
        if (!/\.(js|css|png|svg|webmanifest|csv)$/.test(url.pathname) && !esFuente) continue;
        if (esCacheable(url)) urls.add(url.href);
    }
    return [...urls];
}

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        const recursos = new Set(EXTRA.map(r => new URL(r, self.location).href));
        for (const pagina of PAGINAS) {
            const url = new URL(pagina, self.location).href;
            try {
                const resp = await fetch(url, { cache: 'no-cache' });
                if (!resp.ok) continue;
                await cache.put(url, resp.clone());
                recursosDe(await resp.text(), url).forEach(r => recursos.add(r));
            } catch (err) {
                console.warn('[sw] no se pudo guardar', url, err);
            }
        }
        // Uno por uno: si falla uno (una fuente, por ejemplo) los demás sí se guardan
        await Promise.all([...recursos].map(r =>
            cache.add(new Request(r, { mode: new URL(r).origin === self.location.origin ? 'same-origin' : 'cors' }))
                .catch(err => console.warn('[sw] no se pudo guardar', r, err))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// Al guardar un .js o .css con ?v=nuevo se borra el de la versión anterior,
// para que la caché no crezca un archivo por cada deploy
async function guardar(cache, request, resp) {
    const url = new URL(request.url);
    if (url.origin === self.location.origin && url.searchParams.has('v')) {
        for (const viejo of await cache.keys()) {
            const u = new URL(viejo.url);
            if (u.pathname === url.pathname && u.href !== url.href) await cache.delete(viejo);
        }
    }
    await cache.put(request, resp);
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (!esCacheable(url)) return;

    if (request.mode === 'navigate') {
        // local.html?id=… es la misma página para todos los locales
        const clave = url.origin + url.pathname;
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const deRed = fetch(request).then(async resp => {
                if (resp.ok) await cache.put(clave, resp.clone());
                return resp;
            });
            // Con una rayita de señal la red no falla: se queda colgada. Pasado
            // ESPERA_RED_MS se abre la copia y la red sigue por detrás.
            const copia = () => cache.match(clave);
            try {
                const resp = await Promise.race([deRed, esperar(ESPERA_RED_MS)]);
                if (resp) return resp;
                event.waitUntil(deRed.catch(() => {}));
                return (await copia()) ?? (await deRed);
            } catch {
                return (await copia())
                    ?? (await cache.match(new URL('./index.html', self.location).href))
                    ?? Response.error();
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cache   = await caches.open(CACHE);
        const copia   = await cache.match(request);
        const deRed   = fetch(request).then(async resp => {
            if (resp.ok || resp.type === 'opaque') await guardar(cache, request, resp.clone());
            return resp;
        });
        if (copia) {
            event.waitUntil(deRed.catch(() => {}));
            return copia;
        }
        return deRed;
    })());
});
