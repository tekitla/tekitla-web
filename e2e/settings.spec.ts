import { type Page, expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

/** Ajustes › Estados y Etiquetas (rebanada 3a). API y Firebase mockeados. */

const SHOTS = process.env['SCREENSHOT_DIR'];

test.use({ viewport: { width: 1280, height: 900 } });

const row = (page: Page, name: string) =>
  page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name }) });

test('crea, renombra, reordena y borra estados; el tablero los refleja', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk');
  await page.getByRole('link', { name: 'Ajustes' }).first().click();

  await expect(page).toHaveURL(/\/ajustes\/estados$/);
  await expect(page.getByRole('link', { name: 'Estados' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.settings-preview .vrb-kanban__title')).toHaveText([
    'Por hacer',
    'En curso',
    'En revisión',
    'Hecho',
  ]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ajustes-estados-1280.png`, fullPage: true });

  // Alta: valida el nombre repetido sin pedir.
  await page.getByRole('button', { name: 'Nuevo estado' }).click();
  await page.getByLabel('Nombre').fill('en curso');
  await page.getByRole('button', { name: 'Crear estado' }).click();
  await expect(page.getByText('Ya hay uno con ese nombre.')).toBeVisible();
  await page.getByLabel('Nombre').fill('QA');
  await page.getByLabel('Categoría').selectOption({ label: 'En curso' });
  await page.getByRole('button', { name: 'Crear estado' }).click();
  await expect(row(page, 'QA')).toBeVisible();
  expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/statuses'))?.body).toEqual({
    name: 'QA',
    category: 'ISSUE_STATE_IN_PROGRESS',
  });

  // Reordenar: QA sube un lugar (queda antes de «Descartado»… y de «Hecho»).
  await page.getByRole('button', { name: 'Subir QA' }).click();
  await expect(page.getByRole('button', { name: 'Subir QA' })).toBeFocused();
  await page.getByRole('button', { name: 'Subir QA' }).click();
  await expect(page.locator('.settings-preview .vrb-kanban__title')).toHaveText([
    'Por hacer',
    'En curso',
    'En revisión',
    'QA',
    'Hecho',
  ]);

  // Renombrar desde el menú.
  await page.getByRole('button', { name: 'Más acciones para QA' }).click();
  await page.getByRole('menuitem', { name: 'Renombrar' }).click();
  await page.getByLabel('Nuevo nombre de QA').fill('Testing');
  await page.getByLabel('Nuevo nombre de QA').press('Enter');
  await expect(row(page, 'Testing')).toBeVisible();

  // «Por hacer» es el último de su categoría: no se puede borrar.
  await page.getByRole('button', { name: 'Más acciones para Por hacer' }).click();
  await expect(page.getByRole('menuitem', { name: 'Eliminar' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // Borrar «En curso» (tiene TK-2): pide destino.
  await page.getByRole('button', { name: 'Más acciones para En curso' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await page.getByLabel(/Sus 1 issues pasan a/).selectOption({ label: 'Testing · En curso' });
  await page.getByRole('button', { name: 'Eliminar estado' }).click();
  await expect(row(page, 'En curso')).toHaveCount(0);
  const del = api.calls.find((c) => c.method === 'DELETE');
  expect(del?.path).toMatch(/\/statuses\/s-doing$/);

  // El tablero ya tiene las columnas nuevas y TK-2 en «Testing».
  await page.getByRole('link', { name: 'Tablero' }).click();
  await expect(page.locator('.board__column .vrb-kanban__title')).toHaveText([
    'Por hacer',
    'En revisión',
    'Testing',
    'Hecho',
  ]);
  await expect(
    page.locator('.board__column').filter({ hasText: 'Testing' }).locator('app-issue-card'),
  ).toContainText('TK-2');
});

test('etiquetas: crear, editar y borrar', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/ajustes/etiquetas');

  await expect(page.locator('tbody th')).toHaveText(['Backend', 'Frontend']);

  await page.getByLabel('Nombre').fill('CLI');
  await page.locator('label', { hasText: 'Verde' }).click();
  await page.getByRole('button', { name: 'Crear etiqueta' }).click();
  await expect(page.locator('tbody th')).toHaveText(['Backend', 'CLI', 'Frontend']);
  expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/labels'))?.body).toEqual({
    name: 'CLI',
    color: 'LABEL_COLOR_SUCCESS',
  });
  await expect(page.getByLabel('Nombre')).toHaveValue('');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ajustes-etiquetas-1280.png`, fullPage: true });

  await page.getByRole('button', { name: 'Editar CLI' }).click();
  await page.getByLabel('Nombre').nth(1).fill('Terminal');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('tbody th')).toHaveText(['Backend', 'Frontend', 'Terminal']);
  expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'Terminal' });

  await page.getByRole('button', { name: 'Eliminar Frontend' }).click();
  await expect(page.getByText('Se quita de los 1 issues')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar etiqueta' }).click();
  await expect(page.locator('tbody th')).toHaveText(['Backend', 'Terminal']);
});
