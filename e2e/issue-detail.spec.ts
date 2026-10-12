import { expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

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
