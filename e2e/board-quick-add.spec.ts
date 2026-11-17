import { type Page, expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

/**
 * Alta rápida al pie de cada columna (issue 033, parte 3), con el API y
 * Firebase mockeados. CreateIssue recibe la columna (`statusId`).
 */

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 740 };

const column = (page: Page, name: string) =>
  page
    .locator('.board__column')
    .filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });

/** Claves de las tarjetas de una columna, en orden. */
const keysIn = (page: Page, name: string) =>
  column(page, name)
    .locator('app-issue-card .vrb-kanban-card__code')
    .allInnerTexts()
    .then((keys) => keys.map((k) => k.trim()));

async function openBoard(page: Page, options: Parameters<typeof fakeApi>[1] = {}) {
  await signIn(page);
  const api = await fakeApi(page, options);
  await page.goto('/proyectos/p-tk');
  await expect(page.locator('.board__column').first()).toBeVisible();
  return api;
}

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('@CU-033-3 Enter crea el issue al final de «Por hacer» y deja el campo listo para otro', async ({
    page,
  }) => {
    const api = await openBoard(page);
    const before = await keysIn(page, 'Por hacer');

    await page.getByRole('button', { name: 'Agregar un issue en Por hacer' }).click();
    const field = page.getByRole('textbox', { name: 'Título del issue nuevo en Por hacer' });
    await expect(field).toBeFocused();
    await field.fill('Primero rápido');
    await field.press('Enter');

    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'TK-6 creado en Por hacer' }),
    ).toBeVisible();
    expect(await keysIn(page, 'Por hacer')).toEqual([...before, 'TK-6']);

    await field.fill('Segundo rápido');
    await field.press('Enter');
    await expect(column(page, 'Por hacer').getByText('Segundo rápido')).toBeVisible();
    expect(await keysIn(page, 'Por hacer')).toEqual([...before, 'TK-6', 'TK-7']);

    const created = api.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/issues'));
    expect(created.map((c) => c.body)).toEqual([
      { title: 'Primero rápido', description: '', priority: 'PRIORITY_MEDIUM', statusId: 's-todo' },
      { title: 'Segundo rápido', description: '', priority: 'PRIORITY_MEDIUM', statusId: 's-todo' },
    ]);
    expect(api.calls.some((c) => c.path.endsWith(':move'))).toBe(false);
  });

  test('en otra columna, el issue queda al final de esa columna y sobrevive a recargar', async ({
    page,
  }) => {
    const api = await openBoard(page);
    const before = await keysIn(page, 'En revisión');

    await page.getByRole('button', { name: 'Agregar un issue en En revisión' }).click();
    const field = page.getByRole('textbox', { name: 'Título del issue nuevo en En revisión' });
    await field.fill('Revisar el alta');
    await field.press('Enter');

    await expect(
      page.getByRole('status').filter({ hasText: 'TK-6 creado en En revisión' }),
    ).toBeVisible();
    expect(await keysIn(page, 'En revisión')).toEqual([...before, 'TK-6']);
    expect(await keysIn(page, 'Por hacer')).not.toContain('TK-6');
    const create = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'));
    expect(create?.body).toMatchObject({ title: 'Revisar el alta', statusId: 's-review' });
    expect(api.calls.some((c) => c.path.endsWith(':move'))).toBe(false);

    await page.reload();
    await expect(column(page, 'En revisión').getByText('Revisar el alta')).toBeVisible();
    expect(await keysIn(page, 'En revisión')).toEqual([...before, 'TK-6']);
  });

  test('si el backend no respeta la columna, el issue queda donde nació y el aviso lo dice', async ({
    page,
  }) => {
    await openBoard(page, { createIgnoresStatus: true });

    await page.getByRole('button', { name: 'Agregar un issue en En curso' }).click();
    const field = page.getByRole('textbox', { name: 'Título del issue nuevo en En curso' });
    await field.fill('Se queda');
    await field.press('Enter');

    const alert = page.getByRole('alert').filter({ hasText: 'TK-6 creado en Por hacer' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Quedó en otra columna, no en la que elegiste');
    expect(await keysIn(page, 'Por hacer')).toContain('TK-6');
    expect(await keysIn(page, 'En curso')).not.toContain('TK-6');
    await expect(field).toHaveValue('');
  });

  test('vacío pide un título; Esc cierra y devuelve el foco al botón', async ({ page }) => {
    const api = await openBoard(page);
    const open = page.getByRole('button', { name: 'Agregar un issue en Hecho' });
    await open.click();
    const field = page.getByRole('textbox', { name: 'Título del issue nuevo en Hecho' });

    await field.fill('   ');
    await field.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'Escribe un título.' })).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');

    await field.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/issues'))).toBe(false);
  });

  test('si falla el alta, el título vuelve al campo con el error', async ({ page }) => {
    await openBoard(page);
    await page.route(/\/v1\/projects\/p-tk\/issues$/, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: { code: 13, message: 'boom' } })
        : route.fallback(),
    );

    await page.getByRole('button', { name: 'Agregar un issue en Por hacer' }).click();
    const field = page.getByRole('textbox', { name: 'Título del issue nuevo en Por hacer' });
    await field.fill('No llega');
    await field.press('Enter');

    await expect(
      page.getByRole('alert').filter({ hasText: 'No se pudo crear «No llega»' }),
    ).toBeVisible();
    await expect(field).toHaveValue('No llega');
  });

  test('la columna de descarte no tiene alta rápida', async ({ page }) => {
    await openBoard(page, {
      statuses: [
        {
          id: 's-todo',
          projectId: 'p-tk',
          name: 'Por hacer',
          category: 'ISSUE_STATE_TODO',
          rank: 'a',
        },
        {
          id: 's-canceled',
          projectId: 'p-tk',
          name: 'Descartado',
          category: 'ISSUE_STATE_CANCELED',
          rank: 'b',
        },
      ],
    });
    await expect(column(page, 'Descartado')).toBeVisible();
    await expect(column(page, 'Descartado').locator('app-quick-add')).toHaveCount(0);
    await expect(column(page, 'Por hacer').locator('app-quick-add')).toHaveCount(1);
  });
});

test.describe('celular', () => {
  test.use({ viewport: MOBILE });

  test('crea en la columna de la pestaña elegida y se queda en ella', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('tab', { name: /^En curso/ }).click();

    await page.getByRole('button', { name: 'Agregar un issue en En curso' }).click();
    const field = page.getByRole('textbox', { name: 'Título del issue nuevo en En curso' });
    await field.fill('Desde el celular');
    await field.press('Enter');

    await expect(column(page, 'En curso').getByText('Desde el celular')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^En curso/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const box = await field.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});
