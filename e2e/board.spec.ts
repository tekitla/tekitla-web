import { type Locator, type Page, expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

/**
 * Tablero con el API y Firebase mockeados (ver support/fake-backend.ts).
 * Criterio de la rebanada 1: «desde el celular entro, veo los issues en el
 * tablero y muevo uno de columna».
 */

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

/** Dónde guardar capturas de layout (opcional): SCREENSHOT_DIR=... npm run test:e2e */
const SHOTS = process.env['SCREENSHOT_DIR'];

const column = (page: Page, name: string) =>
  page.locator('.board__column').filter({ has: page.getByRole('heading', { name }) });

const card = (scope: Page | Locator, key: string) =>
  scope.locator('app-issue-card').filter({ hasText: key });

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('muestra las 3 columnas y arrastra una tarjeta a «En curso»', async ({ page }) => {
    await signIn(page);
    const api = await fakeApi(page);

    await page.goto('/proyectos/p-tq');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tequio');
    const todo = column(page, 'Por hacer');
    const doing = column(page, 'En curso');
    await expect(card(todo, 'TQ-1')).toBeVisible();
    await expect(card(todo, 'TQ-3')).toBeVisible(); // sin state en el JSON → Por hacer
    await expect(card(doing, 'TQ-2')).toBeVisible();
    await expect(card(column(page, 'Hecho'), 'TQ-4')).toBeVisible();
    await expect(card(todo, 'TQ-1')).toContainText('Alta');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-1280.png`, fullPage: true });

    // Drag & drop del CDK: hace falta mover el puntero en pasos.
    const from = await card(todo, 'TQ-1').boundingBox();
    const to = await doing.locator('.board__list').boundingBox();
    await page.mouse.move(from!.x + 20, from!.y + 20);
    await page.mouse.down();
    await page.mouse.move(from!.x + 40, from!.y + 40, { steps: 5 });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height - 10, { steps: 15 });
    await page.mouse.up();

    await expect(card(doing, 'TQ-1')).toBeVisible();
    await expect(card(todo, 'TQ-1')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'TQ-1 pasó a En curso' }),
    ).toBeVisible();
    const move = api.calls.find((c) => c.path.endsWith(':move'));
    expect(move).toMatchObject({
      method: 'POST',
      path: '/v1/projects/p-tq/issues/1:move',
      body: { state: 'ISSUE_STATE_IN_PROGRESS' },
    });
    expect(move?.auth).toMatch(/^Bearer .+/);
  });

  test('mover con el teclado (Shift+→) y con el menú', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tq');

    const link = card(column(page, 'Por hacer'), 'TQ-1').getByRole('link');
    await link.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(card(column(page, 'En curso'), 'TQ-1')).toBeVisible();
    // El foco sigue a la tarjeta.
    await expect(card(column(page, 'En curso'), 'TQ-1').getByRole('link')).toBeFocused();

    await card(page, 'TQ-1').getByRole('button', { name: 'Mover TQ-1 a otra columna' }).click();
    await page.getByRole('menuitem', { name: 'Mover a Hecho' }).click();
    await expect(card(column(page, 'Hecho'), 'TQ-1')).toBeVisible();
  });

  test('si el backend falla, la tarjeta vuelve y se avisa', async ({ page }) => {
    await signIn(page);
    await fakeApi(page, { moveStatus: 500 });
    await page.goto('/proyectos/p-tq');

    await card(page, 'TQ-1')
      .getByRole('button', { name: /Mover TQ-1/ })
      .click();
    await page.getByRole('menuitem', { name: 'Mover a Hecho' }).click();

    await expect(page.getByRole('alert')).toContainText('No se pudo mover TQ-1');
    await expect(card(column(page, 'Por hacer'), 'TQ-1')).toBeVisible();
    await expect(card(column(page, 'Hecho'), 'TQ-1')).toHaveCount(0);
  });

  test('crea un issue y aparece en «Por hacer»', async ({ page }) => {
    await signIn(page);
    const api = await fakeApi(page);
    await page.goto('/proyectos/p-tq');

    await page.getByRole('link', { name: 'Nuevo issue' }).click();
    await page.getByLabel('Título').fill('Probar en el celular');
    await page.getByLabel('Prioridad').selectOption({ label: 'Urgente' });
    await page.getByLabel('Descripción').fill('Con **markdown**');
    await page.getByRole('button', { name: 'Crear issue' }).click();

    await expect(page).toHaveURL(/\/proyectos\/p-tq$/);
    await expect(card(column(page, 'Por hacer'), 'TQ-5')).toContainText('Probar en el celular');
    expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'))?.body).toEqual({
      title: 'Probar en el celular',
      description: 'Con **markdown**',
      priority: 'PRIORITY_URGENT',
    });
  });

  test('el detalle renderiza el Markdown sanitizado', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tq/issues/1');

    await expect(page.getByRole('heading', { name: 'Diseñar el tablero' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Objetivo' })).toBeVisible();
    await expect(page.locator('.ui-markdown strong')).toHaveText('mobile first');
    await expect(page.locator('.ui-markdown script')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();

    await page.getByRole('button', { name: 'En curso' }).click();
    await expect(page.getByRole('button', { name: 'En curso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('móvil', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('pestañas por columna y mover con «Mover a…»', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tq');

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    await expect(page.getByRole('tab', { name: /Por hacer/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: /Por hacer/ })).toContainText('2');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveCount(1);
    await expect(card(panel, 'TQ-1')).toBeVisible();
    await expect(card(panel, 'TQ-2')).toHaveCount(0); // está en «En curso»
    // Sin scroll horizontal a 375px.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      MOBILE.width,
    );
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-375.png`, fullPage: true });

    await card(panel, 'TQ-1')
      .getByRole('button', { name: /Mover TQ-1/ })
      .tap();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-375-menu.png` });
    await page.getByRole('menuitem', { name: 'Mover a En curso' }).tap();

    await expect(card(page.getByRole('tabpanel'), 'TQ-1')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'TQ-1 pasó a En curso' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: /En curso/ })).toContainText('2');

    await page.getByRole('tab', { name: /En curso/ }).tap();
    await expect(card(page.getByRole('tabpanel'), 'TQ-1')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-375-en-curso.png`, fullPage: true });
  });

  test('las pestañas se recorren con las flechas', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tq');

    await page.getByRole('tab', { name: /Por hacer/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /En curso/ })).toBeFocused();
    await expect(page.getByRole('tab', { name: /En curso/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /Hecho/ })).toHaveAttribute('aria-selected', 'true');
  });
});
