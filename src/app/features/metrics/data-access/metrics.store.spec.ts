import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MetricsClient } from '@/app/api';
import type { FlowMetrics } from '@/app/api';
import { toFlowMetrics } from '@/app/api/clients/issues/metrics.mappers';
import { AgentsStore, MetricsStore } from './metrics.store';

const empty = (): FlowMetrics => toFlowMetrics({});

describe('MetricsStore', () => {
  let client: {
    getFlowMetrics: ReturnType<typeof vi.fn>;
    listAgentSessions: ReturnType<typeof vi.fn>;
  };
  let store: MetricsStore;

  beforeEach(() => {
    client = { getFlowMetrics: vi.fn(), listAgentSessions: vi.fn() };
    TestBed.configureTestingModule({
      providers: [MetricsStore, AgentsStore, { provide: MetricsClient, useValue: client }],
    });
    store = TestBed.inject(MetricsStore);
  });

  it('pide desde el lunes de hace N-1 semanas, con la zona y las etiquetas', () => {
    client.getFlowMetrics.mockReturnValue(of(empty()));
    store.load({ projectId: 'p1', weeks: 4, labelIds: ['l1'] }, new Date(2026, 10, 18, 15, 0));
    const [projectId, req] = client.getFlowMetrics.mock.calls[0];
    expect(projectId).toBe('p1');
    expect(new Date(req.from).getDate()).toBe(26);
    expect(req.labelIds).toEqual(['l1']);
    expect(req.timeZone).toBeTruthy();
    expect(store.view()).not.toBeNull();
  });

  it('la misma consulta no vuelve a pedir; una respuesta vieja se ignora', () => {
    const slow = new Subject<FlowMetrics>();
    client.getFlowMetrics.mockReturnValueOnce(slow).mockReturnValueOnce(of(empty()));
    store.load({ projectId: 'p1', weeks: 12, labelIds: [] });
    store.load({ projectId: 'p1', weeks: 12, labelIds: [] });
    expect(client.getFlowMetrics).toHaveBeenCalledTimes(1);
    store.load({ projectId: 'p1', weeks: 4, labelIds: [] });
    const fresh = store.metrics();
    slow.next({ ...empty(), staleTotal: 99 });
    expect(store.metrics()).toBe(fresh);
    expect(store.metrics()?.staleTotal).toBe(0);
  });

  it('un error se ve', () => {
    client.getFlowMetrics.mockReturnValue(throwError(() => new Error('x')));
    store.load({ projectId: 'p1', weeks: 12, labelIds: [] });
    expect(store.error()).toBe(true);
    expect(store.loading()).toBe(false);
  });
});

describe('AgentsStore', () => {
  let client: {
    getFlowMetrics: ReturnType<typeof vi.fn>;
    listAgentSessions: ReturnType<typeof vi.fn>;
  };
  let store: AgentsStore;

  beforeEach(() => {
    client = { getFlowMetrics: vi.fn(), listAgentSessions: vi.fn() };
    TestBed.configureTestingModule({
      providers: [AgentsStore, { provide: MetricsClient, useValue: client }],
    });
    store = TestBed.inject(AgentsStore);
  });

  it('pide las del proyecto y un refresco que falla conserva la lista', () => {
    const at = new Date('2026-11-19T10:00:00Z');
    client.listAgentSessions.mockReturnValueOnce(
      of({ sessions: [{ id: 's1' }], page: { nextCursor: '', hasNext: false } }),
    );
    store.load('p1', () => at);
    expect(client.listAgentSessions).toHaveBeenCalledWith({ projectId: 'p1', limit: 100 });
    expect(store.sessions().length).toBe(1);
    expect(store.updatedAt()).toBe(at);

    client.listAgentSessions.mockReturnValueOnce(throwError(() => new Error('x')));
    store.load('p1');
    expect(store.error()).toBe(true);
    expect(store.sessions().length).toBe(1);
  });
});
