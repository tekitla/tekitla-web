import { type Page, expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

/** Ajustes › Estados y Etiquetas (rebanada 3a). API y Firebase mockeados. */

const SHOTS = process.env['SCREENSHOT_DIR'];

test.use({ viewport: { width: 1280, height: 900 } });

const row = (page: Page, name: string) =>
  page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name }) });

test('edita los estados en borrador y los guarda en un solo request', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ajustes-estados-1280.png`, fullPage: true });

  // Alta: valida el nombre repetido sin pedir; queda en el borrador.
  await page.getByRole('button', { name: 'Nuevo estado' }).click();
  await page.getByLabel('Nombre').fill('en curso');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Ya hay uno con ese nombre.')).toBeVisible();
  await page.getByLabel('Nombre').fill('QA');
  await page.getByLabel('Categoría').selectOption({ label: 'En curso' });
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(row(page, 'QA')).toBeVisible();
  await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();

  // Reordenar: QA sube dos lugares (antes de «Descartado» y de «Hecho»).
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

  // Color, WIP y visibilidad.
  await page.getByLabel('Color de En curso').selectOption({ label: 'Ámbar' });
  await page.getByLabel(/Límite WIP de Testing/).fill('2');
  await page.getByLabel(/Límite WIP de Testing/).press('Tab');
  await page.locator('label.vrb-switch', { hasText: 'En revisión: mostrar en el tablero' }).click();
  await expect(page.locator('.settings-preview .vrb-kanban__title')).toHaveText([
    'Por hacer',
    'En curso',
    'Testing',
    'Hecho',
  ]);

  // «Por hacer» es el último de su categoría: no se puede borrar.
  await page.getByRole('button', { name: 'Más acciones para Por hacer' }).click();
  await expect(page.getByRole('menuitem', { name: 'Eliminar' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // Borrar «En curso» (tiene TK-2): pide destino entre los ya guardados.
  await page.getByRole('button', { name: 'Más acciones para En curso' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await expect(row(page, 'En curso')).toHaveCount(0);
  await page.getByLabel(/Sus 1 issues pasan a/).selectOption({ label: 'En revisión' });

  // Sin requests hasta guardar; después, uno solo.
  expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  const writes = api.calls.filter((c) => c.method !== 'GET');
  expect(writes.map((c) => c.path)).toEqual(['/v1/projects/p-tk/statuses:batchUpdate']);
  const body = writes[0]!.body as {
    statuses: { id: string; name: string; wipLimit: number; hidden: boolean }[];
    deletions: unknown[];
  };
  expect(body.statuses.map((s) => s.name)).toEqual([
    'Por hacer',
    'En revisión',
    'Testing',
    'Hecho',
    'Descartado',
  ]);
  expect(body.statuses.every((s) => typeof s.hidden === 'boolean')).toBe(true);
  expect(body.statuses[1]).toMatchObject({ hidden: true });
  expect(body.statuses[2]).toMatchObject({ id: '', wipLimit: 2 });
  expect(body.deletions).toEqual([{ statusId: 's-doing', moveToStatusId: 's-review' }]);
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();

  // Al recargar se ven los cambios, y el tablero los refleja.
  await page.reload();
  await expect(page.locator('.settings-preview .vrb-kanban__title')).toHaveText([
    'Por hacer',
    'Testing',
    'Hecho',
  ]);
  await page.getByRole('link', { name: 'Tablero' }).click();
  await expect(page.locator('.board__column .vrb-kanban__title')).toHaveText([
    'Por hacer',
    'Testing',
    'Hecho',
  ]);
  await expect(page.getByText('2 issues en columnas ocultas')).toBeVisible();
});

test('si otro cambió los estados, los trae de nuevo con los cambios propios encima', async ({
  page,
}) => {
  await signIn(page);
  const api = await fakeApi(page, { staleStatusesOnce: true });
  await page.goto('/proyectos/p-tk/ajustes/estados');

  await page.getByLabel(/Límite WIP de En curso/).fill('3');
  await page.getByLabel(/Límite WIP de En curso/).press('Tab');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText(/Otra persona cambió los estados/)).toBeVisible();
  // Llegó «Bloqueado» (lo creó otro) y el WIP propio sigue en el borrador.
  await expect(row(page, 'Bloqueado')).toBeVisible();
  await expect(page.getByLabel(/Límite WIP de En curso/)).toHaveValue('3');

  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  const saves = api.calls.filter((c) => c.path.endsWith(':batchUpdate'));
  expect(saves).toHaveLength(2);
  const names = (saves[1]!.body as { statuses: { name: string }[] }).statuses.map((s) => s.name);
  expect(names).toContain('Bloqueado');
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
