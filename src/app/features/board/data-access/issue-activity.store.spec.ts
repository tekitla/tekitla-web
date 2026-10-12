import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type IssueEvent, IssuesClient, type ListIssueEventsResponse } from '@/app/api';
import { ACTIVITY_PAGE_SIZE, IssueActivityStore } from './issue-activity.store';

const event = (id: string): IssueEvent => ({
  id,
  issueId: 'i1',
  actorId: 'u1',
  createdAt: '',
  change: { kind: 'created' },
});

const page = (ids: string[], nextCursor = ''): ListIssueEventsResponse => ({
  events: ids.map(event),
  page: { nextCursor, hasNext: nextCursor !== '' },
});

describe('IssueActivityStore', () => {
  let client: Record<'listIssueEvents' | 'createComment', ReturnType<typeof vi.fn>>;
  let store: IssueActivityStore;
  /** Páginas del servidor por cursor ('' = la primera). */
  let pages: Record<string, ListIssueEventsResponse>;

  const ids = () => store.events().map((e) => e.id);

  beforeEach(() => {
    pages = { '': page(['e1', 'e2'], 'c2'), c2: page(['e3']) };
    client = {
      listIssueEvents: vi.fn((_p: string, _n: number, req: { cursor?: string }) =>
        of(pages[req.cursor ?? '']!),
      ),
      createComment: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [IssueActivityStore, { provide: IssuesClient, useValue: client }],
    });
    store = TestBed.inject(IssueActivityStore);
  });

  it('trae la primera página y loadMore suma la siguiente', () => {
    store.load('p1', 42);

    expect(client.listIssueEvents).toHaveBeenCalledWith('p1', 42, {
      cursor: '',
      limit: ACTIVITY_PAGE_SIZE,
    });
    expect(ids()).toEqual(['e1', 'e2']);
    expect(store.hasNext()).toBe(true);

    store.loadMore();

    expect(ids()).toEqual(['e1', 'e2', 'e3']);
    expect(store.hasNext()).toBe(false);
  });

  it('refresh con todo cargado vuelve a pedir todas las páginas (aparece lo nuevo)', () => {
    store.load('p1', 42);
    store.loadMore();
    pages['c2'] = page(['e3', 'e4']);
    client.listIssueEvents.mockClear();

    store.refresh();

    expect(client.listIssueEvents).toHaveBeenCalledTimes(2);
    expect(ids()).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('refresh a mitad de camino pide sólo las páginas que se veían', () => {
    store.load('p1', 42);
    client.listIssueEvents.mockClear();

    store.refresh();

    expect(client.listIssueEvents).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['e1', 'e2']);
  });

  it('cargar el mismo issue refresca; otro issue empieza de cero', () => {
    store.load('p1', 42);
    store.load('p1', 42);
    expect(ids()).toEqual(['e1', 'e2']);

    pages[''] = page(['x1']);
    store.load('p1', 7);
    expect(client.listIssueEvents).toHaveBeenLastCalledWith('p1', 7, expect.anything());
    expect(ids()).toEqual(['x1']);
  });

  it('comentar con el historial completo lo suma al final al instante', () => {
    pages[''] = page(['e1']);
    client.createComment.mockReturnValue(
      of({ id: 'c1', issueId: 'i1', authorId: 'u1', body: 'Hola', createdAt: 'T' }),
    );
    store.load('p1', 42);

    store.comment('Hola').subscribe();

    expect(client.createComment).toHaveBeenCalledWith('p1', 42, 'Hola');
    expect(store.events().at(-1)?.change).toMatchObject({
      kind: 'commented',
      comment: { body: 'Hola' },
    });
  });

  it('comentar con páginas pendientes no lo suma fuera de orden', () => {
    client.createComment.mockReturnValue(
      of({ id: 'c1', issueId: 'i1', authorId: 'u1', body: 'Hola', createdAt: 'T' }),
    );
    store.load('p1', 42);

    store.comment('Hola').subscribe();

    expect(ids()).toEqual(['e1', 'e2']);
  });
});
