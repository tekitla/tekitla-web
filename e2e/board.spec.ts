import { type Locator, type Page, expect, test } from '@playwright/test';

import { STATUSES, fakeApi, signIn } from './support/fake-backend';

/**
 * Tablero con el API y Firebase mockeados (ver support/fake-backend.ts).
 * Rebanada 1: «desde el celular entro, veo los issues en el tablero y muevo
 * uno de columna». Rebanada 3a: columnas desde los estados del proyecto y
 * reordenar arrastrando o con el teclado.
 */

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

/** Dónde guardar capturas de layout (opcional): SCREENSHOT_DIR=... npm run test:e2e */
const SHOTS = process.env['SCREENSHOT_DIR'];

const column = (page: Page, name: string) =>
  page.locator('.board__column').filter({ has: page.getByRole('heading', { name, exact: true }) });

const card = (scope: Page | Locator, key: string) =>
  scope.locator('app-issue-card').filter({ hasText: new RegExp(`${key}\\b`) });

const keysIn = async (scope: Locator) =>
  (await scope.locator('.vrb-kanban-card__code').allTextContents()).map((t) => t.trim());

/**
 * Drag & drop del CDK: hace falta mover el puntero en pasos. Al entrar a una
 * lista la tarjeta toma el lugar del ítem que está bajo el puntero y sólo se
 * reordena al seguir moviéndose sobre otros: `path` son los puntos por los que
 * pasa.
 */
async function drag(page: Page, from: Locator, ...path: { x: number; y: number }[]) {
  const box = await from.boundingBox();
  await page.mouse.move(box!.x + 20, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 40, box!.y + 40, { steps: 5 });
  for (const point of path) await page.mouse.move(point.x, point.y, { steps: 15 });
  await page.mouse.up();
}

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('una columna por estado visible, con su categoría, etiquetas y los ocultos', async ({
    page,
  }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tk');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tekitla');
    await expect(page.locator('.board__column .vrb-kanban__title')).toHaveText([
      'Por hacer',
      'En curso',
      'En revisión',
      'Hecho',
    ]);
    // La categoría sólo se aclara si el nombre no la dice.
    await expect(column(page, 'En revisión').locator('.vrb-kanban__category')).toContainText(
      'En curso',
    );
    await expect(column(page, 'Por hacer').locator('.vrb-kanban__category')).toHaveCount(0);
    await expect(column(page, 'En revisión')).toHaveClass(/vrb-kanban__column--info/);

    // TK-3 llega sin statusId ni state: cae en el primer estado «Por hacer».
    expect(await keysIn(column(page, 'Por hacer'))).toEqual(['TK-1', 'TK-3']);
    await expect(card(page, 'TK-1').locator('.vrb-kanban-card__label')).toHaveText('Frontend');
    await expect(card(page, 'TK-5')).toHaveCount(0);
    await expect(page.getByText('1 issue en una columna oculta')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-1280.png`, fullPage: true });
  });

  test('arrastra una tarjeta a otra columna', async ({ page }) => {
    await signIn(page);
    const api = await fakeApi(page);
    await page.goto('/proyectos/p-tk');

    const review = column(page, 'En revisión');
    const list = await review.locator('.board__list').boundingBox();
    await drag(page, card(page, 'TK-1'), {
      x: list!.x + list!.width / 2,
      y: list!.y + list!.height / 2,
    });

    await expect(card(review, 'TK-1')).toBeVisible();
    await expect(card(column(page, 'Por hacer'), 'TK-1')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'TK-1 pasó a En revisión' }),
    ).toBeVisible();
    const move = api.calls.find((c) => c.path.endsWith(':move'));
    // Columna vacía: sin vecinos.
    expect(move).toMatchObject({
      method: 'POST',
      path: '/v1/projects/p-tk/issues/1:move',
      body: { statusId: 's-review' },
    });
    expect(move?.auth).toMatch(/^Bearer .+/);
  });

  test('reordena dentro de la columna arrastrando', async ({ page }) => {
    await signIn(page);
    const api = await fakeApi(page);
    await page.goto('/proyectos/p-tk');

    const todo = column(page, 'Por hacer');
    const first = await card(todo, 'TK-1').boundingBox();
    await drag(page, card(todo, 'TK-3'), { x: first!.x + first!.width / 2, y: first!.y + 4 });

    await expect.poll(() => keysIn(todo)).toEqual(['TK-3', 'TK-1']);
    await expect(
      page.getByRole('status').filter({ hasText: 'TK-3 cambió de lugar' }),
    ).toBeVisible();
    expect(api.calls.find((c) => c.path.endsWith('3:move'))?.body).toEqual({
      statusId: 's-todo',
      beforeNumber: 1,
    });
    // Recargar: el servidor guardó el orden.
    await page.reload();
    await expect.poll(() => keysIn(column(page, 'Por hacer'))).toEqual(['TK-3', 'TK-1']);
  });

  test('con el teclado: Shift+↓ baja en la columna, Shift+→ cambia de columna; y el menú', async ({
    page,
  }) => {
    await signIn(page);
    const api = await fakeApi(page);
    await page.goto('/proyectos/p-tk');

    const todo = column(page, 'Por hacer');
    await card(todo, 'TK-1').getByRole('link').focus();
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => keysIn(todo)).toEqual(['TK-3', 'TK-1']);
    expect(api.calls.at(-1)?.body).toEqual({ statusId: 's-todo', afterNumber: 3 });
    await expect(card(todo, 'TK-1').getByRole('link')).toBeFocused();

    await page.keyboard.press('Shift+ArrowRight');
    await expect(card(column(page, 'En curso'), 'TK-1')).toBeVisible();
    // El foco sigue a la tarjeta.
    await expect(card(column(page, 'En curso'), 'TK-1').getByRole('link')).toBeFocused();

    await card(page, 'TK-1').getByRole('button', { name: 'Mover TK-1 a otra columna' }).click();
    await page.getByRole('menuitem', { name: 'Mover a Hecho' }).click();
    await expect(card(column(page, 'Hecho'), 'TK-1')).toBeVisible();

    // El menú no ofrece los estados de descarte: «Descartar…» pide un motivo.
    await card(page, 'TK-1')
      .getByRole('button', { name: /Mover TK-1/ })
      .click();
    await expect(page.getByRole('menuitem', { name: 'Mover a Descartado' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Descartar…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Descartar TK-1' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Motivo').fill('Duplicado de TK-4');
    await dialog.getByRole('button', { name: 'Descartar' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('link', { name: 'Tablero' }).click();
    await expect(card(page, 'TK-1')).toHaveCount(0);
    await expect(page.getByText('2 issues en columnas ocultas')).toBeVisible();
  });

  test('si el backend falla, la tarjeta vuelve y se avisa', async ({ page }) => {
    await signIn(page);
    await fakeApi(page, { moveStatus: 500 });
    await page.goto('/proyectos/p-tk');

    await card(page, 'TK-1')
      .getByRole('button', { name: /Mover TK-1/ })
      .click();
    await page.getByRole('menuitem', { name: 'Mover a Hecho' }).click();

    await expect(page.getByRole('alert')).toContainText('No se pudo mover TK-1');
    await expect(card(column(page, 'Por hacer'), 'TK-1')).toBeVisible();
    await expect(card(column(page, 'Hecho'), 'TK-1')).toHaveCount(0);
  });

  test('vista vieja (FAILED_PRECONDITION): recarga el tablero y avisa', async ({ page }) => {
    await signIn(page);
    const api = await fakeApi(page, { moveStatus: 400 });
    await page.goto('/proyectos/p-tk');
    await expect(card(page, 'TK-3')).toBeVisible();
    const before = api.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/issues')).length;

    await card(page, 'TK-3').getByRole('link').focus();
    await page.keyboard.press('Shift+ArrowUp');

    await expect(page.getByRole('alert')).toContainText('El tablero cambió mientras tanto');
    await expect
      .poll(() => api.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/issues')).length)
      .toBe(before + 1);
    expect(await keysIn(column(page, 'Por hacer'))).toEqual(['TK-1', 'TK-3']);
  });

  test('crea un issue y aparece en el primer estado «Por hacer»', async ({ page }) => {
    await signIn(page);
    const api = await fakeApi(page);
    await page.goto('/proyectos/p-tk');

    await page.getByRole('link', { name: 'Nuevo issue' }).click();
    await expect(page.locator('.vrb-page-header__description')).toContainText('Por hacer');
    await page.getByLabel('Título').fill('Probar en el celular');
    // El radio está oculto a la vista: se elige tocando su etiqueta.
    await page.locator('label', { hasText: 'Urgente' }).click();
    await page.getByLabel('Descripción').fill('Con **markdown**');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/issue-nuevo-1280.png`, fullPage: true });
    await page.getByRole('button', { name: 'Crear issue' }).click();

    await expect(page).toHaveURL(/\/proyectos\/p-tk$/);
    await expect(card(column(page, 'Por hacer'), 'TK-6')).toContainText('Probar en el celular');
    expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'))?.body).toEqual({
      title: 'Probar en el celular',
      description: 'Con **markdown**',
      priority: 'PRIORITY_URGENT',
    });
  });
});

test.describe('móvil', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('pestañas por columna y mover con «Mover a…»', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tk');

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(page.getByRole('tab', { name: /Por hacer/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: /Por hacer/ })).toContainText('2');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveCount(1);
    await expect(card(panel, 'TK-1')).toBeVisible();
    await expect(card(panel, 'TK-2')).toHaveCount(0); // está en «En curso»
    // Sin scroll horizontal a 375px.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      MOBILE.width,
    );
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-375.png`, fullPage: true });

    await card(panel, 'TK-1')
      .getByRole('button', { name: /Mover TK-1/ })
      .tap();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-375-menu.png` });
    await page.getByRole('menuitem', { name: 'Mover a En revisión' }).tap();

    await expect(card(page.getByRole('tabpanel'), 'TK-1')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'TK-1 pasó a En revisión' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: /En revisión/ })).toContainText('1');

    await page.getByRole('tab', { name: /En revisión/ }).tap();
    await expect(card(page.getByRole('tabpanel'), 'TK-1')).toBeVisible();
  });

  test('las pestañas se recorren con las flechas', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    await page.goto('/proyectos/p-tk');

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

test.describe('estados con color, WIP y ocultos', () => {
  test.use({ viewport: DESKTOP });

  test('marca el WIP excedido sin bloquear, usa el color y no muestra las ocultas', async ({
    page,
  }) => {
    await signIn(page);
    const statuses = STATUSES.map((s) =>
      s.id === 's-doing'
        ? { ...s, wipLimit: 1, color: 'LABEL_COLOR_WARNING' }
        : s.id === 's-review'
          ? { ...s, hidden: true }
          : s,
    );
    await fakeApi(page, { statuses });
    await page.goto('/proyectos/p-tk');

    await expect(page.locator('.board__column .vrb-kanban__title')).toHaveText([
      'Por hacer',
      'En curso',
      'Hecho',
    ]);
    const doing = column(page, 'En curso');
    await expect(doing).toHaveClass(/vrb-kanban__column--warning/);
    await expect(doing.locator('.vrb-kanban__count')).toContainText('1');
    await expect(doing.locator('.vrb-kanban__limit')).toContainText('1');
    await expect(doing.getByText('En el límite')).toBeVisible();

    // Pasarse avisa, no bloquea: el movimiento sale igual.
    await card(page, 'TK-1').getByRole('button', { name: 'Mover TK-1 a otra columna' }).click();
    await page.getByRole('menuitem', { name: 'Mover a En curso' }).click();
    await expect(card(doing, 'TK-1')).toBeVisible();
    await expect(doing.getByText('WIP excedido')).toBeVisible();
    await expect(doing).toHaveAttribute('data-over-limit', 'true');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tablero-wip-1280.png`, fullPage: true });
  });
});
