#!/usr/bin/env python3
"""Genera una copia del sitio lista para abrir en local.

Hace lo mismo que el paso «Inject Firebase config» del workflow, pero con la
config que está en `.env`, y deja todo en `.local/` con los nombres de siempre
para que los enlaces entre páginas sigan funcionando.

    python3 dev.py          # genera .local/ y levanta el servidor
    python3 dev.py --build  # solo genera .local/
"""

import http.server
import os
import re
import shutil
import socketserver
import sys
from pathlib import Path

RAIZ = Path(__file__).parent
SALIDA = RAIZ / '.local'
PUERTO = 8000

# Lo mismo que `targets` en .github/workflows/deploy.yml
PAGINAS = ['index.html', 'local.html', 'locales.html', 'admin.html',
           'global.html', 'migrar.html', 'venta.html', 'analytics/index.html']

# Lo que hay que copiar tal cual para que el sitio funcione
COPIAR = ['*.js', '*.css', '*.html', 'analytics/*', 'catalogo-buytiti/*',
          'catalogo-myshop/*']


def leer_config():
    env = RAIZ / '.env'
    if not env.exists():
        sys.exit('Falta .env con FIREBASE_CONFIG.')
    for linea in env.read_text().splitlines():
        if linea.startswith('FIREBASE_CONFIG='):
            valor = linea.split('=', 1)[1].strip()
            # Por si viene entre comillas
            if valor[:1] in '\'"' and valor[:1] == valor[-1:]:
                valor = valor[1:-1]
            return valor
    sys.exit('.env no tiene la línea FIREBASE_CONFIG=...')


def construir():
    if SALIDA.exists():
        shutil.rmtree(SALIDA)
    SALIDA.mkdir()

    for patron in COPIAR:
        for origen in RAIZ.glob(patron):
            if origen.is_dir() or '.local' in origen.parts:
                continue
            destino = SALIDA / origen.relative_to(RAIZ)
            destino.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origen, destino)

    config = leer_config()
    for pagina in PAGINAS:
        archivo = SALIDA / pagina
        if not archivo.exists():
            print(f'  aviso: {pagina} no existe, se salta')
            continue
        texto = archivo.read_text()
        texto = texto.replace('%%FIREBASE_CONFIG%%', config)
        # En local no se activa App Check: el placeholder se queda tal cual,
        # que es justo lo que el propio index.html interpreta como «apagado»
        archivo.write_text(texto)

    print(f'Sitio generado en {SALIDA.relative_to(RAIZ)}/')


def servir():
    # Se sirve con `directory=` en vez de `os.chdir`: si otra corrida de
    # `dev.py --build` vuelve a generar `.local/`, el servidor que ya estaba
    # arriba se quedaba con su directorio de trabajo apuntando a un inodo
    # borrado y toda petición moría con FileNotFoundError, pareciendo un
    # problema de red. Resolviendo la ruta en cada petición, sobrevive.
    SALIDA.mkdir(exist_ok=True)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(SALIDA), **kwargs)

        def end_headers(self):
            # Sin caché, para no pelearse con el navegador al ir cambiando
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def log_message(self, formato, *args):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PUERTO), Handler) as httpd:
        print(f'http://localhost:{PUERTO}  ·  Ctrl+C para parar')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nListo.')


if __name__ == '__main__':
    construir()
    if '--build' not in sys.argv:
        servir()
