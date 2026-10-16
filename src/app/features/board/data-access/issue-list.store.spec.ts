import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError, type Issue, IssuesClient, type ListIssuesResponse } from '@/app/api';
import { BoardStore } from './board.store';
import { DEFAULT_FILTERS } from './issue-list.logic';
import { IssueListStore, LIST_PAGE_SIZE } from './issue-list.store';

const issue = (number: number, patch: Partial<Issue> = {}): Issue => ({
  id: `i${number}`,
  projectId: 'p1',
  number,
  title: `Issue ${number}`,
  description: '',
  state: 'ISSUE_STATE_TODO',
  priority: 'PRIORITY_MEDIUM',
  createdAt: '',
  updatedAt: '',
  rank: `0|a${number}`,
  statusId: 'todo',
  labelIds: [],
  discard: null,
  ...patch,
});

const page = (numbers: number[], nextCursor = ''): ListIssuesResponse => ({
  issues: numbers.map((n) => issue(n)),
  page: { nextCursor, hasNext: nextCursor !== '' },
});

const apiError = (status: number, code: string, reason = '') =>
  new DomainError({ status, code, reason, message: code, details: [], traceId: null });

describe('IssueListStore', () => {
  let listIssues: ReturnType<typeof vi.fn>;
  let board: Record<'moveTo' | 'discard' | 'restore', ReturnType<typeof vi.fn>> & {
    projectKey: () => string;
  };
  let store: IssueListStore;

  beforeEach(() => {
    listIssues = vi.fn(() => of(page([1, 2], 'c2')));
    board = { moveTo: vi.fn(), discard: vi.fn(), restore: vi.fn(), projectKey: () => 'TK' };
    TestBed.configureTestingModule({
      providers: [
        IssueListStore,
        { provide: IssuesClient, useValue: { listIssues } },
        { provide: BoardStore, useValue: board },
      ],
    });
    store = TestBed.inject(IssueListStore);
  });

  it('pide la primera página con los filtros y el tamaño de página', () => {
    store.load('p1', { ...DEFAULT_FILTERS, query: 'login', sort: 'cambio' });

    expect(listIssues).toHaveBeenCalledWith('p1', {
      query: 'login',
      states: ['ISSUE_STATE_TODO', 'ISSUE_STATE_IN_PROGRESS'],
      statusIds: [],
      priorities: [],
      labelIds: [],
      orderBy: 'ISSUE_ORDER_UPDATED_DESC',
      page: { cursor: '', limit: LIST_PAGE_SIZE },
    });
    expect(store.items().map((i) => i.number)).toEqual([1, 2]);
    expect(store.hasNext()).toBe(true);
  });

  it('con los mismos filtros no vuelve a pedir; con otros, descarta lo que estaba en vuelo', () => {
    store.load('p1', DEFAULT_FILTERS);
    store.load('p1', { ...DEFAULT_FILTERS, query: '  ' });
    expect(listIssues).toHaveBeenCalledTimes(1);

    const slow = new Subject<ListIssuesResponse>();
    listIssues.mockReturnValueOnce(slow).mockReturnValueOnce(of(page([7])));
    store.load('p1', { ...DEFAULT_FILTERS, scope: 'hechos' });
    store.load('p1', { ...DEFAULT_FILTERS, scope: 'todos' });
    slow.next(page([9]));

    expect(store.items().map((i) => i.number)).toEqual([7]);
  });

  it('cargar más agrega la página siguiente sin repetir', () => {
    store.load('p1', DEFAULT_FILTERS);
    listIssues.mockReturnValueOnce(of(page([2, 3])));

    store.loadMore();

    expect(listIssues.mock.calls[1]![1].page).toEqual({ cursor: 'c2', limit: LIST_PAGE_SIZE });
    expect(store.items().map((i) => i.number)).toEqual([1, 2, 3]);
    expect(store.hasNext()).toBe(false);
  });

  it('un cursor que el backend rechaza (INVALID_ARGUMENT) vuelve a la primera página', () => {
    store.load('p1', DEFAULT_FILTERS);
    listIssues
      .mockReturnValueOnce(throwError(() => apiError(400, 'INVALID_ARGUMENT')))
      .mockReturnValueOnce(of(page([5])));

    store.loadMore();

    expect(listIssues.mock.calls[2]![1].page.cursor).toBe('');
    expect(store.items().map((i) => i.number)).toEqual([5]);
    expect(store.moreError()).toBeNull();
  });

  it('otro error al cargar más (también un 400 que no es del cursor) se muestra sin perder lo cargado', () => {
    store.load('p1', DEFAULT_FILTERS);
    listIssues
      .mockReturnValueOnce(throwError(() => apiError(503, 'UNAVAILABLE')))
      .mockReturnValueOnce(throwError(() => apiError(400, 'FAILED_PRECONDITION')));

    store.loadMore();
    expect(store.items()).toHaveLength(2);
    expect(store.moreError()).toBe('UNAVAILABLE');

    store.loadMore();
    expect(listIssues).toHaveBeenCalledTimes(3);
    expect(store.items()).toHaveLength(2);
    expect(store.moreError()).toBe('FAILED_PRECONDITION');
  });

  it('acción en lote: en serie, reemplaza los que salen y deja seleccionados los que fallan', () => {
    store.load('p1', DEFAULT_FILTERS);
    store.toggleAll();
    expect(store.allSelected()).toBe(true);
    board.discard
      .mockReturnValueOnce(of(issue(1, { state: 'ISSUE_STATE_CANCELED' })))
      .mockReturnValueOnce(
        throwError(() => apiError(400, 'FAILED_PRECONDITION', 'ISSUE_ALREADY_DISCARDED')),
      );

    store.discardSelected({ reason: 'Fuera de alcance' }, () => true);

    expect(board.discard).toHaveBeenNthCalledWith(1, 1, { reason: 'Fuera de alcance' });
    expect(board.discard).toHaveBeenNthCalledWith(2, 2, { reason: 'Fuera de alcance' });
    // TK-1 quedó descartado: ya no es de Activos y sale de la lista.
    expect(store.items().map((i) => i.number)).toEqual([2]);
    expect([...store.selected()]).toEqual([2]);
    expect(store.bulk()).toBeNull();
    expect(store.bulkResult()).toEqual({
      action: 'discard',
      ok: 1,
      failed: [{ key: 'TK-2', message: 'FAILED_PRECONDITION' }],
    });
  });

  it('restaurar solo pide los descartados de la selección', () => {
    store.load('p1', DEFAULT_FILTERS);
    store.toggleAll();
    board.restore.mockReturnValue(of(issue(2)));

    store.restoreSelected((i) => i.number === 2);

    expect(board.restore).toHaveBeenCalledTimes(1);
    expect(board.restore).toHaveBeenCalledWith(2);
  });
});
