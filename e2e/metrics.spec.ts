import { type Page, expect, test } from '@playwright/test';

import { type FakeIssue, PROJECT, fakeApi, signIn } from './support/fake-backend';

/**
 * Páginas «Métricas» y «Agentes» (issue 036) con el API y Firebase
 * mockeados. Datos inventados: 12 semanas con histórico aproximado, una
 * semana sin cerrados, etiquetas de valor y sesiones en cada grupo.
 */

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };
const SHOTS = process.env['SCREENSHOT_DIR'];
const DAY = 86_400;

function monday(weeksAgo: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * weeksAgo);
  return d;
}

const dur = (days: number) => `${Math.round(days * DAY)}s`;

function fakeFlowMetrics() {
  const weeks = Array.from({ length: 12 }, (_, k) => {
    const i = 11 - k;
    const start = monday(i);
    const end = i === 0 ? new Date() : monday(i - 1);
    const closed = [2, 3, 1, 4, 0, 3, 5, 2, 4, 3, 6, 2][k];
    const lead = closed
      ? { count: closed, median: dur(3 + (k % 4)), p85: dur(8 + (k % 5) * 2) }
      : { count: 0 };
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      leadTime: lead,
      cycleTime: closed ? { count: closed, median: dur(1 + (k % 3)), p85: dur(4 + (k % 3)) } : {},
      closedValue: Math.max(0, closed - 1),
      closedOther: closed ? 1 : 0,
      started: [3, 2, 2, 4, 1, 3, 2, 4, 3, 2, 3, 1][k],
      wip: [6, 5, 6, 6, 7, 7, 6, 8, 7, 6, 5, 6][k],
      source: {
        confidence: k < 6 ? 'METRIC_CONFIDENCE_APPROXIMATE' : 'METRIC_CONFIDENCE_RECORDED',
      },
    };
  });
  return {
    from: weeks[0].start,
    to: new Date().toISOString(),
    timeZone: 'America/Mexico_City',
    weeks,
    summary: {
      leadTime: { count: 35, median: dur(4), p85: dur(14.5) },
      cycleTime: { count: 35, median: dur(1.5), p85: dur(5) },
      closedValue: 26,
      closedOther: 9,
      started: 30,
      wip: 6,
      source: { confidence: 'METRIC_CONFIDENCE_APPROXIMATE', live: 20, importHistory: 15 },
    },
    stale: [
      {
        number: 3,
        title: 'Migrar el importador',
        statusId: 's-doing',
        inProgressSince: new Date(Date.now() - 60 * DAY * 1000).toISOString(),
        lastActivityAt: new Date(Date.now() - 41 * DAY * 1000).toISOString(),
        confidence: 'METRIC_CONFIDENCE_APPROXIMATE',
      },
    ],
    staleTotal: 1,
    valueLabelIds: ['l-feat'],
    coverage: { issues: 40, doneWithoutDates: 2 },
  };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const session = (id: string, issueNumber: number, patch: Record<string, unknown>) => ({
  id,
  source: 'SESSION_SOURCE_HERDR',
  externalId: id,
  agentDisplayName: 'Claude Code PC-01',
  machine: 'PC-01',
  projectId: 'p-tk',
  issueNumber,
  sessionName: `tk-issue-${issueNumber}`,
  status: 'SESSION_STATUS_IDLE',
  statusChangedAt: minutesAgo(5),
  lastSeenAt: minutesAgo(1),
  ...patch,
});

const SESSIONS = [
  session('a', 2, {
    waitingOn: 'WAITING_ON_PERSON',
    waitingReason: 'WAITING_REASON_DECISION',
    statusChangedAt: minutesAgo(25),
    waitingText: '🙋 ¿Publico la versión nueva?',
  }),
  session('b', 1, { status: 'SESSION_STATUS_WORKING', statusChangedAt: minutesAgo(70) }),
  session('c', 3, {
    status: 'SESSION_STATUS_WAITING_OK',
    waitingOn: 'WAITING_ON_OTHER',
    waitingTarget: 'CI de protos',
    statusChangedAt: minutesAgo(12),
  }),
  session('d', 4, {
    status: 'SESSION_STATUS_STALLED',
    statusChangedAt: minutesAgo(40),
    lastSeenAt: minutesAgo(15),
  }),
  session('e', 1, { statusChangedAt: minutesAgo(3) }),
];

const ISSUES: FakeIssue[] = [1, 2, 3, 4].map((number) => ({
  id: `i${number}`,
  projectId: 'p-tk',
  number,
  title: ['Página de métricas', 'Vista de agentes', 'Migrar el importador', 'Recolector en Linux'][
    number - 1
  ],
  description: '',
  state: 'ISSUE_STATE_IN_PROGRESS',
  priority: 'PRIORITY_MEDIUM',
  statusId: 's-doing',
  rank: `a${number}`,
  labelIds: [],
  createdAt: minutesAgo(10_000),
  updatedAt: minutesAgo(100),
}));

const H = 3600;
const sec = (s: number) => `${s}s`;

/** Parte 3: 3 h trabajando y 5 h esperando (4 h por una revisión), y la señal. */
function withSessions() {
  const m = fakeFlowMetrics();
  const efficiency = {
    working: sec(3 * H),
    waitingHuman: sec(5 * H),
    blocked: sec(H),
    idle: sec(2 * H),
    efficiencyBp: 3333,
    issues: 2,
    waitingHumanByReason: [
      { reason: 'WAITING_REASON_REVIEW', duration: sec(4 * H) },
      { reason: 'WAITING_REASON_UNSPECIFIED', duration: sec(H) },
    ],
  };
  const last = m.weeks.length - 1;
  return {
    ...m,
    sessionsRecordedSince: m.weeks[last].start,
    weeks: m.weeks.map((w, i) => (i === last ? { ...w, efficiency } : w)),
    summary: {
      ...m.summary,
      efficiency,
      humanQueue: {
        pending: 1,
        oldestPending: sec(90 * 60),
        responseTime: { count: 2, median: sec(2 * H), p85: sec(4 * H) },
      },
    },
    hiringSignal: {
      verdict: 'HIRING_VERDICT_INSUFFICIENT_DATA',
      liveWeeks: 0,
      weeksNeeded: 8,
      weeksNeededPreliminary: 4,
    },
  };
}

async function open(page: Page, path: string, flowMetrics: unknown = fakeFlowMetrics()) {
  await signIn(page);
  const api = await fakeApi(page, {
    issues: ISSUES,
    labels: [{ id: 'l-feat', projectId: 'p-tk', name: 'feature' }],
    flowMetrics,
    agentSessions: SESSIONS,
  });
  await page.goto(`/proyectos/${PROJECT.id}/${path}`);
  return api;
}

test.describe('Métricas (036)', () => {
  test('@CU-036-9 tarjetas, tendencias, tabla y sin rankings por persona', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const api = await open(page, 'metricas');

    await expect(page.getByRole('heading', { level: 1, name: /Métricas/ })).toBeVisible();
    await expect(page.getByText('4 d', { exact: true })).toBeVisible();
    await expect(page.getByText('≈ Histórico aproximado')).toBeVisible();
    await expect(page.getByRole('img', { name: /lead time por semana/ })).toBeVisible();
    await expect(page.getByText('Migrar el importador').first()).toBeVisible();
    await expect(page.getByText(/41 días sin actividad/)).toBeVisible();
    // Parte 3: dice desde cuándo se mide, sin inventar números.
    await expect(page.getByText(/Todavía no hay historia de sesiones/)).toBeVisible();
    await expect(page.getByText(/faltan 4\./)).toBeVisible();
    // CU-036-9: ningún nombre de persona ni de agente en la página.
    await expect(page.getByText('Claude Code PC-01')).toHaveCount(0);

    // Pide 12 semanas desde un lunes, con la zona del navegador.
    const call = api.calls.find((c) => c.path.endsWith('/flowMetrics'));
    expect(call).toBeTruthy();

    // Hover: tooltip con la semana. El gráfico mide su ancho después del
    // primer render: se reintenta hasta que el tooltip aparece.
    const chart = page.getByRole('img', { name: /lead time por semana/ });
    await expect(async () => {
      const box = (await chart.boundingBox())!;
      await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
      await expect(page.locator('.week-chart__tip').first()).toBeVisible({ timeout: 1000 });
    }).toPass();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/metricas-desktop.png`, fullPage: true });

    // «Ver como tabla».
    await page.getByRole('button', { name: 'Ver como tabla' }).first().click();
    await expect(page.getByRole('columnheader', { name: 'Percentil 85' })).toBeVisible();

    // Cambiar el período lo pone en la URL.
    await page.getByRole('button', { name: '4 sem' }).click();
    await expect(page).toHaveURL(/semanas=4/);
  });

  test('@CU-036-6 dónde se va el tiempo, la cola humana y la señal', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, 'metricas', withSessions());

    await expect(page.getByText('33.33 %')).toBeVisible();
    await expect(page.getByRole('img', { name: /Barra del tiempo medido/ })).toBeVisible();
    await expect(page.getByText(/Espera a una persona · 5 h/)).toBeVisible();
    await expect(page.getByText('Revisión de código')).toBeVisible();
    await expect(page.getByText('4 h · 80 %')).toBeVisible();
    await expect(page.getByText('1.5 h', { exact: true })).toBeVisible();
    await expect(page.getByText(/Registrado en vivo desde/)).toBeVisible();
    await expect(page.getByText('Datos insuficientes')).toBeVisible();
    await expect(page.getByText(/faltan 4\./)).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/metricas-tiempo.png`, fullPage: true });
  });

  test('móvil', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await open(page, 'metricas');
    await expect(page.getByText('4 d', { exact: true })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/metricas-movil.png`, fullPage: true });
  });
});

test.describe('Agentes (026 y 036)', () => {
  test('primero lo que espera a una persona, después lo colgado', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, 'agentes');

    const groups = page.locator('.agents__group-title');
    await expect(groups.first()).toContainText('Esperan a una persona');
    await expect(groups.nth(1)).toContainText('Colgadas');
    await expect(page.getByText('TK-2')).toBeVisible();
    await expect(page.getByText('Vista de agentes')).toBeVisible();
    await expect(page.getByText(/esperando hace 2\d min/)).toBeVisible();
    await expect(page.getByText(/motivo: Decisión de producto/)).toBeVisible();
    await expect(page.getByText('espera a «CI de protos»', { exact: false })).toBeVisible();
    // En reposo va plegado.
    await expect(page.getByText(/en reposo hace/)).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/agentes-desktop.png`, fullPage: true });
    await page.getByRole('button', { name: 'Mostrar' }).click();
    await expect(page.getByText(/en reposo hace \d min/)).toBeVisible();
  });
});
