import { expect, test } from '@playwright/test';

import { REPO_API, fakeApi, signIn } from './support/fake-backend';

/**
 * Repos de GitHub y ramas ligadas (issue 016). API y Firebase mockeados; datos
 * inventados (org acme, repo api). Los webhooks y el ligado por nombre se
 * prueban en tekitla-issues: acá se ve lo que el panel muestra.
 */

test.use({ viewport: { width: 1280, height: 900 } });

const SHA = 'a'.repeat(40);

/** TK-1 con una rama y un PR abierto con CI fallido (CU-016-3 y 4). */
const LINKED = {
  repositories: [REPO_API],
  connections: [
    {
      id: 'c-acme',
      projectId: 'p-tk',
      provider: 'REPO_PROVIDER_GITHUB',
      host: 'github.com',
      owner: 'acme',
      scope: 'CONNECTION_SCOPE_TOPIC',
      topic: 'tekitla',
      repositoryCount: 1,
      createdAt: '2026-11-19T10:00:00Z',
      lastDeliveryAt: '2026-11-19T11:00:00Z',
    },
  ],
  links: [
    {
      id: 'l-1',
      issueNumber: 1,
      repo: REPO_API,
      branch: 'feat/tk-1-tablero',
      headSha: SHA,
      headTitle: 'feat: tablero',
      prNumber: 7,
      prTitle: 'Tablero',
      prState: 'PR_STATE_OPEN',
      ciStatus: 'CI_STATUS_FAILED',
      origin: 'LINK_ORIGIN_BRANCH_NAME',
      updatedBy: 'dev-prueba',
      updatedAt: '2026-11-19T11:00:00Z',
      webUrl: 'https://github.com/acme/api/pull/7',
    },
  ],
};

test('@CU-016-3 @CU-016-4 el detalle muestra la rama, el PR abierto y el CI fallido', async ({
  page,
}) => {
  await signIn(page);
  await fakeApi(page, { repos: LINKED });
  await page.goto('/proyectos/p-tk/issues/1');

  const links = page.locator('app-issue-links');
  await expect(links.getByRole('heading', { name: 'Ramas vinculadas' })).toBeVisible();
  await expect(links.getByRole('link', { name: 'feat/tk-1-tablero' })).toHaveAttribute(
    'href',
    'https://github.com/acme/api/pull/7',
  );
  await expect(links).toContainText('acme/api');
  await expect(links).toContainText('feat: tablero');
  await expect(links).toContainText('PR abierto');
  await expect(links).toContainText('#7');
  await expect(links).toContainText('CI fallido');
  await expect(links).toContainText('dev-prueba');
});

test('@CU-016-4 la tarjeta del tablero resume la rama con CI fallido', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { repos: LINKED });
  await page.goto('/proyectos/p-tk');

  const chip = page.locator('.issue-card__links');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveClass(/issue-card__links--failed/);
  await expect(chip).toContainText('1 rama(s): PR abierto, CI fallido');
});

test('ligar a mano una rama y quitarla', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page, { repos: { ...LINKED, links: [] } });
  await page.goto('/proyectos/p-tk/issues/2');

  const links = page.locator('app-issue-links');
  await expect(links).toContainText('Sin ramas vinculadas');
  await links.getByRole('button', { name: 'Vincular una rama' }).click();
  await links.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(links.getByText('Escribe el nombre de la rama.')).toBeVisible();
  await links.getByRole('textbox', { name: 'Rama' }).fill('spike/prueba');
  await links.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(links).toContainText('spike/prueba');
  expect(api.calls.some((c) => c.path === '/v1/projects/p-tk/issues/2/links')).toBe(true);

  await links.getByRole('button', { name: 'Quitar la rama spike/prueba' }).click();
  await expect(links).toContainText('Sin ramas vinculadas');
});

test('Ajustes › Repositorios: conectar la org con el topic y desconectarla', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page, {
    repos: { installUrl: 'https://github.com/apps/tekitla-qa/installations/new' },
  });
  await page.goto('/proyectos/p-tk/ajustes/repositorios');

  await expect(page.getByText('Todavía no hay ninguna organización conectada.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conectar GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/apps/tekitla-qa/installations/new?state=p-tk',
  );

  // Vuelta de GitHub (la Setup URL lleva acá con el installation_id).
  await page.goto('/proyectos/p-tk/ajustes/repositorios?installation_id=77');
  await expect(page.getByRole('heading', { name: 'Elegir los repos' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Topic' })).toHaveValue('tekitla');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Elegir los repos' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/installation_id/);
  const row = page.getByRole('row', { name: /acme/ });
  await expect(row).toContainText('Los de un topic');
  await expect(row).toContainText('tekitla');
  await expect(page.getByRole('link', { name: 'acme/api' })).toBeVisible();
  const connect = api.calls.find(
    (c) => c.method === 'POST' && c.path === '/v1/projects/p-tk/connections',
  );
  expect(connect?.body).toEqual({
    github: { installationId: '77' },
    scope: 'CONNECTION_SCOPE_TOPIC',
    topic: 'tekitla',
  });

  await page.getByRole('button', { name: 'Desconectar acme' }).click();
  await page
    .getByRole('group', { name: 'Desconectar acme' })
    .getByRole('button', { name: 'Desconectar' })
    .click();
  await expect(page.getByText('Todavía no hay ninguna organización conectada.')).toBeVisible();
});

test('Ajustes › Repositorios: una instalación desconocida muestra el error', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { repos: { installUrl: 'https://github.com/apps/x/installations/new' } });
  await page.goto('/proyectos/p-tk/ajustes/repositorios?installation_id=999');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('GitHub no reconoce esa instalación');
});

test('la Setup URL sin datos válidos no lleva a ningún proyecto', async ({ page }) => {
  await signIn(page);
  await fakeApi(page);
  await page.goto('/repositorios/github?installation_id=77&state=../otro');
  await expect(page.getByRole('alert')).toContainText('no trae los datos esperados');
});
