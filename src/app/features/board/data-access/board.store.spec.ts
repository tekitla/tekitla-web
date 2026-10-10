import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError, type Issue, IssuesClient, type Project } from '@/app/api';
import { BoardStore } from './board.store';

const project: Project = {
  id: 'p1',
  key: 'TQ',
  name: 'Tequio',
  description: '',
  createdAt: '',
  updatedAt: '',
};

const issue = (number: number, patch: Partial<Issue> = {}): Issue => ({
  id: `i${number}`,
  projectId: 'p1',
  number,
  title: `Issue ${number}`,
  description: '',
  state: 'ISSUE_STATE_TODO',
  priority: 'PRIORITY_MEDIUM',
  createdAt: `2026-10-0${number}T00:00:00Z`,
  updatedAt: '',
  rank: `0|a${number}`,
  ...patch,
});

const apiError = (status: number) =>
  new DomainError({ status, message: `HTTP ${status}`, details: [], traceId: null });

type ClientMock = Record<
  'listAllProjects' | 'listAllIssues' | 'moveIssue' | 'createIssue' | 'getIssue',
  ReturnType<typeof vi.fn>
>;

describe('BoardStore', () => {
  let client: ClientMock;
  let store: BoardStore;

  const numbersIn = (state: keyof ReturnType<BoardStore['columns']>) =>
    store.columns()[state].map((i) => i.number);

  beforeEach(() => {
    client = {
      listAllProjects: vi.fn(() => of([project])),
      listAllIssues: vi.fn(() =>
        of([issue(1), issue(2, { state: 'ISSUE_STATE_IN_PROGRESS' }), issue(3)]),
      ),
      moveIssue: vi.fn(),
      createIssue: vi.fn(),
      getIssue: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [BoardStore, { provide: IssuesClient, useValue: client }],
    });
    store = TestBed.inject(BoardStore);
    store.load('p1');
  });

  it('carga proyecto e issues agrupados en columnas', () => {
    expect(store.project()?.key).toBe('TQ');
    expect(numbersIn('ISSUE_STATE_TODO')).toEqual([1, 3]);
    expect(numbersIn('ISSUE_STATE_IN_PROGRESS')).toEqual([2]);
    expect(store.loading()).toBe(false);
  });

  it('proyecto que no está en la lista del usuario = no encontrado', () => {
    client.listAllProjects.mockReturnValue(of([]));
    store.load('otro');
    expect(store.notFound()).toBe(true);
  });

  it('un 404 al listar issues = no encontrado', () => {
    client.listAllIssues.mockReturnValue(throwError(() => apiError(404)));
    store.load('otro');
    expect(store.notFound()).toBe(true);
    expect(store.error()).toBeNull();
  });

  describe('move (optimista)', () => {
    it('mueve al instante, marca pendiente y confirma con la respuesta', () => {
      const response = new Subject<Issue>();
      client.moveIssue.mockReturnValue(response);

      store.move(1, 'ISSUE_STATE_DONE');

      expect(client.moveIssue).toHaveBeenCalledWith('p1', 1, 'ISSUE_STATE_DONE');
      expect(numbersIn('ISSUE_STATE_DONE')).toEqual([1]);
      expect(store.isPending(1)).toBe(true);

      response.next(issue(1, { state: 'ISSUE_STATE_DONE', updatedAt: '2026-10-10T00:00:00Z' }));

      expect(store.isPending(1)).toBe(false);
      expect(store.issues().find((i) => i.number === 1)?.updatedAt).toBe('2026-10-10T00:00:00Z');
      expect(store.notice()).toMatchObject({
        kind: 'info',
        message: 'board.notice.moved',
        issue: 'TQ-1',
        state: 'ISSUE_STATE_DONE',
      });
    });

    it('si el backend falla, vuelve a la columna original y avisa', () => {
      const response = new Subject<Issue>();
      client.moveIssue.mockReturnValue(response);

      store.move(1, 'ISSUE_STATE_IN_PROGRESS');
      expect(numbersIn('ISSUE_STATE_IN_PROGRESS')).toEqual([1, 2]);

      response.error(apiError(500));

      expect(numbersIn('ISSUE_STATE_TODO')).toEqual([1, 3]);
      expect(numbersIn('ISSUE_STATE_IN_PROGRESS')).toEqual([2]);
      expect(store.isPending(1)).toBe(false);
      expect(store.notice()).toMatchObject({
        kind: 'error',
        message: 'board.notice.moveFailed',
        issue: 'TQ-1',
        state: 'ISSUE_STATE_TODO',
      });
    });

    it('el rollback de un issue no pisa el movimiento exitoso de otro', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'ISSUE_STATE_DONE');
      store.move(3, 'ISSUE_STATE_DONE');
      second.next(issue(3, { state: 'ISSUE_STATE_DONE' }));
      first.error(apiError(503));

      expect(numbersIn('ISSUE_STATE_DONE')).toEqual([3]);
      expect(numbersIn('ISSUE_STATE_TODO')).toEqual([1]);
    });

    it('sólo cuenta la respuesta del último movimiento del mismo issue', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'ISSUE_STATE_IN_PROGRESS');
      store.move(1, 'ISSUE_STATE_DONE');
      first.error(apiError(500)); // viejo: se ignora, no hay rollback
      expect(numbersIn('ISSUE_STATE_DONE')).toEqual([1]);
      expect(store.isPending(1)).toBe(true);

      second.next(issue(1, { state: 'ISSUE_STATE_DONE' }));
      expect(numbersIn('ISSUE_STATE_DONE')).toEqual([1]);
      expect(store.isPending(1)).toBe(false);
    });

    it('si fallan dos movimientos seguidos, vuelve al estado que tiene el servidor', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'ISSUE_STATE_IN_PROGRESS');
      store.move(1, 'ISSUE_STATE_DONE');
      first.error(apiError(500));
      second.error(apiError(500));

      expect(numbersIn('ISSUE_STATE_TODO')).toEqual([1, 3]);
      expect(numbersIn('ISSUE_STATE_IN_PROGRESS')).toEqual([2]);
      expect(store.notice()).toMatchObject({ kind: 'error', state: 'ISSUE_STATE_TODO' });
    });

    it('si el primero se aplicó y falla el último, vuelve a lo que confirmó el primero', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'ISSUE_STATE_IN_PROGRESS');
      store.move(1, 'ISSUE_STATE_DONE');
      first.next(issue(1, { state: 'ISSUE_STATE_IN_PROGRESS' }));
      second.error(apiError(500));

      expect(numbersIn('ISSUE_STATE_IN_PROGRESS')).toEqual([1, 2]);
      expect(store.isPending(1)).toBe(false);
      expect(store.notice()).toMatchObject({ kind: 'error', state: 'ISSUE_STATE_IN_PROGRESS' });
    });

    it('la respuesta de un movimiento no toca el tablero de otro proyecto', () => {
      const ok = new Subject<Issue>();
      const ko = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(ok).mockReturnValueOnce(ko);
      store.move(3, 'ISSUE_STATE_DONE');
      store.move(1, 'ISSUE_STATE_DONE');

      const other = (n: number) => issue(n, { id: `w${n}`, projectId: 'p2', title: `WEB ${n}` });
      client.listAllProjects.mockReturnValue(of([project, { ...project, id: 'p2', key: 'WEB' }]));
      client.listAllIssues.mockReturnValue(of([other(1), other(3)]));
      store.load('p2');

      ok.next(issue(3, { state: 'ISSUE_STATE_DONE' }));
      ko.error(apiError(500));

      expect(store.issues()).toEqual([other(1), other(3)]);
      expect(store.isPending(1)).toBe(false);
      expect(store.isPending(3)).toBe(false);
      expect(store.notice()).toBeNull();
    });

    it('mover a la misma columna no llama al API', () => {
      store.move(1, 'ISSUE_STATE_TODO');
      expect(client.moveIssue).not.toHaveBeenCalled();
    });

    it('un refresco del tablero no deshace un movimiento en vuelo', () => {
      client.moveIssue.mockReturnValue(new Subject<Issue>());
      store.move(1, 'ISSUE_STATE_DONE');

      store.load('p1'); // el servidor todavía dice TODO

      expect(numbersIn('ISSUE_STATE_DONE')).toEqual([1]);
    });
  });

  it('create suma el issue a «Por hacer» y lo anuncia', () => {
    client.createIssue.mockReturnValue(of(issue(4, { priority: 'PRIORITY_URGENT' })));

    store.create({ title: 'Nuevo', description: '', priority: 'PRIORITY_URGENT' }).subscribe();

    expect(numbersIn('ISSUE_STATE_TODO')).toEqual([1, 3, 4]); // el backend lo pone al final
    expect(store.activeColumn()).toBe('ISSUE_STATE_TODO');
    expect(store.notice()).toMatchObject({ message: 'board.notice.created', issue: 'TQ-4' });
  });

  it('select refresca el issue desde el servidor y el detalle refleja los movimientos', () => {
    client.getIssue.mockReturnValue(of(issue(1, { description: '# Hola' })));
    client.moveIssue.mockReturnValue(of(issue(1, { state: 'ISSUE_STATE_DONE' })));

    store.select(1);
    expect(store.selected()?.description).toBe('# Hola');

    store.move(1, 'ISSUE_STATE_DONE');
    expect(store.selected()?.state).toBe('ISSUE_STATE_DONE');
  });

  it('select de un número inexistente marca no encontrado', () => {
    client.getIssue.mockReturnValue(throwError(() => apiError(404)));
    store.select(99);
    expect(store.selected()).toBeNull();
    expect(store.selectedNotFound()).toBe(true);
  });
});
