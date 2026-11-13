import { type Page, expect, test } from '@playwright/test';

import { PROJECT, fakeApi, signIn } from '../support/fake-backend';

/**
 * Regresión visual del panel (issue 028): cada pantalla a 1280 y 375 px con el
 * API simulado (los mismos datos que los e2e) y la fecha fija. El panel sólo
 * tiene tema claro (no pone `data-theme`), así que no hay capturas oscuras.
 *
 * Corre con `npm run test:visual:docker` (ver playwright.visual.config.ts).
 */

/** Fecha y hora fijas: «Actualizado …», «Hoy …» y las fechas de la actividad. */
const NOW = new Date('2026-10-12T18:00:00Z');

const VIEWPORTS = [
  { name: '1280', viewport: { width: 1280, height: 800 }, mobile: false },
  { name: '375', viewport: { width: 375, height: 812 }, mobile: true },
] as const;

const PROJECTS = [
  PROJECT,
  { id: 'p-web', key: 'WEB', name: 'Sitio web', description: 'vrojas1015.com y la marca' },
];

/**
 * Fuentes cargadas y sin esqueletos de carga a la vista. Y la página no se
 * desplaza a lo ancho: lo que no cabe (columnas, tablas) se desplaza dentro de
 * su contenedor. Sin esto la captura de página completa sale más ancha que la
 * pantalla y el motivo no es obvio.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator('.vrb-skeleton')).toHaveCount(0);
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

async function open(page: Page, path: string, ready: (page: Page) => Promise<void>) {
  await page.clock.setFixedTime(NOW);
  await signIn(page);
  await fakeApi(page, { projects: PROJECTS });
  await page.goto(path);
  await ready(page);
  await settle(page);
}

for (const { name, viewport, mobile } of VIEWPORTS) {
  test.describe(`${name} px`, () => {
    test.use({ viewport, isMobile: mobile, hasTouch: mobile });

    test('Login', async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`login-${name}.png`, { fullPage: true });
    });

    test('Proyectos', async ({ page }) => {
      await open(page, '/proyectos', (p) =>
        expect(p.getByRole('link', { name: /WEB\s+Sitio web/ })).toBeVisible(),
      );
      await expect(page).toHaveScreenshot(`proyectos-${name}.png`, { fullPage: true });
    });

    test('Tablero', async ({ page }) => {
      await open(page, '/proyectos/p-tk', (p) =>
        expect(p.locator('app-issue-card').first()).toBeVisible(),
      );
      await expect(page).toHaveScreenshot(`tablero-${name}.png`, { fullPage: true });
    });

    // En el celular no hay panel: `?issue=` lleva a la página completa (detalle-375).
    if (!mobile) {
      test('Tablero con el detalle en panel lateral (033)', async ({ page }) => {
        await open(page, '/proyectos/p-tk?issue=TK-1', (p) =>
          expect(p.locator('#board-panel app-issue-activity')).toContainText('creó el issue'),
        );
        // Sin el anillo de foco que deja abrir el panel: la captura es del diseño.
        await page.locator('#board-panel').evaluate((el) => (el as HTMLElement).blur());
        await expect(page).toHaveScreenshot(`tablero-panel-${name}.png`);
      });
    }

    test('Detalle del issue', async ({ page }) => {
      await open(page, '/proyectos/p-tk/issues/1', (p) =>
        expect(p.locator('app-issue-activity')).toContainText('creó el issue'),
      );
      await expect(page).toHaveScreenshot(`detalle-${name}.png`, { fullPage: true });
    });

    test('Ajustes › Estados', async ({ page }) => {
      await open(page, '/proyectos/p-tk/ajustes/estados', (p) =>
        expect(p.getByRole('rowheader', { name: 'En revisión' })).toBeVisible(),
      );
      await expect(page).toHaveScreenshot(`ajustes-estados-${name}.png`, { fullPage: true });
    });

    test('Ajustes › Etiquetas', async ({ page }) => {
      await open(page, '/proyectos/p-tk/ajustes/etiquetas', (p) =>
        expect(p.locator('tbody th')).toHaveText(['Backend', 'Frontend']),
      );
      await expect(page).toHaveScreenshot(`ajustes-etiquetas-${name}.png`, { fullPage: true });
    });
  });
}

/**
 * CU-028-1: la píldora de la pestaña activa queda dentro del contenedor y el
 * texto de las dos pestañas, centrado verticalmente. La captura lo muestra; esto
 * lo mide para que el motivo del fallo sea claro.
 */
test('Ajustes: las pestañas (enlaces) quedan dentro del contenedor y centradas', async ({
  page,
}) => {
  await open(page, '/proyectos/p-tk/ajustes/estados', (p) =>
    expect(p.getByRole('link', { name: 'Estados' })).toHaveAttribute('aria-current', 'page'),
  );
  const list = (await page.locator('.vrb-tabs__list').boundingBox())!;
  for (const tab of await page.locator('.vrb-tabs__tab').all()) {
    const box = (await tab.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(list.y);
    expect(box.y + box.height).toBeLessThanOrEqual(list.y + list.height);
    const text = await tab.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const above = text.top - box.y;
    const below = box.y + box.height - text.bottom;
    expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
  }
  await expect(page.locator('.vrb-tabs')).toHaveScreenshot('ajustes-pestanas-1280.png');
});
