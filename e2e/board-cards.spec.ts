import { type Page, expect, test } from '@playwright/test';

import { fakeApi, signIn } from './support/fake-backend';

/**
 * Tarjetas del tablero (issue 033, parte 2): asignado y densidad, con el API
 * y Firebase mockeados. TK-1 lo tiene el agente «Claude Code PC-01», TK-2 la
 * persona del usuario (Victor, por su sesión), TK-3 nadie y TK-4 un agente
 * revocado.
 */

const DESKTOP = { width: 1280, height: 800 };

/** Dónde guardar capturas (opcional): SCREENSHOT_DIR=... npm run test:e2e */
const SHOTS = process.env['SCREENSHOT_DIR'];

const card = (page: Page, key: string) =>
  page.locator('app-issue-card').filter({ hasText: new RegExp(`${key}\\b`) });

async function openBoard(page: Page, options: Parameters<typeof fakeApi>[1] = {}) {
  await signIn(page);
  const api = await fakeApi(page, options);
  await page.goto('/proyectos/p-tk');
  await expect(page.locator('.board__column').first()).toBeVisible();
  return api;
}

async function chooseDensity(page: Page, name: 'Cómoda' | 'Compacta') {
  await page.getByRole('button', { name: /^Vista/ }).click();
  await page.getByRole('menuitemradio', { name }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('@CU-033-5 una tarjeta con un agente muestra su nombre y el icono de su herramienta', async ({
    page,
  }) => {
    const api = await openBoard(page);
    await chooseDensity(page, 'Cómoda');

    const agent = card(page, 'TK-1').locator('.issue-card__who');
    await expect(agent.locator('.issue-card__agent-name')).toHaveText('Claude Code PC-01');
    await expect(agent.locator('.actor-avatar--agent ui-icon')).toBeVisible();
    await expect(agent).toContainText(
      'Asignado: Claude Code PC-01, agente de Claude Code de Victor',
    );

    // Una persona: solo sus iniciales (el nombre sale de la sesión).
    const person = card(page, 'TK-2').locator('.issue-card__who');
    await expect(person.locator('.actor-avatar')).toHaveText('VI');
    await expect(person.locator('.issue-card__agent-name')).toHaveCount(0);
    await expect(person).toContainText('Asignado: Victor');

    // Sin asignar y agente revocado (sigue a la vista, atenuado).
    await expect(card(page, 'TK-3')).toContainText('Sin asignar');
    const revoked = card(page, 'TK-4').locator('.issue-card__who');
    await expect(revoked.locator('.actor-avatar--revoked')).toBeVisible();
    await expect(revoked).toContainText('Codex nube, agente de la nube de Victor · revocado');

    // Los revocados se piden: un issue puede seguir asignado a uno.
    const actors = api.calls.filter((c) => c.path === '/v1/actors');
    expect(actors).toHaveLength(1);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tarjetas-comodas.png` });
  });

  test('en compacta, el agente es su avatar con el nombre para el lector', async ({ page }) => {
    await openBoard(page);
    const agent = card(page, 'TK-1').locator('.issue-card__who');
    await expect(agent.locator('.actor-avatar--agent')).toBeVisible();
    await expect(agent).toHaveAttribute(
      'title',
      'Claude Code PC-01, agente de Claude Code de Victor',
    );
    await expect(card(page, 'TK-3').locator('.issue-card__who')).toHaveCount(0);
    // «Mover» queda como icono, con su nombre accesible.
    await expect(
      card(page, 'TK-1').getByRole('button', { name: 'Mover TK-1 a otra columna' }),
    ).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tarjetas-compactas.png` });
  });

  test('si ListActors falla, el tablero se ve igual, sin asignados', async ({ page }) => {
    await openBoard(page, { actorsFail: true });
    await expect(card(page, 'TK-1')).toBeVisible();
    await expect(page.locator('.issue-card__who')).toHaveCount(0);
  });

  test('@CU-033-7 la densidad elegida sigue después de recargar', async ({ page }) => {
    await openBoard(page);
    // La primera vez: compacta.
    await expect(card(page, 'TK-1').locator('.issue-card--compact')).toBeVisible();

    await chooseDensity(page, 'Cómoda');
    await expect(card(page, 'TK-1').locator('.issue-card--compact')).toHaveCount(0);
    await page.reload();
    await expect(card(page, 'TK-1')).toBeVisible();
    await expect(card(page, 'TK-1').locator('.issue-card--compact')).toHaveCount(0);

    await chooseDensity(page, 'Compacta');
    await page.reload();
    await expect(card(page, 'TK-1').locator('.issue-card--compact')).toBeVisible();

    // El menú marca la elegida.
    await page.getByRole('button', { name: /^Vista/ }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Compacta' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('menuitemradio', { name: 'Cómoda' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('tk.tablero.vista.TK') ?? '{}')),
    ).toMatchObject({ density: 'compacta' });
  });
});
