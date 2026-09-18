// Servidor Node del conector: adapta el handler `fetch` de src/index.js a node:http.
// Corre en la VM de Oracle detrás de nginx (https://hidrogel.alejandrogmota.com/mcp/<token>).

import http from 'node:http';
import handler from './src/index.js';

const PUERTO = Number(process.env.PORT) || 8080;
const env = {
    MCP_TOKEN:           process.env.MCP_TOKEN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY:    process.env.FIREBASE_API_KEY,
};

http.createServer(async (req, res) => {
    const inicio = Date.now();
    try {
        if (req.url === '/health') {
            res.writeHead(200).end('ok');
            return;
        }
        const partes = [];
        for await (const parte of req) partes.push(parte);
        const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
            method:  req.method,
            headers: req.headers,
            body:    ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(partes),
        });
        const respuesta = await handler.fetch(request, env);
        res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
        res.end(Buffer.from(await respuesta.arrayBuffer()));
        // Sin la URL: lleva el token
        console.log(`${req.method} ${respuesta.status} ${Date.now() - inicio}ms`);
    } catch (err) {
        console.error('Error atendiendo petición:', err);
        if (!res.headersSent) res.writeHead(500);
        res.end('Error interno');
    }
}).listen(PUERTO, () => console.log(`hidrogel-mcp escuchando en :${PUERTO}`));
