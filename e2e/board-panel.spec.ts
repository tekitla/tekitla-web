import { type Locator, type Page, expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

/**
 * Detalle en panel lateral del tablero (issue 033, parte 1), con el API y
 * Firebase mockeados. En «Por hacer» están TK-1 y TK-3; en «En curso», TK-2.
 */

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Dónde guardar capturas (opcional): SCREENSHOT_DIR=... npm run test:e2e */
const SHOTS = process.env['SCREENSHOT_DIR'];

const panel = (page: Page) => page.locator('#board-panel');
const cardLink = (page: Page, key: string) =>
  page
    .locator('app-issue-card')
    .filter({ hasText: new RegExp(`${key}\\b`) })
    .getByRole('link');

async function openBoard(page: Page, url = '/proyectos/p-tk') {
  await signIn(page);
  await fakeApi(page);
  await page.goto(url);
  await expect(page.locator('.board__column').first()).toBeVisible();
}

const panelTitle = (scope: Locator) => scope.locator('#issue-detail-title');

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('@CU-033-1 clic en una tarjeta abre el detalle a la derecha con el tablero visible', async ({
    page,
  }) => {
    await openBoard(page);
    await cardLink(page, 'TK-2').click();

    await expect(page).toHaveURL(/\/proyectos\/p-tk\?issue=TK-2$/);
    await expect(panel(page)).toBeVisible();
    await expect(panelTitle(panel(page))).toHaveText('Login con Google');
    // El tablero sigue a la vista, al lado del panel, y la tarjeta queda marcada.
    await expect(page.locator('.board__column').first()).toBeVisible();
    await expect(cardLink(page, 'TK-2')).toHaveAttribute('aria-current', 'true');
    const board = await page.locator('.board__kanban').boundingBox();
    const side = await panel(page).boundingBox();
    expect(side!.x).toBeGreaterThanOrEqual(board!.x + board!.width);
    // Las migas siguen siendo las del tablero (no las del detalle).
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tekitla');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/panel-1280.png` });
  });

  test('@CU-033-2 Esc y «atrás» cierran el panel sin mover el tablero', async ({ page }) => {
    // Ventana baja para que la página tenga scroll vertical.
    await page.setViewportSize({ width: 1280, height: 420 });
    await openBoard(page);
    await page.evaluate(() => window.scrollTo(0, 120));
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    const before = await scrollY();
    expect(before).toBeGreaterThan(0);

    // Abrir y cerrar con Esc: misma posición y el foco vuelve a la tarjeta.
    await cardLink(page, 'TK-3').click();
    await expect(panel(page)).toBeVisible();
    await expect.poll(scrollY).toBe(before);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
    await expect.poll(scrollY).toBe(before);
    await expect(cardLink(page, 'TK-3')).toBeFocused();

    // Abrir y cerrar con «atrás» del navegador.
    await cardLink(page, 'TK-1').click();
    await expect(panel(page)).toBeVisible();
    await page.goBack();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
    await expect.poll(scrollY).toBe(before);
  });

  test('↑ y ↓ pasan al issue anterior o siguiente de la columna', async ({ page }) => {
    await openBoard(page);
    await cardLink(page, 'TK-1').click();
    await expect(panelTitle(panel(page))).toHaveText('Diseñar el tablero');
    await expect(panel(page).getByRole('button', { name: /anterior/ })).toBeDisabled();

    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveURL(/\?issue=TK-3$/);
    await expect(panel(page).getByRole('button', { name: /siguiente/ })).toBeDisabled();
    await page.keyboard.press('ArrowDown'); // último de la columna: se queda
    await expect(page).toHaveURL(/\?issue=TK-3$/);

    await panel(page)
      .getByRole('button', { name: /anterior/ })
      .click();
    await expect(page).toHaveURL(/\?issue=TK-1$/);
    // Cambiar de issue no suma entradas: «atrás» cierra el panel.
    await page.goBack();
    await expect(panel(page)).toHaveCount(0);
  });

  test('un enlace directo con ?issue= abre el panel; cerrarlo deja el tablero', async ({
    page,
  }) => {
    await openBoard(page, '/proyectos/p-tk?issue=TK-1');
    await expect(panelTitle(panel(page))).toHaveText('Diseñar el tablero');
    await panel(page)
      .getByRole('button', { name: /Cerrar el detalle/ })
      .click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
  });

  test('Esc dentro de un campo es del campo: cancela la edición, no cierra el panel', async ({
    page,
  }) => {
    await openBoard(page);
    await cardLink(page, 'TK-1').click();
    await panel(page).getByRole('button', { name: 'Editar el título' }).click();
    await expect(panel(page).getByRole('textbox', { name: 'Título' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page).getByRole('textbox', { name: 'Título' })).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
  });

  test('«Abrir en página completa» lleva al detalle de siempre', async ({ page }) => {
    await openBoard(page);
    await cardLink(page, 'TK-2').click();
    await panel(page).getByRole('link', { name: 'Abrir en página completa' }).click();
    await expect(page).toHaveURL(/\/proyectos\/p-tk\/issues\/2$/);
    await expect(page.locator('#board-panel')).toHaveCount(0);
  });
});

test.describe('móvil', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('@CU-033-8 a 390 px una tarjeta abre la página completa, no el panel', async ({ page }) => {
    await openBoard(page);
    await cardLink(page, 'TK-1').click();
    await expect(page).toHaveURL(/\/proyectos\/p-tk\/issues\/1$/);
    await expect(page.locator('#board-panel')).toHaveCount(0);
  });

  test('un enlace ?issue= en el celular va a la página completa', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tk?issue=TK-2');
    await expect(page).toHaveURL(/\/proyectos\/p-tk\/issues\/2$/);
  });
});
