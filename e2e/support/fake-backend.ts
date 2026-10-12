import type { Page, Route } from '@playwright/test';

import { environment } from '../../src/environments/environment';

/**
 * Backend falso para los e2e: sesión de Firebase + API de Tekitla (contrato
 * `issues.v1` de tekitla-protos 0.3.0), todo con `page.route`. Los tests no
 * dependen de Firebase real ni del gateway. Los errores salen con el sobre del
 * gateway: `{"error": {"code", "message"}}`.
 */

export interface FakeIssue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  state?: string;
  statusId?: string;
  priority?: string;
  rank?: string;
  labelIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FakeProject {
  id: string;
  key: string;
  name: string;
  description?: string;
}

export interface FakeStatus {
  id: string;
  projectId: string;
  name: string;
  category: string;
  rank: string;
}

export interface FakeLabel {
  id: string;
  projectId: string;
  name: string;
  color?: string;
}

export interface FakeBackendOptions {
  projects?: FakeProject[];
  issues?: FakeIssue[];
  statuses?: FakeStatus[];
  labels?: FakeLabel[];
  /**
   * Fuerza un error en MoveIssue: 500 (rollback) o 400 (FAILED_PRECONDITION,
   * vista vieja).
   */
  moveStatus?: number;
  /** Responde 403 a todo (cuenta fuera de la allowlist). */
  forbidden?: boolean;
}

export const PROJECT: FakeProject = {
  id: 'p-tk',
  key: 'TK',
  name: 'Tekitla',
  description: 'El tracker',
};

/** Los cuatro con los que nace todo proyecto, más uno propio («En revisión»). */
export const STATUSES: FakeStatus[] = [
  { id: 's-todo', projectId: 'p-tk', name: 'Por hacer', category: 'ISSUE_STATE_TODO', rank: 'a' },
  {
    id: 's-doing',
    projectId: 'p-tk',
    name: 'En curso',
    category: 'ISSUE_STATE_IN_PROGRESS',
    rank: 'b',
  },
  {
    id: 's-review',
    projectId: 'p-tk',
    name: 'En revisión',
    category: 'ISSUE_STATE_IN_PROGRESS',
    rank: 'c',
  },
  { id: 's-done', projectId: 'p-tk', name: 'Hecho', category: 'ISSUE_STATE_DONE', rank: 'd' },
  {
    id: 's-canceled',
    projectId: 'p-tk',
    name: 'Descartado',
    category: 'ISSUE_STATE_CANCELED',
    rank: 'e',
  },
];

export const LABELS: FakeLabel[] = [
  { id: 'l-front', projectId: 'p-tk', name: 'Frontend', color: 'LABEL_COLOR_INFO' },
  { id: 'l-back', projectId: 'p-tk', name: 'Backend', color: 'LABEL_COLOR_ACCENT' },
];

export const ISSUES: FakeIssue[] = [
  {
    id: 'i1',
    projectId: 'p-tk',
    number: 1,
    title: 'Diseñar el tablero',
    description: '## Objetivo\n\nTablero **mobile first**.\n\n<script>window.__xss = 1</script>',
    state: 'ISSUE_STATE_TODO',
    statusId: 's-todo',
    priority: 'PRIORITY_HIGH',
    rank: '000100',
    labelIds: ['l-front'],
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'i2',
    projectId: 'p-tk',
    number: 2,
    title: 'Login con Google',
    state: 'ISSUE_STATE_IN_PROGRESS',
    statusId: 's-doing',
    priority: 'PRIORITY_URGENT',
    rank: '000200',
    createdAt: '2026-10-02T10:00:00Z',
  },
  {
    // Sin state, statusId ni priority: grpc-gateway omite los valores por
    // defecto (y un issue sin statusId cae en el primer estado de su categoría).
    id: 'i3',
    projectId: 'p-tk',
    number: 3,
    title: 'Importar issues desde docs',
    rank: '000300',
    createdAt: '2026-10-03T10:00:00Z',
  },
  {
    id: 'i4',
    projectId: 'p-tk',
    number: 4,
    title: 'Deploy en QA',
    state: 'ISSUE_STATE_DONE',
    statusId: 's-done',
    priority: 'PRIORITY_LOW',
    rank: '000400',
    createdAt: '2026-10-04T10:00:00Z',
  },
  {
    id: 'i5',
    projectId: 'p-tk',
    number: 5,
    title: 'Probar en Safari',
    state: 'ISSUE_STATE_CANCELED',
    statusId: 's-canceled',
    rank: '000500',
    createdAt: '2026-10-05T10:00:00Z',
  },
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const UID = 'e2e-uid';

/** Sesión de Firebase ya iniciada (como si el usuario hubiera entrado antes). */
export async function signIn(page: Page): Promise<void> {
  const { apiKey } = environment.firebase;
  const user = {
    uid: UID,
    email: 'victor@example.com',
    emailVerified: true,
    displayName: 'Victor',
    isAnonymous: false,
    providerData: [],
    stsTokenManager: {
      refreshToken: 'e2e-refresh',
      accessToken: fakeJwt(),
      expirationTime: Date.now() + 3_600_000,
    },
    createdAt: '1700000000000',
    lastLoginAt: '1700000000000',
    apiKey,
    appName: '[DEFAULT]',
  };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    `firebase:authUser:${apiKey}:[DEFAULT]`,
    JSON.stringify(user),
  ] as const);
  // Al restaurar la sesión Firebase recarga el usuario (accounts:lookup).
  await page.route(/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/, (route) =>
    route.fulfill({
      headers: CORS,
      json: {
        users: [
          {
            localId: UID,
            email: 'victor@example.com',
            emailVerified: true,
            displayName: 'Victor',
            providerUserInfo: [],
          },
        ],
      },
    }),
  );
  await page.route(/securetoken\.googleapis\.com/, (route) =>
    route.fulfill({
      headers: CORS,
      json: { id_token: fakeJwt(), refresh_token: 'e2e-refresh', expires_in: '3600' },
    }),
  );
}

type Body = Record<string, unknown> | null;
type Event = Record<string, unknown> & { id: string; issueId: string };

/** Mockea el API de Tekitla con estado en memoria. Devuelve los requests recibidos. */
export async function fakeApi(page: Page, options: FakeBackendOptions = {}) {
  const projects = structuredClone(options.projects ?? [PROJECT]);
  const issues = structuredClone(options.issues ?? ISSUES);
  const statuses = structuredClone(options.statuses ?? STATUSES);
  const labels = structuredClone(options.labels ?? LABELS);
  const events: Event[] = issues.map((i) => ({
    id: `e-${i.id}-created`,
    issueId: i.id,
    actorId: UID,
    createdAt: i.createdAt,
    created: {},
  }));
  const calls: { method: string; path: string; body: Body; auth: string | null }[] = [];
  const base = new URL(environment.apiBaseUrl);
  let seq = 100;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  const now = () => new Date().toISOString();

  const byRank = <T extends { rank?: string }>(a: T, b: T) =>
    (a.rank ?? '') < (b.rank ?? '') ? -1 : (a.rank ?? '') > (b.rank ?? '') ? 1 : 0;
  const sortedStatuses = (projectId: string) =>
    statuses.filter((s) => s.projectId === projectId).sort(byRank);
  const statusOf = (issue: FakeIssue) =>
    statuses.find((s) => s.id === issue.statusId) ??
    sortedStatuses(issue.projectId).find(
      (s) => s.category === (issue.state ?? 'ISSUE_STATE_TODO'),
    )!;
  const column = (projectId: string, statusId: string) =>
    issues.filter((i) => i.projectId === projectId && statusOf(i).id === statusId).sort(byRank);
  const log = (issue: FakeIssue, change: Record<string, unknown>) =>
    events.push({ id: nextId('e'), issueId: issue.id, actorId: UID, createdAt: now(), ...change });

  await page.route(
    (url) => url.origin === base.origin && url.pathname.startsWith('/v1/'),
    async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

      const url = new URL(req.url());
      const method = req.method();
      const body = req.postDataJSON() as Body;
      calls.push({
        method,
        path: url.pathname,
        body,
        auth: (await req.allHeaders())['authorization'] ?? null,
      });
      const reply = (status: number, json: unknown) =>
        route.fulfill({ status, headers: CORS, json });
      const fail = (status: number, code: string, message: string) =>
        reply(status, { error: { code, message, request_id: 'e2e' } });

      if (options.forbidden) return fail(403, 'PERMISSION_DENIED', 'forbidden');

      const path = url.pathname;
      if (path === '/v1/projects' && method === 'GET') return reply(200, { projects, page: {} });
      if (path === '/v1/projects' && method === 'POST') {
        if (projects.some((p) => p.key === body?.['key'])) {
          return fail(409, 'ALREADY_EXISTS', 'project key already exists');
        }
        const project = { id: `p-${projects.length + 1}`, ...(body as object) } as FakeProject;
        projects.push(project);
        return reply(200, { project });
      }

      const project = path.match(/^\/v1\/projects\/([^/]+)\/(.+)$/);
      if (!project || !projects.some((p) => p.id === project[1])) {
        return fail(404, 'NOT_FOUND', 'project not found');
      }
      const projectId = project[1]!;
      const rest = project[2]!;

      // ── Estados ───────────────────────────────────────────────────────────
      if (rest === 'statuses' && method === 'GET') {
        return reply(200, { statuses: sortedStatuses(projectId) });
      }
      if (rest === 'statuses' && method === 'POST') {
        const list = sortedStatuses(projectId);
        if (list.length >= 20) return fail(400, 'FAILED_PRECONDITION', 'max statuses');
        if (list.some((s) => s.name.toLowerCase() === String(body?.['name']).toLowerCase())) {
          return fail(409, 'ALREADY_EXISTS', 'status name already exists');
        }
        const status: FakeStatus = {
          id: nextId('s'),
          projectId,
          name: String(body?.['name']),
          category: String(body?.['category']),
          rank: `${list.at(-1)?.rank ?? ''}z`,
        };
        statuses.push(status);
        return reply(200, { status });
      }
      const statusMatch = rest.match(/^statuses\/([^/]+)$/);
      if (statusMatch) {
        const status = statuses.find((s) => s.id === statusMatch[1] && s.projectId === projectId);
        if (!status) return fail(404, 'NOT_FOUND', 'status not found');
        if (method === 'PATCH') {
          if (typeof body?.['name'] === 'string') status.name = body['name'];
          if (typeof body?.['afterStatusId'] === 'string') {
            const others = sortedStatuses(projectId).filter((s) => s.id !== status.id);
            const at = body['afterStatusId']
              ? others.findIndex((s) => s.id === body['afterStatusId']) + 1
              : 0;
            others.splice(at, 0, status);
            others.forEach((s, i) => (s.rank = String.fromCharCode(97 + i)));
          }
          return reply(200, { status });
        }
        if (method === 'DELETE') {
          const sameCategory = statuses.filter(
            (s) => s.projectId === projectId && s.category === status.category,
          );
          if (sameCategory.length === 1) {
            return fail(400, 'FAILED_PRECONDITION', 'last status of its category');
          }
          const own = column(projectId, status.id);
          const target = statuses.find((s) => s.id === url.searchParams.get('moveToStatusId'));
          if (own.length && !target) {
            return fail(400, 'FAILED_PRECONDITION', 'status has issues');
          }
          for (const issue of own) {
            issue.statusId = target!.id;
            issue.state = target!.category;
          }
          statuses.splice(statuses.indexOf(status), 1);
          return reply(200, {});
        }
      }

      // ── Etiquetas ─────────────────────────────────────────────────────────
      if (rest === 'labels' && method === 'GET') {
        const own = labels.filter((l) => l.projectId === projectId);
        return reply(200, { labels: own.sort((a, b) => a.name.localeCompare(b.name)) });
      }
      if (rest === 'labels' && method === 'POST') {
        if (labels.some((l) => l.name.toLowerCase() === String(body?.['name']).toLowerCase())) {
          return fail(409, 'ALREADY_EXISTS', 'label name already exists');
        }
        const label: FakeLabel = {
          id: nextId('l'),
          projectId,
          name: String(body?.['name']),
          color: String(body?.['color'] ?? 'LABEL_COLOR_NEUTRAL'),
        };
        labels.push(label);
        return reply(200, { label });
      }
      const labelMatch = rest.match(/^labels\/([^/]+)$/);
      if (labelMatch) {
        const label = labels.find((l) => l.id === labelMatch[1]);
        if (!label) return fail(404, 'NOT_FOUND', 'label not found');
        if (method === 'PATCH') {
          if (typeof body?.['name'] === 'string') label.name = body['name'];
          if (typeof body?.['color'] === 'string') label.color = body['color'];
          return reply(200, { label });
        }
        if (method === 'DELETE') {
          labels.splice(labels.indexOf(label), 1);
          for (const issue of issues)
            issue.labelIds = issue.labelIds?.filter((id) => id !== label.id);
          return reply(200, {});
        }
      }

      // ── Issues ────────────────────────────────────────────────────────────
      const own = issues.filter((i) => i.projectId === projectId);
      if (rest === 'issues' && method === 'GET') {
        return reply(200, { issues: [...own].sort(byRank), page: {} });
      }
      if (rest === 'issues' && method === 'POST') {
        const first = sortedStatuses(projectId).find((s) => s.category === 'ISSUE_STATE_TODO')!;
        const issue: FakeIssue = {
          id: `i${issues.length + 1}`,
          projectId,
          number: Math.max(0, ...own.map((i) => i.number)) + 1,
          title: String(body?.['title'] ?? ''),
          description: String(body?.['description'] ?? ''),
          state: 'ISSUE_STATE_TODO',
          statusId: first.id,
          priority: String(body?.['priority'] ?? 'PRIORITY_MEDIUM'),
          rank: String(Math.max(0, ...own.map((i) => Number(i.rank ?? 0))) + 100).padStart(6, '0'),
          createdAt: now(),
        };
        issues.push(issue);
        log(issue, { created: {} });
        return reply(200, { issue });
      }

      const issueMatch = rest.match(/^issues\/(\d+)(:move|\/comments|\/events)?$/);
      const issue = issueMatch && own.find((i) => i.number === Number(issueMatch[1]));
      if (!issueMatch || !issue) return fail(404, 'NOT_FOUND', 'issue not found');
      const action = issueMatch[2];

      if (action === ':move') {
        if (options.moveStatus && options.moveStatus >= 400) {
          const code = options.moveStatus === 400 ? 'FAILED_PRECONDITION' : 'INTERNAL';
          return fail(options.moveStatus, code, 'boom');
        }
        const to = statuses.find((s) => s.id === body?.['statusId']);
        if (!to) return fail(400, 'INVALID_ARGUMENT', 'unknown status');
        const after = Number(body?.['afterNumber'] ?? 0);
        const before = Number(body?.['beforeNumber'] ?? 0);
        const target = column(projectId, to.id).filter((i) => i.number !== issue.number);
        const ai = after ? target.findIndex((i) => i.number === after) : -1;
        const bi = before ? target.findIndex((i) => i.number === before) : target.length;
        // Vecinos que ya no están en esa columna o no son contiguos: vista vieja.
        const stale =
          (after && ai < 0) ||
          (before && bi < 0) ||
          (after && before && bi !== ai + 1) ||
          (after && !before && ai !== target.length - 1) ||
          (before && !after && bi !== 0);
        if (stale) {
          return fail(400, 'FAILED_PRECONDITION', 'stale order');
        }
        if (after || before) {
          const low = after
            ? Number(target[ai]!.rank)
            : before
              ? Number(target[bi]!.rank) - 100
              : 0;
          const high = before ? Number(target[bi]!.rank) : low + 100;
          issue.rank = String(Math.floor((low + high) / 2)).padStart(6, '0');
        }
        const from = statusOf(issue);
        issue.statusId = to.id;
        issue.state = to.category;
        issue.updatedAt = now();
        if (from.id !== to.id) {
          log(issue, {
            statusChanged: {
              fromStatusId: from.id,
              fromStatusName: from.name,
              fromState: from.category,
              toStatusId: to.id,
              toStatusName: to.name,
              toState: to.category,
            },
          });
        }
        return reply(200, { issue });
      }

      if (action === '/comments' && method === 'POST') {
        const comment = {
          id: nextId('c'),
          issueId: issue.id,
          authorId: UID,
          body: String(body?.['body'] ?? ''),
          createdAt: now(),
        };
        log(issue, { commented: comment });
        return reply(200, { comment });
      }

      if (action === '/events' && method === 'GET') {
        return reply(200, { events: events.filter((e) => e.issueId === issue.id), page: {} });
      }

      if (method === 'PATCH') {
        if (typeof body?.['title'] === 'string' && body['title'] !== issue.title) {
          log(issue, { titleChanged: { from: issue.title, to: body['title'] } });
          issue.title = body['title'];
        }
        if (typeof body?.['description'] === 'string') {
          issue.description = body['description'];
          log(issue, { descriptionChanged: {} });
        }
        if (typeof body?.['priority'] === 'string') {
          log(issue, { priorityChanged: { from: issue.priority, to: body['priority'] } });
          issue.priority = body['priority'];
        }
        const labelIds = (body?.['labels'] as { ids?: string[] } | undefined)?.ids;
        if (labelIds) {
          const before = issue.labelIds ?? [];
          const name = (id: string) => labels.find((l) => l.id === id)?.name ?? id;
          const added = labelIds.filter((id) => !before.includes(id));
          const removed = before.filter((id) => !labelIds.includes(id));
          issue.labelIds = labelIds;
          log(issue, {
            labelsChanged: {
              addedLabelIds: added,
              removedLabelIds: removed,
              addedLabelNames: added.map(name),
              removedLabelNames: removed.map(name),
            },
          });
        }
        issue.updatedAt = now();
        return reply(200, { issue });
      }

      return reply(200, { issue });
    },
  );

  return { calls, issues, statuses, labels };
}

function fakeJwt(): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: UID, iat: now, exp: now + 3600 })}.e2e`;
}
