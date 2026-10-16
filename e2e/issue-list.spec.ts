import { type Page, expect, test } from '@playwright/test';

import { type FakeIssue, fakeApi, signIn } from './support/fake-backend';

/**
 * Lista de issues (issues 011 y 012): pestañas, búsqueda, filtros y orden en la
 * URL, «Cargar más», selección múltiple y Descartados con Restaurar. API y
 * Firebase mockeados.
 */

const SHOTS = process.env['SCREENSHOT_DIR'];

test.use({ viewport: { width: 1280, height: 900 } });

/** Las casillas de vrb se marcan con su label (la caja tapa el input). */
const select = (page: Page, name: string) =>
  page.getByRole('checkbox', { name }).locator('xpath=..').click();

const keys = async (page: Page) =>
  (await page.locator('.issue-list__key').allTextContents()).map((t) => t.trim());

test('pestañas, búsqueda con / y filtros quedan en la URL; recargar muestra lo mismo', async ({
  page,
}) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk');
  await page.getByRole('link', { name: 'Lista', exact: true }).click();

  await expect(page).toHaveURL(/\/proyectos\/p-tk\/issues$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Issues');
  // Activos: Por hacer y En curso.
  await expect.poll(() => keys(page)).toEqual(['TK-1', 'TK-2', 'TK-3']);
  const first = api.listQueries.at(-1)!;
  expect(first.getAll('states')).toEqual(['ISSUE_STATE_TODO', 'ISSUE_STATE_IN_PROGRESS']);
  expect(first.has('state')).toBe(false);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lista-1280.png`, fullPage: true });

  // `/` enfoca la búsqueda; se busca después de dejar de escribir.
  await page.locator('body').press('/');
  const search = page.getByRole('searchbox', { name: 'Buscar issues' });
  await expect(search).toBeFocused();
  await search.pressSequentially('LOGIN');
  await expect(page).toHaveURL(/q=LOGIN/);
  await expect.poll(() => keys(page)).toEqual(['TK-2']);
  // Una sola búsqueda por lo escrito, no una por tecla.
  expect(api.listQueries.filter((q) => q.get('query') === 'LOGIN')).toHaveLength(1);
  expect(api.listQueries.some((q) => q.get('query') === 'L')).toBe(false);

  // Hechos, con la búsqueda vaciada.
  await search.fill('');
  await search.press('Enter');
  await page.getByText('Hechos', { exact: true }).click();
  await expect(page).toHaveURL(/ver=hechos/);
  await expect.poll(() => keys(page)).toEqual(['TK-4']);

  // Todos, por prioridad: la URL lo recuerda al recargar.
  await page.getByText('Todos', { exact: true }).click();
  await page.getByLabel('Ordenar').selectOption({ label: 'Prioridad' });
  await expect(page).toHaveURL(/orden=prioridad/);
  await expect.poll(() => keys(page)).toEqual(['TK-2', 'TK-1', 'TK-4', 'TK-3', 'TK-5']);
  await page.reload();
  await expect.poll(() => keys(page)).toEqual(['TK-2', 'TK-1', 'TK-4', 'TK-3', 'TK-5']);
  await expect(page.getByLabel('Ordenar')).toHaveValue('prioridad');

  // Filtro por etiqueta y «Limpiar filtros».
  await page.getByLabel('Etiquetas').selectOption({ label: 'Frontend' });
  await expect.poll(() => keys(page)).toEqual(['TK-1']);
  expect(api.listQueries.at(-1)!.getAll('label_ids')).toEqual(['l-front']);
  await page.getByRole('searchbox').fill('nada que ver');
  await page.getByRole('searchbox').press('Enter');
  await expect(page.getByText('Ningún issue coincide')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
  await expect.poll(() => keys(page)).toHaveLength(5);
});

test('«Cargar más» pide la página siguiente con el mismo cursor y filtros', async ({ page }) => {
  await signIn(page);
  const many: FakeIssue[] = Array.from({ length: 7 }, (_, i) => ({
    id: `m${i + 1}`,
    projectId: 'p-tk',
    number: i + 1,
    title: `Issue ${i + 1}`,
    state: 'ISSUE_STATE_TODO',
    statusId: 's-todo',
    rank: String((i + 1) * 100).padStart(6, '0'),
  }));
  const api = await fakeApi(page, { issues: many, pageSize: 3 });
  await page.goto('/proyectos/p-tk/issues');

  await expect.poll(() => keys(page)).toEqual(['TK-1', 'TK-2', 'TK-3']);
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect.poll(() => keys(page)).toHaveLength(6);
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect.poll(() => keys(page)).toHaveLength(7);
  await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
  await expect(page.getByText('Mostrando 7')).toBeVisible();
  // Solo los de la lista (el tablero también trae los issues, sin filtros).
  const cursors = api.listQueries.filter((q) => q.has('states')).map((q) => q.get('page.cursor'));
  expect(cursors.filter(Boolean)).toHaveLength(2);
});

test('Descartados: quién y por qué, y Restaurar desde la fila', async ({ page }) => {
  await signIn(page);
  await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues?ver=descartados');

  await expect(page.getByText('Los descartados no aparecen en el tablero')).toBeVisible();
  await expect.poll(() => keys(page)).toEqual(['TK-5']);
  const row = page.locator('tr', { hasText: 'TK-5' });
  await expect(row).toContainText('Descartado por otro-uid:');
  await expect(row).toContainText('Lo cubre otro issue');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lista-descartados-1280.png`, fullPage: true });

  await row.getByRole('button', { name: 'Restaurar TK-5' }).click();
  await expect(page.getByText('Se restauraron 1')).toBeVisible();
  await expect(row).toContainText('Por hacer');
  await expect(row.getByRole('button', { name: 'Restaurar TK-5' })).toHaveCount(0);
});

test('selección múltiple: descartar con motivo y mover, reportando los que fallan', async ({
  page,
}) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues');
  await expect.poll(() => keys(page)).toEqual(['TK-1', 'TK-2', 'TK-3']);

  await select(page, 'Seleccionar TK-1');
  await select(page, 'Seleccionar TK-3');
  const bar = page.getByRole('region', { name: 'Acciones para los seleccionados' });
  await expect(bar).toContainText('2 seleccionados');

  await bar.getByRole('button', { name: 'Mover a…' }).click();
  await page.getByRole('menuitem', { name: 'Mover a En revisión' }).click();
  await expect(page.getByText('Se movieron 2')).toBeVisible();
  expect(api.calls.filter((c) => c.path.endsWith(':move'))).toHaveLength(2);
  await expect(page.locator('tr', { hasText: 'TK-1' })).toContainText('En revisión');

  // Descartar en lote: un solo motivo para todos; uno ya lo descartó otro.
  await select(page, 'Seleccionar todos');
  await expect(bar).toContainText('3 seleccionados');
  api.issues.find((i) => i.number === 2)!.statusId = 's-canceled';
  api.issues.find((i) => i.number === 2)!.state = 'ISSUE_STATE_CANCELED';
  await bar.getByRole('button', { name: 'Descartar…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Descartar 3 issues' });
  await dialog.getByLabel('Motivo').fill('Fuera de alcance');
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByText('Se descartaron 2')).toBeVisible();
  await expect(page.getByText('Fallaron 1')).toBeVisible();
  await expect(page.locator('.issue-list__failures')).toContainText('TK-2');
  // El que falló queda seleccionado para reintentar.
  await expect(page.getByRole('checkbox', { name: 'Seleccionar TK-2' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Seleccionar TK-1' })).not.toBeChecked();
});
