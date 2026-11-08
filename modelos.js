// Cómo se reconoce un modelo de celular a partir de lo que se escribe. Lo usan
// las listas (lista-core.js, para avisar de un renglón repetido) y Analytics
// (analytics.js, para agrupar las compras): las dos tienen que decidir igual
// que «15», «ip 15» e «iPhone 15» son el mismo y que «a15» es otro.
// Script clásico, sin import: se carga antes que quien lo use.

// Clave para comparar nombres: minúsculas, sin notas de encargo ("deja 50…",
// "encargó…"), sin teléfonos y sin puntuación sobrante. Así "E40," y "e40",
// o "Y9 prime" y "y9 prime", caen en el mismo modelo.
// En iPhone se quita el prefijo: "13", "ip 13", "ip13" e "iPhone 13" dan "13",
// y "13pm" / "ip13promax" / "iphone 13 pro max" dan "13 pro max".
// "op a38" es OPPO: se expande a "oppo a38". En Samsung se quita la marca:
// "Samsung A15" y "galaxy a15" dan "a15", que es como se suele anotar.
function claveNombre(nombre) {
    return String(nombre || '')
        .toLowerCase()
        .replace(/\s+(deja|dejo|dejó|encargo|encargó)(?=\s|$).*$/, '')
        .replace(/\d{7,}/g, '')
        .replace(/[\s.,;:]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^op /, 'oppo ')
        .replace(/^(samsung )?(galaxy )?(?=[as] ?\d)/, '')
        .replace(/^(iphone|ip|i) ?(?=\d)/, '')
        .replace(/^iphone ?(?=x|se\b)/, '')
        .replace(/^(\d{1,2}) ?(pm|pro ?max)$/, '$1 pro max')
        .replace(/^(\d{1,2}) ?(pro|plus|mini)$/, '$1 $2');
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

// aliases.csv como Map de clave → nombre normalizado. Las claves pasan por
// claveNombre, así "iPhone 15" encuentra el alias "15".
function parsearAliases(texto) {
    const map = new Map();
    texto.trim().split('\n').slice(1).forEach(linea => {
        const [alias, nombre] = linea.split(',').map(s => s.trim());
        if (!alias || !nombre) return;
        map.set(claveNombre(alias), nombre);
        // Registros viejos guardaron el nombre ya normalizado
        if (!map.has(claveNombre(nombre))) map.set(claveNombre(nombre), nombre);
    });
    return map;
}

// El modelo de un nombre escrito a mano. Con `conAlias`, los modelos que
// comparten mica se juntan («a15» y «a24» → «Samsung Galaxy A15/A24/A34»); eso
// solo vale para micas: una funda de A15 no le queda a un A24.
function modeloCanonico(nombre, aliasMap, { conAlias = true } = {}) {
    const clave = claveNombre(nombre);
    if (conAlias && aliasMap?.has(clave)) return aliasMap.get(clave);
    return modeloPorPatron(clave) ?? clave;
}
