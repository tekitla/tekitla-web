import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { MetricsClient } from './metrics.client';
import { toAgentSession, toListAgentSessions } from './metrics.mappers';

// Datos inventados.

describe('MetricsClient', () => {
  let http: HttpTestingController;
  let client: MetricsClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(MetricsClient);
  });

  it('GetFlowMetrics: período, zona, etiquetas repetidas y tope de estancados', async () => {
    const done = firstValueFrom(
      client.getFlowMetrics('p 1', {
        from: '2026-11-09T06:00:00.000Z',
        timeZone: 'America/Mexico_City',
        labelIds: ['l1', 'l2'],
        staleLimit: 10,
      }),
    );
    const req = http.expectOne((r) => r.url.endsWith('/v1/projects/p%201/flowMetrics'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-11-09T06:00:00.000Z');
    expect(req.request.params.get('time_zone')).toBe('America/Mexico_City');
    expect(req.request.params.getAll('label_ids')).toEqual(['l1', 'l2']);
    expect(req.request.params.get('stale_limit')).toBe('10');
    expect(req.request.params.has('to')).toBe(false);
    req.flush({ summary: { wip: 2 } });
    const m = await done;
    expect(m.summary.wip).toBe(2);
    expect(m.weeks).toEqual([]);
  });

  it('ListAgentSessions: sigue el cursor hasta el final', async () => {
    const done = firstValueFrom(client.listAllAgentSessions('p1'));
    const first = http.expectOne(
      (r) => r.url.endsWith('/v1/agentSessions') && !r.params.has('page.cursor'),
    );
    expect(first.request.params.get('project_id')).toBe('p1');
    expect(first.request.params.get('page.limit')).toBe('100');
    first.flush({ sessions: [{ id: 's1' }], page: { nextCursor: 'c2', hasNext: true } });
    const second = http.expectOne((r) => r.params.get('page.cursor') === 'c2');
    second.flush({ sessions: [{ id: 's2', issueNumber: '7' }], page: {} });
    const res = await done;
    expect(res.sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(res.sessions[1].issueNumber).toBe(7);
    expect(res.hasMore).toBe(false);
  });

  it('ListAgentSessions: avisa si quedaron páginas sin traer', async () => {
    const done = firstValueFrom(client.listAllAgentSessions('p1', 1));
    http
      .expectOne((r) => r.url.endsWith('/v1/agentSessions'))
      .flush({ sessions: [{ id: 's1' }], page: { nextCursor: 'c2', hasNext: true } });
    expect((await done).hasMore).toBe(true);
  });
});

describe('metrics.mappers: sesiones', () => {
  it('lo ausente queda con su valor por defecto', () => {
    expect(toAgentSession({ id: 's1' })).toMatchObject({
      id: 's1',
      status: 'SESSION_STATUS_UNSPECIFIED',
      waitingOn: 'WAITING_ON_UNSPECIFIED',
      issueNumber: 0,
      waitingText: '',
      endedAt: '',
    });
    expect(toListAgentSessions({})).toEqual({
      sessions: [],
      page: { nextCursor: '', hasNext: false },
    });
  });
});
