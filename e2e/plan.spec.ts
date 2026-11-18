import { type Page, expect, test } from '@playwright/test';

import {
  ACTORS,
  type FakeIssue,
  type FakeLabel,
  PROJECT,
  fakeApi,
  signIn,
} from './support/fake-backend';

/**
 * Vista Plan (issue 039) con el API y Firebase mockeados. Datos inventados:
 * perfiles escuela, familia y agente; un issue en dos perfiles; uno asignado
 * a un agente, otro a la persona, otro con un responsable sin cuenta
 * (`responsable/ana-perez`) y otro que espera a una persona.
 */

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Dónde guardar capturas (opcional): SCREENSHOT_DIR=... npm run test:e2e */
const SHOTS = process.env['SCREENSHOT_DIR'];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Largo a propósito: la tarjeta lo corta a 2 líneas. */
const NOTE =
  'que apruebe el texto del aviso a las familias, con el monto final de la inscripción y la fecha límite de pago para el ciclo que viene';

const LABELS: FakeLabel[] = [
  { id: 'l-esc', projectId: 'p-tk', name: 'perfil/escuela' },
  { id: 'l-fam', projectId: 'p-tk', name: 'perfil/familia' },
  { id: 'l-age', projectId: 'p-tk', name: 'perfil/agente' },
  { id: 'l-front', projectId: 'p-tk', name: 'area/front' },
  { id: 'l-ana', projectId: 'p-tk', name: 'responsable/ana-perez' },
  { id: 'l-wait', projectId: 'p-tk', name: 'espera/victor' },
];

const base = (number: number, patch: Partial<FakeIssue>): FakeIssue => ({
  id: `i${number}`,
  projectId: 'p-tk',
  number,
  title: `Issue ${number}`,
  state: 'ISSUE_STATE_TODO',
  statusId: 's-todo',
  priority: 'PRIORITY_MEDIUM',
  rank: `0${number}`,
  createdAt: daysAgo(60),
  updatedAt: daysAgo(2),
  ...patch,
});

const ISSUES: FakeIssue[] = [
  base(1, {
    title: 'Alta de grupos',
    labelIds: ['l-esc'],
    state: 'ISSUE_STATE_DONE',
    statusId: 's-done',
  }),
  base(2, {
    title: 'Chat con el agente desde la escuela',
    labelIds: ['l-esc', 'l-age'],
    state: 'ISSUE_STATE_IN_PROGRESS',
    statusId: 's-doing',
    assigneeActorId: 'act-claude',
  }),
  base(3, {
    title: 'Avisos a las familias',
    labelIds: ['l-fam', 'l-ana'],
    priority: 'PRIORITY_HIGH',
  }),
  base(4, { title: 'Ajustes generales', assigneeActorId: 'act-me' }),
  base(5, {
    title: 'Reporte viejo',
    labelIds: ['l-esc'],
    state: 'ISSUE_STATE_DONE',
    statusId: 's-done',
    updatedAt: daysAgo(45),
  }),
  base(6, {
    title: 'Pagos de inscripción',
    description: [
      '> **Estado:** `in-progress`',
      '> **Espera:** victor',
      `> **Qué espera:** ${NOTE}`,
      '',
      '## Descripción',
      '',
      '> **Qué espera:** esto ya no es la cabecera',
    ].join('\n'),
    labelIds: ['l-fam', 'l-wait', 'l-front'],
    state: 'ISSUE_STATE_IN_PROGRESS',
    statusId: 's-doing',
  }),
  base(7, {
    title: 'Descartado',
    labelIds: ['l-esc'],
    state: 'ISSUE_STATE_CANCELED',
    statusId: 's-canceled',
  }),
];

async function openPlan(page: Page, query = '') {
  await signIn(page);
  await fakeApi(page, { projects: [PROJECT], issues: ISSUES, labels: LABELS, actors: ACTORS });
  await page.goto(`/proyectos/p-tk/plan${query}`);
  await expect(page.locator('.plan__block').first()).toBeVisible();
}

const block = (page: Page, name: string) =>
  page.locator('.plan__block').filter({ has: page.getByRole('heading', { level: 2, name }) });
const lane = (page: Page, blockName: string, laneName: string) =>
  block(page, blockName)
    .locator('.plan__lane')
    .filter({ has: page.getByRole('heading', { level: 3, name: new RegExp(laneName) }) });
const total = (page: Page, name: string) =>
  page.locator('.plan__total').filter({ hasText: name }).locator('dd');

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('@CU-039-1 @CU-039-3 un bloque por perfil, tres carriles y totales sin repetir', async ({
    page,
  }) => {
    await openPlan(page);
    const titles = page.locator('.plan__block-title');
    await expect(titles).toHaveText(['Agente', 'Escuela', 'Familia', 'Sin categoría']);

    // TK-2 está en Agente y en Escuela, pero los totales lo cuentan una vez.
    await expect(lane(page, 'Agente', 'En curso')).toContainText('TK-2');
    await expect(lane(page, 'Escuela', 'En curso')).toContainText('TK-2');
    await expect(total(page, 'Hecho')).toHaveText('2');
    await expect(total(page, 'En curso')).toHaveText('2');
    await expect(total(page, 'Por hacer')).toHaveText('2');

    // Hechos: las últimas 4 semanas; «ver todos» trae el viejo. Los descartados no salen.
    const done = lane(page, 'Escuela', 'Hecho');
    await expect(done).toContainText('TK-1');
    await expect(done).not.toContainText('TK-5');
    await done.getByRole('button', { name: /Ver todos \(1/ }).click();
    await expect(done).toContainText('TK-5');
    await expect(page.locator('.plan')).not.toContainText('TK-7');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/plan-desktop.png`, fullPage: true });
  });

  test('@CU-039-2 el filtro va en la URL y sobrevive a recargar', async ({ page }) => {
    await openPlan(page);
    await page.getByRole('button', { name: 'Escuela', exact: true }).click();
    await expect(page).toHaveURL(/categoria=escuela/);
    await expect(page.locator('.plan__block-title')).toHaveText(['Escuela']);
    await expect(total(page, 'Hecho')).toHaveText('2');
    await expect(total(page, 'En curso')).toHaveText('1');

    await page.reload();
    await expect(page.locator('.plan__block-title')).toHaveText(['Escuela']);
    await expect(page.getByRole('button', { name: 'Escuela', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('@CU-039-4 @CU-039-9 quién atiende: agente con su herramienta, sin asignar y sin cuenta', async ({
    page,
  }) => {
    await openPlan(page);
    const agent = lane(page, 'Agente', 'En curso').locator('app-plan-card').first();
    await expect(agent.locator('.plan-card__name')).toHaveText('Claude Code PC-01');
    await expect(agent.locator('.plan-card__tool')).toHaveText('· Claude Code');
    await expect(agent.locator('.actor-avatar--agent ui-icon')).toBeVisible();

    const noAccount = lane(page, 'Familia', 'Por hacer').locator('.plan-card__who');
    await expect(noAccount).toHaveText(/Ana Perez · responsable sin cuenta/);
    await expect(noAccount).toHaveClass(/plan-card__who--no-account/);

    const none = lane(page, 'Familia', 'En curso').locator('.plan-card__who');
    await expect(none).toHaveText('Sin asignar');
  });

  test('@CU-039-7 el prefijo elegido se recuerda en el proyecto', async ({ page }) => {
    await openPlan(page);
    await page.getByRole('combobox').selectOption('area/');
    await expect(page.locator('.plan__block-title')).toHaveText(['Front', 'Sin categoría']);

    await page.goto('/proyectos/p-tk');
    await page.goto('/proyectos/p-tk/plan');
    await expect(page.locator('.plan__block-title')).toHaveText(['Front', 'Sin categoría']);
  });

  test('@CU-039-8 la caja «Esperan a victor» va arriba de los bloques', async ({ page }) => {
    await openPlan(page);
    const box = page.locator('.plan__waiting');
    await expect(box.getByRole('heading')).toContainText('Esperan a victor');
    await expect(box).toContainText('TK-6');
    await expect(box).not.toContainText('TK-2');
  });

  test('@CU-039-10 la caja muestra qué espera, en dos líneas y completo en el title', async ({
    page,
  }) => {
    await openPlan(page);
    const card = page.locator('.plan__waiting app-plan-card').filter({ hasText: 'TK-6' });
    const note = card.locator('.plan-card__note');
    await expect(note).toContainText(NOTE);
    await expect(note).toHaveAttribute('title', NOTE);
    await expect(card.getByRole('link', { name: /TK-6/ })).toHaveAttribute('title', NOTE);
    // Dos líneas como máximo: el texto completo no entra.
    const clipped = await note.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped).toBe(true);
    const lines = await note.evaluate(
      (el) => el.clientHeight / parseFloat(getComputedStyle(el).lineHeight),
    );
    expect(Math.round(lines)).toBe(2);

    // Fuera de la caja, la misma tarjeta no lo muestra.
    await expect(
      page
        .locator('.plan__block app-plan-card')
        .filter({ hasText: 'TK-6' })
        .locator('.plan-card__note'),
    ).toHaveCount(0);
    if (SHOTS)
      await page.locator('.plan__waiting').screenshot({ path: `${SHOTS}/plan-que-espera.png` });
  });

  test('la tarjeta abre el detalle en el panel lateral y Esc lo cierra', async ({ page }) => {
    await openPlan(page);
    await lane(page, 'Escuela', 'Hecho').getByRole('link', { name: /TK-1/ }).click();
    await expect(page).toHaveURL(/issue=TK-1/);
    const panel = page.getByRole('complementary', { name: 'Detalle de TK-1' });
    await expect(panel).toContainText('Alta de grupos');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/plan-panel.png` });
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page).not.toHaveURL(/issue=/);
  });
});

test.describe('móvil', () => {
  test.use({ viewport: MOBILE });

  test('los carriles van uno debajo del otro y la tarjeta abre la página', async ({ page }) => {
    await openPlan(page, '?categoria=familia');
    await expect(page.locator('.plan__block-title')).toHaveText(['Familia']);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/plan-movil.png`, fullPage: true });
    await page.getByRole('link', { name: /TK-3/ }).click();
    await expect(page).toHaveURL(/\/proyectos\/p-tk\/issues\/3$/);
  });
});
