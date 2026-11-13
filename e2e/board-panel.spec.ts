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
    await cardLink(page, 'TK-3').click();
    await expect(panel(page)).toBeVisible();
    await page.goBack();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
    await expect.poll(scrollY).toBe(before);
  });

  test('abrir, cambiar de issue y cerrar nunca llevan el tablero arriba', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await openBoard(page);
    await page.evaluate(() => window.scrollTo(0, 120));
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    await expect.poll(scrollY).toBe(120);
    // Cada posición por la que pasa la página: un salto arriba quedaría acá.
    await page.evaluate(() => {
      const w = window as unknown as { __ys: number[] };
      w.__ys = [];
      window.addEventListener('scroll', () => w.__ys.push(Math.round(window.scrollY)));
    });

    // TK-3 está entera a la vista: el clic no desplaza la página por su cuenta.
    await cardLink(page, 'TK-3').click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(page).toHaveURL(/\?issue=TK-1$/);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(scrollY).toBe(120);
    const ys = await page.evaluate(() => (window as unknown as { __ys: number[] }).__ys);
    expect(ys.filter((y) => y !== 120)).toEqual([]);
  });

  test('dos Esc seguidos cierran el panel y se quedan en el tablero', async ({ page }) => {
    // Una página antes del tablero: un «atrás» de más volvería a ella.
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos');
    await page.getByRole('link', { name: /TK\s+Tekitla/ }).click();
    await expect(page.locator('.board__column').first()).toBeVisible();
    await cardLink(page, 'TK-2').click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
    // Solo se volvió una vez: la entrada anterior sigue siendo Proyectos.
    await page.goBack();
    await expect(page).toHaveURL(/\/proyectos$/);
  });

  test('cerrar con Esc vuelve a la posición de cuando se abrió el panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await openBoard(page);
    await page.evaluate(() => window.scrollTo(0, 120));
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
    await expect.poll(scrollY).toBe(120);
    await cardLink(page, 'TK-3').click();
    await expect(panel(page)).toBeVisible();
    // Con el panel abierto se desplaza la página; al cerrar, el router vuelve
    // a donde estaba al abrir (como cualquier «atrás»), nunca arriba de todo.
    await page.evaluate(() => window.scrollTo(0, 40));
    await expect.poll(scrollY).toBe(40);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(scrollY).toBe(120);
  });

  test('después de recargar, cerrar saca ?issue= sin salir de la página', async ({ page }) => {
    await openBoard(page);
    await cardLink(page, 'TK-2').click();
    await expect(panel(page)).toBeVisible();
    await page.reload();
    await expect(panelTitle(panel(page))).toHaveText('Login con Google');
    // Marca de este documento: si cerrar recargara la app, se perdería.
    await page.evaluate(() => ((window as unknown as { __doc: number }).__doc = 1));
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
    expect(await page.evaluate(() => (window as unknown as { __doc?: number }).__doc)).toBe(1);
  });

  test('una clave de otro proyecto en ?issue= no abre nada, ni mientras carga', async ({
    page,
  }) => {
    // Registra si el panel aparece en algún momento (también antes de cargar).
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.getElementById('board-panel')) {
          (window as unknown as { __panel: boolean }).__panel = true;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await signIn(page);
    await fakeApi(page);
    // El proyecto tarda: la clave todavía no se conoce mientras se ven los issues.
    await page.route('**/v1/projects/p-tk', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fallback();
    });
    await page.goto('/proyectos/p-tk?issue=OTRO-1');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tekitla');
    await expect(page.locator('app-issue-card').first()).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __panel?: boolean }).__panel)).toBe(
      undefined,
    );
    await expect(page).toHaveURL(/\/proyectos\/p-tk\?issue=OTRO-1$/);
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
    // Con el botón: al llegar al borde queda deshabilitado y el foco va al panel.
    await page.keyboard.press('ArrowUp');
    await panel(page)
      .getByRole('button', { name: /siguiente/ })
      .click();
    await expect(page).toHaveURL(/\?issue=TK-3$/);
    await expect(panel(page)).toBeFocused();

    await panel(page)
      .getByRole('button', { name: /anterior/ })
      .click();
    await expect(page).toHaveURL(/\?issue=TK-1$/);
    // Con el foco en el contenido del panel, las flechas no cambian de issue.
    await panel(page).getByRole('button', { name: 'Editar el título' }).focus();
    await page.keyboard.press('ArrowDown');
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
