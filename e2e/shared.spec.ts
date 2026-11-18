import { type Page, type Route, expect, test } from '@playwright/test';

import { environment } from '../src/environments/environment';
import { PROJECT, fakeApi, signIn } from './support/fake-backend';

/**
 * Enlaces de solo lectura (issue 009) con el API mockeado. Datos inventados.
 *
 * - Vista pública (sin sesión): `compartido/<token>` con alcance plan
 *   (CU-009-6) y panel (CU-009-1, CU-009-7); un enlace vencido o revocado
 *   (CU-009-2).
 * - Gestión (con sesión): Ajustes › Compartir crea, lista y revoca
 *   (CU-009-8).
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const PLAN_TOKEN = 'tks_plan0000000000000000000000000000000000000';
const PANEL_TOKEN = 'tks_panel000000000000000000000000000000000000';
const DEAD_TOKEN = 'tks_dead00000000000000000000000000000000000000';

/** Dónde guardar capturas (opcional): SCREENSHOT_DIR=... npm run test:e2e */
const SHOTS = process.env['SCREENSHOT_DIR'];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const STATUSES = [
  { id: 's-todo', name: 'Por hacer', category: 'ISSUE_STATE_TODO' },
  {
    id: 's-doing',
    name: 'En curso',
    category: 'ISSUE_STATE_IN_PROGRESS',
    color: 'LABEL_COLOR_INFO',
  },
  { id: 's-done', name: 'Hecho', category: 'ISSUE_STATE_DONE', color: 'LABEL_COLOR_SUCCESS' },
];
const LABELS = [
  { id: 'l-esc', name: 'perfil/escuela', color: 'LABEL_COLOR_INFO' },
  { id: 'l-fam', name: 'perfil/familia' },
  { id: 'l-wait', name: 'espera/victor' },
];

/** Issues tal como los manda el servicio: con alcance plan, sin descripción. */
function sharedIssues(scope: 'plan' | 'panel') {
  const panel = scope === 'panel';
  return [
    {
      number: 1,
      title: 'Alta de grupos',
      state: 'ISSUE_STATE_DONE',
      statusId: 's-done',
      priority: 'PRIORITY_MEDIUM',
      labelIds: ['l-esc'],
      createdAt: daysAgo(30),
      updatedAt: daysAgo(3),
    },
    {
      number: 2,
      title: 'Chat con el agente',
      state: 'ISSUE_STATE_IN_PROGRESS',
      statusId: 's-doing',
      priority: 'PRIORITY_HIGH',
      labelIds: ['l-esc'],
      assignee: { kind: 'ACTOR_KIND_AGENT', displayName: 'Codex PC-01', tool: 'AGENT_TOOL_CODEX' },
      description: panel ? 'Detalle **del agente** para el compañero.' : undefined,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(1),
    },
    {
      number: 3,
      title: 'Pagos de inscripción',
      state: 'ISSUE_STATE_TODO',
      statusId: 's-todo',
      priority: 'PRIORITY_MEDIUM',
      labelIds: ['l-fam', 'l-wait'],
      assignee: { kind: 'ACTOR_KIND_PERSON', displayName: 'Victor' },
      description: panel
        ? '> **Qué espera:** que apruebe el monto\n\n## Descripción\n\nTexto interno.'
        : undefined,
      waitingNote: panel ? undefined : 'que apruebe el monto',
      createdAt: daysAgo(10),
      updatedAt: daysAgo(1),
    },
  ];
}

/** Mockea la lectura pública por token. Devuelve los requests recibidos. */
async function fakeShared(page: Page) {
  const calls: { path: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const base = new URL(environment.apiBaseUrl);
  await page.route(
    (url) => url.origin === base.origin && url.pathname.startsWith('/v1/shared/'),
    async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      const path = new URL(req.url()).pathname;
      calls.push({ path, body, auth: (await req.allHeaders())['authorization'] ?? null });
      const reply = (status: number, json: unknown) =>
        route.fulfill({ status, headers: CORS, json });
      const notFound = () =>
        reply(404, { error: { code: 'NOT_FOUND', message: 'not found', request_id: 'e2e' } });
      if (req.method() !== 'POST') return notFound();
      const scope =
        body['token'] === PLAN_TOKEN ? 'plan' : body['token'] === PANEL_TOKEN ? 'panel' : null;
      if (!scope) return notFound();
      if (path === '/v1/shared/project:get') {
        return reply(200, {
          project: { key: 'DEMO', name: 'Proyecto demo' },
          scope: scope === 'plan' ? 'SHARE_LINK_SCOPE_PLAN' : 'SHARE_LINK_SCOPE_PANEL',
          statuses: STATUSES,
          labels: LABELS,
        });
      }
      if (path === '/v1/shared/issues:list')
        return reply(200, { issues: sharedIssues(scope), page: {} });
      if (path === '/v1/shared/issues:get' && scope === 'panel') {
        const issue = sharedIssues('panel').find((i) => i.number === body['number']);
        return issue ? reply(200, { issue }) : notFound();
      }
      return notFound();
    },
  );
  return calls;
}

test.describe('enlace de solo lectura (sin sesión)', () => {
  test('@CU-009-6 alcance plan: la vista Plan sin edición, sin tablero ni detalle', async ({
    page,
  }) => {
    const calls = await fakeShared(page);
    await page.goto(`/compartido/${PLAN_TOKEN}`);

    await expect(page.getByText('Solo lectura', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /Plan/ })).toBeVisible();
    // Totales, bloques por categoría y «Esperan a victor» con lo que espera.
    await expect(
      page.locator('.plan__total').filter({ hasText: 'Hecho' }).locator('dd'),
    ).toHaveText('1');
    await expect(page.locator('.plan__block-title')).toHaveText(['Escuela', 'Familia']);
    const waiting = page.locator('.plan__waiting');
    await expect(waiting.getByRole('heading')).toContainText('Esperan a victor');
    await expect(waiting.locator('.plan-card__note')).toHaveText(/que apruebe el monto/);
    // Las tarjetas no son enlaces: no hay detalle con este alcance.
    await expect(page.locator('.plan app-plan-card a')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/compartido-plan.png`, fullPage: true });
    // Ni navegación al tablero, ni botones de edición.
    await expect(page.getByRole('link', { name: 'Tablero' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Mover|Nuevo|Editar|Descartar/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Ajustes|Compartir/ })).toHaveCount(0);

    // Pedir un issue con este token: no hay detalle.
    await page.goto(`/compartido/${PLAN_TOKEN}/issues/2`);
    await expect(page.getByText('Este enlace solo muestra la vista Plan.')).toBeVisible();

    // El token va en el cuerpo, nunca con la sesión.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.body['token']).toBe(PLAN_TOKEN);
      expect(call.auth).toBeNull();
    }
  });

  test('@CU-009-1 @CU-009-7 alcance panel: tablero, detalle y Plan sin edición', async ({
    page,
  }) => {
    await fakeShared(page);
    await page.goto(`/compartido/${PANEL_TOKEN}`);

    // CU-009-1: el tablero, sin un solo botón de edición.
    await expect(page.getByRole('heading', { level: 2, name: 'En curso' })).toBeVisible();
    await expect(page.locator('app-issue-card')).toHaveCount(3);
    await expect(page.locator('.issue-card__move')).toHaveCount(0);
    await expect(page.locator('[cdkdrag], .cdk-drag')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Mover|Nuevo|Editar|Descartar|Crear/ }),
    ).toHaveCount(0);
    await expect(page.getByText('Codex PC-01')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/compartido-tablero.png`, fullPage: true });

    // CU-009-7: del tablero al detalle.
    await page.getByRole('link', { name: /DEMO-2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/compartido/${PANEL_TOKEN}/issues/2$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Chat con el agente' })).toBeVisible();
    await expect(page.locator('ui-markdown strong')).toHaveText('del agente');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/compartido-detalle.png`, fullPage: true });

    // Y al Plan, cuyas tarjetas llevan al detalle del enlace.
    await page.getByRole('link', { name: 'Plan' }).click();
    await expect(page.locator('.plan__block-title')).toHaveText(['Escuela', 'Familia']);
    await expect(page.locator('.plan__waiting .plan-card__note')).toHaveText(
      /que apruebe el monto/,
    );
    await page
      .locator('.plan__waiting')
      .getByRole('link', { name: /DEMO-3/ })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pagos de inscripción' }),
    ).toBeVisible();

    // Sin acceso a otros proyectos: no hay enlaces fuera de /compartido.
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs) expect(href.startsWith('/compartido/')).toBe(true);
  });

  test('@CU-009-2 un enlace vencido o revocado: 404 sin decir por qué', async ({ page }) => {
    await fakeShared(page);
    await page.goto(`/compartido/${DEAD_TOKEN}`);
    await expect(page.getByText('Este enlace no existe o ya no es válido')).toBeVisible();
    await expect(page.locator('app-issue-card, app-plan-card')).toHaveCount(0);
    // Sin redirigir al login.
    await expect(page).toHaveURL(new RegExp(`/compartido/${DEAD_TOKEN}$`));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/compartido-404.png` });
  });

  test('la página no se indexa ni manda Referer', async ({ page }) => {
    await fakeShared(page);
    await page.goto(`/compartido/${PLAN_TOKEN}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  });
});

test.describe('Ajustes › Compartir (con sesión)', () => {
  test('@CU-009-8 crea, lista y revoca: el token se ve una sola vez', async ({ page }) => {
    await signIn(page);
    await fakeApi(page);
    type Link = Record<string, string>;
    const links: Link[] = [
      {
        id: 'sl-1',
        projectId: PROJECT.id,
        scope: 'SHARE_LINK_SCOPE_PANEL',
        note: 'compañero',
        createdAt: daysAgo(5),
        lastUsedAt: daysAgo(1),
        ownerDisplayName: 'Victor',
      },
    ];
    const base = new URL(environment.apiBaseUrl);
    const created: Record<string, unknown>[] = [];
    await page.route(
      (url) => url.origin === base.origin && url.pathname.includes('/share-links'),
      async (route: Route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        const path = new URL(req.url()).pathname;
        const reply = (json: unknown) => route.fulfill({ status: 200, headers: CORS, json });
        if (req.method() === 'GET') return reply({ shareLinks: links });
        const revoke = path.match(/share-links\/([^/:]+):revoke$/);
        if (revoke) {
          const link = links.find((l) => l.id === revoke[1])!;
          link['revokedAt'] = new Date().toISOString();
          return reply({ shareLink: link });
        }
        const body = req.postDataJSON() as Record<string, unknown>;
        created.push(body);
        const link: Link = {
          id: 'sl-2',
          projectId: PROJECT.id,
          scope: String(body['scope']),
          note: String(body['note']),
          createdAt: new Date().toISOString(),
          expiresAt: daysAgo(-30),
          ownerDisplayName: String(body['ownerDisplayName'] ?? ''),
        };
        links.unshift(link);
        return reply({ shareLink: link, token: 'tks_nuevo000000000000000000000000000000000000' });
      },
    );

    await page.goto(`/proyectos/${PROJECT.id}`);
    await page.getByRole('link', { name: 'Compartir' }).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${PROJECT.id}/ajustes/compartir$`));
    await expect(page.getByRole('row', { name: /compañero/ })).toContainText('Vigente');

    // Crear: alcance plan, 30 días, para «jefe», con el nombre de la sesión.
    await page.getByLabel('Para quién es').fill('jefe');
    await expect(page.getByLabel(/Cómo te ven/)).toHaveValue('Victor');
    await page.getByRole('button', { name: 'Crear enlace' }).click();
    const url = page.getByRole('textbox', { name: 'Enlace de solo lectura' });
    await expect(url).toHaveValue(/\/compartido\/tks_nuevo0+$/);
    expect(created[0]).toEqual({
      scope: 'SHARE_LINK_SCOPE_PLAN',
      duration: 'SHARE_LINK_DURATION_THIRTY_DAYS',
      note: 'jefe',
      ownerDisplayName: 'Victor',
    });
    await expect(page.getByRole('row', { name: /jefe/ })).toContainText('Solo la vista Plan');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/ajustes-compartir.png`, fullPage: true });
    // Se ve una sola vez: al cerrar el aviso, el token ya no está en la página.
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByText('tks_nuevo')).toHaveCount(0);
    expect(await page.content()).not.toContain('tks_nuevo');

    // Revocar uno: pide confirmar y el otro sigue vigente.
    await page.getByRole('button', { name: 'Revocar el enlace «compañero»' }).click();
    await page
      .getByRole('group', { name: 'Revocar el enlace «compañero»' })
      .getByRole('button', { name: 'Revocar' })
      .click();
    await expect(page.getByRole('row', { name: /compañero/ })).toContainText('Revocado');
    await expect(page.getByRole('row', { name: /jefe/ })).toContainText('Vigente');
  });
});
