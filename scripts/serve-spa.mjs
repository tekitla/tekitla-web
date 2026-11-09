// Servidor estático mínimo para una SPA (sin dependencias): sirve los archivos
// de `dir` y responde `index.html` a las rutas de la app (sin extensión). Un
// archivo que falta (`.js`, `.json`, …) da 404, para que se vea en la traza y
// no como una pantalla rara. Lo usan las pruebas visuales
// (playwright.visual.config.ts) para no depender de `ng serve` dentro del
// contenedor de Playwright.
//
//   node scripts/serve-spa.mjs <dir> <puerto>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist/tekitla-web/browser');
const port = Number(process.argv[3] ?? 4300);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** El archivo a servir, o null si es un archivo que no existe (404). */
function resolveFile(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname);
  } catch {
    return null; // escape mal formado
  }
  const candidate = normalize(join(root, pathname));
  const inside = candidate === root || candidate.startsWith(root + sep);
  if (inside && isFile(candidate)) return candidate;
  // Ruta de la app (sin extensión) → index.html; un archivo que falta → 404.
  return extname(pathname) ? null : join(root, 'index.html');
}

createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }
  const stream = createReadStream(file);
  stream.on('open', () =>
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }),
  );
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end();
  });
  stream.pipe(res);
}).listen(port, () => console.log(`serve-spa: ${root} en http://localhost:${port}`));
