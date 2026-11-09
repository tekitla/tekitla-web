import { type Page, expect, test } from '@playwright/test';

import { ISSUES, fakeApi, signIn } from './support/fake-backend';

/**
 * Detalle de un issue (rebanada 3a): editar en el lugar, estado, prioridad,
 * etiquetas, actividad y comentarios. API y Firebase mockeados.
 */

const SHOTS = process.env['SCREENSHOT_DIR'];

test.use({ viewport: { width: 1280, height: 900 } });

test('renderiza el Markdown sanitizado', async ({ page }) => {
  await signIn(page);
  await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/1');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diseñar el tablero');
  await expect(page.getByRole('heading', { name: 'Objetivo' })).toBeVisible();
  await expect(page.locator('.issue-detail__main .ui-markdown strong')).toHaveText('mobile first');
  await expect(page.locator('.ui-markdown script')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
});

test('edita título y descripción, y cada cambio aparece en la actividad', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/1');

  const activity = page.locator('app-issue-activity');
  await expect(activity).toContainText('Tú');
  await expect(activity).toContainText('creó el issue');

  await page.getByRole('button', { name: 'Editar el título' }).click();
  const title = page.getByLabel('Título');
  await expect(title).toBeFocused();
  await title.fill('   ');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Escribe un título.')).toBeVisible();
  await title.fill('Diseñar el tablero v2');
  await title.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diseñar el tablero v2');
  await expect(activity).toContainText('cambió el título');

  await page.getByRole('button', { name: /Editar\s+Descripción/ }).click();
  await page.locator('#issue-description-input').fill('Nueva **descripción**');
  await page.getByRole('tab', { name: 'Vista previa' }).click();
  await expect(page.locator('.vrb-editor__preview strong')).toHaveText('descripción');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.issue-detail__main .ui-markdown').first()).toContainText(
    'Nueva descripción',
  );
  await expect(activity).toContainText('editó la descripción');

  const patches = api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body);
  expect(patches).toEqual([
    { title: 'Diseñar el tablero v2' },
    { description: 'Nueva **descripción**' },
  ]);
});

test('cambia estado, prioridad y etiquetas desde la barra lateral', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/1');
  const activity = page.locator('app-issue-activity');

  await page.getByLabel('Estado').selectOption({ label: 'En revisión' });
  await expect(page.locator('.vrb-page-header__description')).toContainText('En revisión');
  await expect(activity).toContainText('movió el issue');
  expect(api.calls.find((c) => c.path.endsWith(':move'))?.body).toEqual({
    statusId: 's-review',
  });

  await page.locator('label', { hasText: 'Urgente' }).click();
  await expect(page.getByRole('radio', { name: 'Urgente' })).toBeChecked();
  await expect(activity).toContainText('cambió la prioridad');

  // Las casillas de vrb están ocultas a la vista: se tocan por su etiqueta.
  const label = (name: string) => page.locator('.issue-detail__labels label', { hasText: name });
  await label('Backend').click();
  await expect(page.getByRole('checkbox', { name: 'Backend' })).toBeChecked();
  await expect(activity).toContainText('agregó');
  await label('Frontend').click();
  await expect(page.getByRole('checkbox', { name: 'Frontend' })).not.toBeChecked();
  await expect(activity).toContainText('quitó');
  const labels = api.calls.filter((c) => c.method === 'PATCH' && c.body?.['labels']);
  expect(labels.map((c) => c.body)).toEqual([
    { labels: { ids: ['l-front', 'l-back'] } },
    { labels: { ids: ['l-back'] } },
  ]);

  // Filtrar la actividad.
  await page.locator('app-issue-activity label', { hasText: 'Comentarios' }).click();
  await expect(activity.locator('.activity__empty')).toHaveText('Todavía no hay actividad.');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/issue-detalle-1280.png`, fullPage: true });
});

test('comenta (Markdown) y el comentario queda en la actividad', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/2');

  const box = page.getByLabel('Comentar', { exact: true });
  await box.fill('Listo para **revisar**');
  await box.press('Control+Enter');

  const comment = page.locator('.activity__comment');
  await expect(comment.locator('strong')).toHaveText('revisar');
  await expect(box).toHaveValue('');
  expect(api.calls.find((c) => c.path.endsWith('/comments'))?.body).toEqual({
    body: 'Listo para **revisar**',
  });
});

test('móvil: el detalle se apila sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/1');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('app-issue-activity')).toContainText('creó el issue');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/issue-detalle-375.png`, fullPage: true });
});

/**
 * Las líneas del historial, en orden: los textos de cada línea unidos con un
 * espacio (las insignias van pegadas en el template).
 */
const historyLines = (page: Page) =>
  page.locator('app-issue-activity .activity__line').evaluateAll((lines) =>
    lines.map((line) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const parts: string[] = [];
      while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? '');
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }),
  );

test('el historial cuenta cada cambio con su detalle, en orden, y sigue igual al recargar', async ({
  page,
}) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/1');
  const activity = page.locator('app-issue-activity');
  await expect(activity).toContainText('creó el issue');

  await page.getByRole('button', { name: 'Editar el título' }).click();
  await page.getByLabel('Título').fill('Tablero v2');
  await page.getByLabel('Título').press('Enter');
  await expect(activity).toContainText('cambió el título');
  await page.getByLabel('Estado').selectOption({ label: 'En revisión' });
  await expect(activity).toContainText('movió el issue');
  await page.locator('label', { hasText: 'Urgente' }).click();
  await expect(activity).toContainText('cambió la prioridad');
  await page.locator('.issue-detail__labels label', { hasText: 'Backend' }).click();
  await expect(activity).toContainText('agregó');
  await page.getByLabel('Comentar', { exact: true }).fill('Va **bien**');
  await page.getByLabel('Comentar', { exact: true }).press('Control+Enter');
  await expect(activity.locator('.activity__comment strong')).toHaveText('bien');

  const expected = [
    'Tú creó el issue',
    'Tú cambió el título Diseñar el tablero a Tablero v2',
    'Tú movió el issue Por hacer a En revisión',
    'Tú cambió la prioridad Alta a Urgente',
    'Tú agregó Backend',
    'Tú comentó',
  ];
  await expect.poll(() => historyLines(page)).toEqual(expected);

  // Recargar: todo sale de ListIssueEvents (nada quedó sólo en memoria).
  const before = api.calls.filter((c) => c.path.endsWith('/events')).length;
  await page.reload();
  await expect.poll(() => historyLines(page)).toEqual(expected);
  expect(api.calls.filter((c) => c.path.endsWith('/events')).length).toBeGreaterThan(before);
  await expect(activity.locator('.activity__comment strong')).toHaveText('bien');
  // El destino del movimiento lleva el tono de su categoría.
  await expect(activity.locator('.activity__item').nth(2).locator('.vrb-badge').last()).toHaveClass(
    /vrb-badge--info/,
  );

  // Filtros: sólo cambios / sólo comentarios.
  await activity.locator('label', { hasText: 'Cambios' }).click();
  await expect.poll(() => historyLines(page)).toEqual(expected.slice(0, 5));
  await activity.locator('label', { hasText: 'Comentarios' }).click();
  await expect.poll(() => historyLines(page)).toEqual(['Tú comentó']);
});

test('el historial largo se pagina con «Ver más actividad» y un cambio nuevo no lo corta', async ({
  page,
}) => {
  await signIn(page);
  const api = await fakeApi(page, { oldComments: 60 });
  await page.goto('/proyectos/p-tk/issues/1');
  const items = page.locator('app-issue-activity .activity__item');
  const more = page.getByRole('button', { name: 'Ver más actividad' });

  // Primera página: 50 de 61 (el alta + 60 comentarios de otra persona).
  await expect(items).toHaveCount(50);
  await expect(items.nth(1)).toContainText('otra-uid');
  await more.click();
  await expect(items).toHaveCount(61);
  await expect(more).toHaveCount(0);
  await expect(items.last()).toContainText('Comentario viejo 60');
  const pages = api.calls.filter((c) => c.path.endsWith('/events'));
  expect(pages).toHaveLength(2);

  // Un cambio después de ver todo: el historial se refresca entero, sin perder nada.
  await page.locator('label', { hasText: 'Urgente' }).click();
  await expect(items).toHaveCount(62);
  await expect(items.last()).toContainText('cambió la prioridad');
});

test('descarta con motivo, muestra quién y por qué, y restaura', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page);
  await page.goto('/proyectos/p-tk/issues/2');
  const activity = page.locator('app-issue-activity');

  // El selector de estado no ofrece los de descarte.
  await expect(page.getByLabel('Estado').locator('option', { hasText: 'Descartado' })).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Descartar…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Descartar TK-2' });
  await expect(dialog.getByLabel('Motivo')).toBeFocused();
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await expect(dialog.getByText('Escribe por qué se descarta.')).toBeVisible();
  expect(api.calls.some((c) => c.path.endsWith(':discard'))).toBe(false);

  await dialog.getByLabel('Motivo').fill('  Duplicado de TK-4 ');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/descartar-1280.png` });
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await expect(dialog).toBeHidden();
  expect(api.calls.find((c) => c.path.endsWith(':discard'))?.body).toEqual({
    reason: 'Duplicado de TK-4',
  });
  await expect(page.locator('.vrb-alert')).toContainText('Descartado por Tú:');
  await expect(page.locator('.vrb-alert')).toContainText('Duplicado de TK-4');
  await expect(activity).toContainText('descartó el issue');
  await expect(activity).toContainText('“Duplicado de TK-4”');

  await page.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('button', { name: 'Descartar…' })).toBeVisible();
  await expect(page.locator('.vrb-page-header__description')).toContainText('Por hacer');
  await expect(activity).toContainText('restauró el issue en');
});

test('uno descartado con MoveIssue (v0.3) dice «Descartado sin motivo»', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, {
    issues: ISSUES.map((i) => (i.number === 5 ? { ...i, discard: undefined } : i)),
  });
  await page.goto('/proyectos/p-tk/issues/5');
  await expect(page.locator('.vrb-alert')).toContainText('Descartado sin motivo');
});
