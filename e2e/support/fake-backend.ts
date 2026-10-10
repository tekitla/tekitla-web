import type { Page, Route } from '@playwright/test';

import { environment } from '../../src/environments/environment';

/**
 * Backend falso para los e2e: sesión de Firebase + API de Tequio, todo con
 * `page.route`. Los tests no dependen de Firebase real ni del gateway.
 */

export interface FakeIssue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  state?: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FakeProject {
  id: string;
  key: string;
  name: string;
  description?: string;
}

export interface FakeBackendOptions {
  projects?: FakeProject[];
  issues?: FakeIssue[];
  /** Fuerza un status en MoveIssue (p. ej. 500 para probar el rollback). */
  moveStatus?: number;
  /** Responde 403 a todo (cuenta fuera de la allowlist). */
  forbidden?: boolean;
}

export const PROJECT: FakeProject = {
  id: 'p-tq',
  key: 'TQ',
  name: 'Tequio',
  description: 'El tracker',
};

export const ISSUES: FakeIssue[] = [
  {
    id: 'i1',
    projectId: 'p-tq',
    number: 1,
    title: 'Diseñar el tablero',
    description: '## Objetivo\n\nTablero **mobile first**.\n\n<script>window.__xss = 1</script>',
    state: 'ISSUE_STATE_TODO',
    priority: 'PRIORITY_HIGH',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'i2',
    projectId: 'p-tq',
    number: 2,
    title: 'Login con Google',
    state: 'ISSUE_STATE_IN_PROGRESS',
    priority: 'PRIORITY_URGENT',
    createdAt: '2026-10-02T10:00:00Z',
  },
  {
    // Sin state ni priority: grpc-gateway omite los valores por defecto.
    id: 'i3',
    projectId: 'p-tq',
    number: 3,
    title: 'Importar issues desde docs',
    createdAt: '2026-10-03T10:00:00Z',
  },
  {
    id: 'i4',
    projectId: 'p-tq',
    number: 4,
    title: 'Deploy en QA',
    state: 'ISSUE_STATE_DONE',
    priority: 'PRIORITY_LOW',
    createdAt: '2026-10-04T10:00:00Z',
  },
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/** Sesión de Firebase ya iniciada (como si el usuario hubiera entrado antes). */
export async function signIn(page: Page): Promise<void> {
  const { apiKey } = environment.firebase;
  const user = {
    uid: 'e2e-uid',
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
            localId: 'e2e-uid',
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

/** Mockea el API de Tequio con estado en memoria. Devuelve los requests recibidos. */
export async function fakeApi(page: Page, options: FakeBackendOptions = {}) {
  const projects = structuredClone(options.projects ?? [PROJECT]);
  const issues = structuredClone(options.issues ?? ISSUES);
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  const base = new URL(environment.apiBaseUrl);

  await page.route(
    (url) => url.origin === base.origin && url.pathname.startsWith('/v1/'),
    async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

      const url = new URL(req.url());
      const body = req.postDataJSON() as Record<string, unknown> | null;
      calls.push({
        method: req.method(),
        path: url.pathname,
        body,
        auth: (await req.allHeaders())['authorization'] ?? null,
      });
      const reply = (status: number, json: unknown) =>
        route.fulfill({ status, headers: CORS, json });

      if (options.forbidden) return reply(403, { code: 7, message: 'forbidden', details: [] });

      const path = url.pathname;
      if (path === '/v1/projects' && req.method() === 'GET') {
        return reply(200, { projects, page: {} });
      }
      if (path === '/v1/projects' && req.method() === 'POST') {
        if (projects.some((p) => p.key === body?.['key'])) {
          return reply(409, { code: 6, message: 'project key already exists', details: [] });
        }
        const project = { id: `p-${projects.length + 1}`, ...(body as object) } as FakeProject;
        projects.push(project);
        return reply(200, { project });
      }

      const match = path.match(/^\/v1\/projects\/([^/]+)\/issues(?:\/(\d+)(:move)?)?$/);
      if (!match) return reply(404, { code: 5, message: 'not found', details: [] });
      const [, projectId, number, move] = match;
      if (!projects.some((p) => p.id === projectId)) {
        return reply(404, { code: 5, message: 'project not found', details: [] });
      }
      const own = issues.filter((i) => i.projectId === projectId);

      if (!number && req.method() === 'GET') return reply(200, { issues: own, page: {} });
      if (!number && req.method() === 'POST') {
        const issue: FakeIssue = {
          id: `i${issues.length + 1}`,
          projectId: projectId!,
          number: Math.max(0, ...own.map((i) => i.number)) + 1,
          title: String(body?.['title'] ?? ''),
          description: String(body?.['description'] ?? ''),
          state: 'ISSUE_STATE_TODO',
          priority: String(body?.['priority'] ?? 'PRIORITY_MEDIUM'),
          createdAt: new Date().toISOString(),
        };
        issues.push(issue);
        return reply(200, { issue });
      }

      const issue = own.find((i) => i.number === Number(number));
      if (!issue) return reply(404, { code: 5, message: 'issue not found', details: [] });
      if (move) {
        if (options.moveStatus && options.moveStatus >= 400) {
          return reply(options.moveStatus, { code: 13, message: 'boom', details: [] });
        }
        issue.state = String(body?.['state']);
        issue.updatedAt = new Date().toISOString();
        return reply(200, { issue });
      }
      return reply(200, { issue });
    },
  );

  return { calls, issues, projects };
}

function fakeJwt(): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: 'e2e-uid', iat: now, exp: now + 3600 })}.e2e`;
}
