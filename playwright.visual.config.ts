import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas visuales (regresión por capturas, issue 028): `e2e/visual/`.
 *
 * Las capturas base dependen de cómo renderiza el sistema las fuentes, así que
 * se generan y se comparan SIEMPRE dentro de la imagen oficial de Playwright
 * (la misma versión que `@playwright/test`), nunca directo en Windows o macOS:
 *
 *   npm run test:visual:docker                         # compara
 *   npm run test:visual:docker -- --update-snapshots   # regenera (revisar en el PR)
 *
 * Sirve el build de desarrollo ya hecho (`dist/tekitla-web/browser`, mismo
 * environment que los e2e) con un servidor estático: no hace falta `ng serve`
 * dentro del contenedor. En el CI corre en un job con esa misma imagen.
 */
const PORT = 4300;

export default defineConfig({
  testDir: './e2e/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report/visual' }], ['list']],
  outputDir: 'test-results/visual',

  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // Mismo entorno siempre: sólo se tolera el ruido de antialiasing.
      maxDiffPixelRatio: 0.002,
    },
  },

  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    locale: 'es',
    timezoneId: 'America/Mexico_City',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },

  webServer: {
    command: `node scripts/serve-spa.mjs dist/tekitla-web/browser ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
