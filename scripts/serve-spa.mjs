// Servidor estático mínimo para una SPA (sin dependencias): sirve los archivos
// de `dir` y responde `index.html` a cualquier ruta que no sea un archivo.
// Lo usan las pruebas visuales (playwright.visual.config.ts) para no depender
// de `ng serve` dentro del contenedor de Playwright.
//
//   node scripts/serve-spa.mjs <dir> <puerto>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

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

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const candidate = normalize(join(root, decodeURIComponent(pathname)));
  const file = candidate.startsWith(root) && isFile(candidate) ? candidate : join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serve-spa: ${root} en http://localhost:${port}`));
