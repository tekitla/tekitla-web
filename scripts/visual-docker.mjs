// Corre las pruebas visuales dentro de la imagen oficial de Playwright, la misma
// que usa el CI, para que las capturas no dependan del sistema (issue 028).
//
//   npm run test:visual:docker                         # compara
//   npm run test:visual:docker -- --update-snapshots   # regenera las capturas base
//
// 1. Build de desarrollo en el host (`dist/tekitla-web/browser`).
// 2. `docker run` con el repo montado. Playwright y el código de las pruebas
//    son JavaScript puro, así que sirve el node_modules del host; los
//    navegadores y las fuentes salen de la imagen.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd, args) => {
  const { status } = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (status !== 0) process.exit(status ?? 1);
};

const { version } = JSON.parse(
  readFileSync(new URL('../node_modules/@playwright/test/package.json', import.meta.url), 'utf8'),
);
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

if (!process.env['SKIP_BUILD']) run('npx', ['ng', 'build', '--configuration', 'development']);

run('docker', [
  'run',
  '--rm',
  '--ipc=host',
  '-e',
  'CI',
  '-v',
  `${process.cwd()}:/work`,
  '-w',
  '/work',
  image,
  'node',
  'node_modules/@playwright/test/cli.js',
  'test',
  '-c',
  'playwright.visual.config.ts',
  ...process.argv.slice(2),
]);
