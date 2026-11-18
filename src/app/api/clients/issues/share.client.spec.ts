import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { SKIP_AUTH } from '../../http/tokens';
import { ShareLinksClient, SharedClient } from './share.client';

describe('SharedClient y ShareLinksClient', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('la lectura pública es POST con el token en el cuerpo, sin sesión (SKIP_AUTH)', async () => {
    const client = TestBed.inject(SharedClient);
    const done = firstValueFrom(client.getProject('tks_secreto'));
    const req = http.expectOne((r) => r.url.endsWith('/v1/shared/project:get'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'tks_secreto' });
    expect(req.request.url).not.toContain('tks_secreto');
    expect(req.request.context.get(SKIP_AUTH)).toBe(true);
    req.flush({
      project: { key: 'DEMO', name: 'Demo' },
      scope: 'SHARE_LINK_SCOPE_PLAN',
      statuses: [{ id: 'todo', name: 'Por hacer', category: 'ISSUE_STATE_TODO' }],
      labels: [{ id: 'l1', name: 'perfil/escuela' }],
    });
    const view = await done;
    expect(view.project).toEqual({ key: 'DEMO', name: 'Demo', description: '' });
    expect(view.statuses[0]).toEqual({
      id: 'todo',
      name: 'Por hacer',
      category: 'ISSUE_STATE_TODO',
      color: 'LABEL_COLOR_UNSPECIFIED',
      wipLimit: 0,
      hidden: false,
    });
    expect(view.labels[0].color).toBe('LABEL_COLOR_UNSPECIFIED');
  });

  it('pide todas las páginas de issues y normaliza lo omitido', async () => {
    const client = TestBed.inject(SharedClient);
    const done = firstValueFrom(client.listAllIssues('tks_a'));
    const first = http.expectOne((r) => r.url.endsWith('/v1/shared/issues:list'));
    expect(first.request.body).toEqual({ token: 'tks_a', page: { cursor: undefined, limit: 100 } });
    first.flush({
      issues: [
        {
          number: 1,
          title: 'a',
          waitingNote: 'la firma',
          assignee: { kind: 'ACTOR_KIND_AGENT', displayName: 'Codex', tool: 'AGENT_TOOL_CODEX' },
        },
      ],
      page: { nextCursor: 'c2', hasNext: true },
    });
    const second = http.expectOne((r) => r.url.endsWith('/v1/shared/issues:list'));
    expect(second.request.body.page.cursor).toBe('c2');
    second.flush({ issues: [{ number: 2, title: 'b' }], page: {} });
    const issues = await done;
    expect(issues.map((i) => i.number)).toEqual([1, 2]);
    expect(issues[0]).toMatchObject({
      waitingNote: 'la firma',
      state: 'ISSUE_STATE_UNSPECIFIED',
      labelIds: [],
      assignee: { kind: 'ACTOR_KIND_AGENT', displayName: 'Codex', tool: 'AGENT_TOOL_CODEX' },
    });
    expect(issues[1].assignee).toBeNull();
  });

  it('la gestión va con la sesión, bajo el proyecto', async () => {
    const client = TestBed.inject(ShareLinksClient);
    const created = firstValueFrom(
      client.create('p/1', {
        scope: 'SHARE_LINK_SCOPE_PLAN',
        duration: 'SHARE_LINK_DURATION_SEVEN_DAYS',
        note: 'jefe',
        ownerDisplayName: 'Victor',
      }),
    );
    const req = http.expectOne((r) => r.url.endsWith('/v1/projects/p%2F1/share-links'));
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH)).toBe(false);
    req.flush({
      shareLink: { id: 's1', note: 'jefe', scope: 'SHARE_LINK_SCOPE_PLAN' },
      token: 'tks_x',
    });
    expect(await created).toMatchObject({
      token: 'tks_x',
      shareLink: { id: 's1', expiresAt: '', revokedAt: '' },
    });

    const revoked = firstValueFrom(client.revoke('p1', 's1'));
    const rev = http.expectOne((r) => r.url.endsWith('/v1/projects/p1/share-links/s1:revoke'));
    expect(rev.request.method).toBe('POST');
    rev.flush({ shareLink: { id: 's1', revokedAt: '2026-11-18T12:00:00Z' } });
    expect((await revoked).revokedAt).toBe('2026-11-18T12:00:00Z');
    http.verify();
  });
});
