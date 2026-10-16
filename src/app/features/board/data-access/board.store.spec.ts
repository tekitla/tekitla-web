import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError, type Issue, IssuesClient, type Project, type Status } from '@/app/api';
import { BoardStore } from './board.store';
import { ProjectConfigStore } from './project-config.store';

const project: Project = {
  id: 'p1',
  key: 'TK',
  name: 'Tekitla',
  description: '',
  createdAt: '',
  updatedAt: '',
  workspaceId: 'w1',
};

const status = (id: string, category: Status['category'], rank: string, name: string): Status => ({
  id,
  projectId: 'p1',
  name,
  category,
  rank,
  color: 'LABEL_COLOR_UNSPECIFIED',
  wipLimit: 0,
  hidden: category === 'ISSUE_STATE_CANCELED',
});

const statuses: Status[] = [
  status('todo', 'ISSUE_STATE_TODO', 'a', 'Por hacer'),
  status('doing', 'ISSUE_STATE_IN_PROGRESS', 'b', 'En curso'),
  status('done', 'ISSUE_STATE_DONE', 'c', 'Hecho'),
  status('canceled', 'ISSUE_STATE_CANCELED', 'd', 'Descartado'),
];

const CATEGORY: Record<string, Issue['state']> = {
  todo: 'ISSUE_STATE_TODO',
  doing: 'ISSUE_STATE_IN_PROGRESS',
  done: 'ISSUE_STATE_DONE',
  canceled: 'ISSUE_STATE_CANCELED',
};

const issue = (number: number, patch: Partial<Issue> = {}): Issue => {
  const statusId = patch.statusId ?? 'todo';
  return {
    id: `i${number}`,
    projectId: 'p1',
    number,
    title: `Issue ${number}`,
    description: '',
    state: CATEGORY[statusId]!,
    priority: 'PRIORITY_MEDIUM',
    createdAt: `2026-10-0${number}T00:00:00Z`,
    updatedAt: '',
    rank: `0|a${number}`,
    statusId,
    labelIds: [],
    discard: null,
    ...patch,
  };
};

const apiError = (status: number, code = '', reason = '') =>
  new DomainError({ status, code, reason, message: `HTTP ${status}`, details: [], traceId: null });

type ClientMock = Record<
  | 'listAllProjects'
  | 'listAllIssues'
  | 'listStatuses'
  | 'listLabels'
  | 'moveIssue'
  | 'createIssue'
  | 'updateIssue'
  | 'getIssue'
  | 'discardIssue'
  | 'restoreIssue',
  ReturnType<typeof vi.fn>
>;

describe('BoardStore', () => {
  let client: ClientMock;
  let store: BoardStore;

  const numbersIn = (statusId: string) =>
    store
      .columns()
      .find((c) => c.status.id === statusId)!
      .issues.map((i) => i.number);

  beforeEach(() => {
    client = {
      listAllProjects: vi.fn(() => of([project])),
      listAllIssues: vi.fn(() => of([issue(1), issue(2, { statusId: 'doing' }), issue(3)])),
      listStatuses: vi.fn(() => of(statuses)),
      listLabels: vi.fn(() => of([])),
      moveIssue: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      getIssue: vi.fn(),
      discardIssue: vi.fn(),
      restoreIssue: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [ProjectConfigStore, BoardStore, { provide: IssuesClient, useValue: client }],
    });
    store = TestBed.inject(BoardStore);
    store.load('p1');
  });

  it('carga proyecto, estados e issues en columnas (sin los descartados)', () => {
    expect(store.project()?.key).toBe('TK');
    expect(store.columns().map((c) => c.status.name)).toEqual(['Por hacer', 'En curso', 'Hecho']);
    expect(numbersIn('todo')).toEqual([1, 3]);
    expect(numbersIn('doing')).toEqual([2]);
    expect(store.activeColumn()).toBe('todo');
    expect(store.loading()).toBe(false);
  });

  describe('descartar y restaurar', () => {
    it('descartar espera al servidor, saca el issue del tablero y avisa', () => {
      const discarded = issue(1, {
        statusId: 'canceled',
        state: 'ISSUE_STATE_CANCELED',
        discard: { reason: 'Duplicado', actorId: 'u1', discardedAt: '' },
      });
      client.discardIssue.mockReturnValue(of(discarded));
      let result: Issue | undefined;

      store.discard(1, { reason: 'Duplicado' }).subscribe((i) => (result = i));

      expect(client.discardIssue).toHaveBeenCalledWith('p1', 1, { reason: 'Duplicado' });
      expect(result?.discard?.reason).toBe('Duplicado');
      expect(numbersIn('todo')).toEqual([3]);
      expect(store.notice()).toMatchObject({ message: 'board.notice.discarded', issue: 'TK-1' });
    });

    it('restaurar lo devuelve al tablero con el rank del servidor', () => {
      client.restoreIssue.mockReturnValue(of(issue(2, { statusId: 'todo', rank: '0|z' })));

      store.restore(2).subscribe();

      expect(numbersIn('todo')).toEqual([1, 3, 2]);
      expect(store.notice()).toMatchObject({
        message: 'board.notice.restored',
        column: 'Por hacer',
      });
    });

    it('un error llega como DomainError y no cambia nada', () => {
      client.restoreIssue.mockReturnValue(
        throwError(() => apiError(400, 'FAILED_PRECONDITION', 'ISSUE_NOT_DISCARDED')),
      );
      let error: DomainError | undefined;

      store.restore(1).subscribe({ error: (e: DomainError) => (error = e) });

      expect(error?.api.reason).toBe('ISSUE_NOT_DISCARDED');
      expect(numbersIn('todo')).toEqual([1, 3]);
    });

    it('mover a un estado de descarte no hace nada: descartar pide motivo', () => {
      store.move(1, 'canceled');
      expect(client.moveIssue).not.toHaveBeenCalled();
      expect(numbersIn('todo')).toEqual([1, 3]);
    });

    it('moveTo espera al servidor y no avisa (lo usan las acciones en lote)', () => {
      client.moveIssue.mockReturnValue(of(issue(1, { statusId: 'done' })));
      store.dismissNotice();

      store.moveTo(1, 'done').subscribe();

      expect(client.moveIssue).toHaveBeenCalledWith('p1', 1, { statusId: 'done' });
      expect(numbersIn('done')).toEqual([1]);
      expect(store.notice()).toBeNull();
    });
  });

  describe('refresco en segundo plano', () => {
    it('si hubo escrituras mientras tanto, descarta lo que trajo y vuelve a pedir', () => {
      const stale = new Subject<Issue[]>();
      client.listAllIssues.mockReturnValueOnce(stale);
      client.updateIssue.mockReturnValue(of(issue(1, { title: 'Editado' })));

      store.refresh();
      store.update(1, { title: 'Editado' }).subscribe();
      // El servidor ya tiene la edición: el reintento la trae.
      client.listAllIssues.mockReturnValue(
        of([issue(1, { title: 'Editado' }), issue(2, { statusId: 'doing' }), issue(3)]),
      );
      // El refresco salió antes de editar: trae el título viejo.
      stale.next([issue(1), issue(2, { statusId: 'doing' }), issue(3)]);
      stale.complete();

      expect(client.listAllIssues).toHaveBeenCalledTimes(3); // carga, refresco y reintento
      expect(store.issues().find((i) => i.number === 1)?.title).toBe('Editado');
    });

    it('lo mismo con una escritura de Ajustes (estados o etiquetas)', () => {
      const config = TestBed.inject(ProjectConfigStore);
      const stale = new Subject<Status[]>();
      client.listStatuses.mockReturnValueOnce(stale);
      (client as Record<string, ReturnType<typeof vi.fn>>)['createLabel'] = vi.fn(() =>
        of({ id: 'l9', projectId: 'p1', name: 'Nueva', color: 'LABEL_COLOR_INFO' }),
      );

      store.refresh();
      config.createLabel({ name: 'Nueva', color: 'LABEL_COLOR_INFO' }).subscribe();
      expect(store.labels().map((l) => l.name)).toEqual(['Nueva']);
      client.listLabels.mockReturnValue(
        of([{ id: 'l9', projectId: 'p1', name: 'Nueva', color: 'LABEL_COLOR_INFO' }]),
      );
      stale.next(statuses);
      stale.complete();

      expect(store.labels().map((l) => l.name)).toEqual(['Nueva']);
    });

    it('si falla, el tablero sigue a la vista y se avisa', () => {
      client.listAllIssues.mockReturnValueOnce(throwError(() => apiError(503)));

      store.refresh();

      expect(store.error()).toBeNull();
      expect(numbersIn('todo')).toEqual([1, 3]);
      expect(store.notice()).toMatchObject({
        kind: 'error',
        message: 'board.notice.refreshFailed',
      });
    });
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

      store.move(1, 'done');

      expect(client.moveIssue).toHaveBeenCalledWith('p1', 1, { statusId: 'done' });
      expect(numbersIn('done')).toEqual([1]);
      expect(store.issues().find((i) => i.number === 1)?.state).toBe('ISSUE_STATE_DONE');
      expect(store.isPending(1)).toBe(true);

      response.next(issue(1, { statusId: 'done', updatedAt: '2026-10-10T00:00:00Z' }));

      expect(store.isPending(1)).toBe(false);
      expect(store.issues().find((i) => i.number === 1)?.updatedAt).toBe('2026-10-10T00:00:00Z');
      expect(store.notice()).toMatchObject({
        kind: 'info',
        message: 'board.notice.moved',
        issue: 'TK-1',
        column: 'Hecho',
      });
    });

    it('con índice manda los vecinos tal como se ven y ubica la tarjeta al instante', () => {
      client.moveIssue.mockReturnValue(new Subject<Issue>());

      store.move(2, 'todo', 1); // entre 1 y 3

      expect(client.moveIssue).toHaveBeenCalledWith('p1', 2, {
        statusId: 'todo',
        afterNumber: 1,
        beforeNumber: 3,
      });
      expect(numbersIn('todo')).toEqual([1, 2, 3]);
    });

    it('reordenar dentro de la columna usa el rank del servidor al confirmar', () => {
      const response = new Subject<Issue>();
      client.moveIssue.mockReturnValue(response);

      store.move(3, 'todo', 0);
      expect(client.moveIssue).toHaveBeenCalledWith('p1', 3, {
        statusId: 'todo',
        afterNumber: 0,
        beforeNumber: 1,
      });
      expect(numbersIn('todo')).toEqual([3, 1]);

      response.next(issue(3, { rank: '0|a0' }));
      expect(numbersIn('todo')).toEqual([3, 1]);
      expect(store.notice()).toMatchObject({
        message: 'board.notice.reordered',
        column: 'Por hacer',
      });
    });

    it('soltar en el mismo lugar o mover a la misma columna sin índice no llama al API', () => {
      store.move(1, 'todo');
      store.move(1, 'todo', 0);
      expect(client.moveIssue).not.toHaveBeenCalled();
    });

    it('si el backend falla, vuelve a su columna y lugar y avisa', () => {
      const response = new Subject<Issue>();
      client.moveIssue.mockReturnValue(response);

      store.move(1, 'doing', 1);
      expect(numbersIn('doing')).toEqual([2, 1]);

      response.error(apiError(500));

      expect(numbersIn('todo')).toEqual([1, 3]);
      expect(numbersIn('doing')).toEqual([2]);
      expect(store.issues().find((i) => i.number === 1)?.rank).toBe('0|a1');
      expect(store.isPending(1)).toBe(false);
      expect(store.notice()).toMatchObject({
        kind: 'error',
        message: 'board.notice.moveFailed',
        issue: 'TK-1',
        column: 'Por hacer',
      });
    });

    it('vista vieja (FAILED_PRECONDITION): vuelve, avisa y recarga el tablero', () => {
      client.moveIssue.mockReturnValue(throwError(() => apiError(400, 'FAILED_PRECONDITION')));
      client.listAllIssues.mockClear();
      client.listAllIssues.mockReturnValue(
        of([issue(1, { statusId: 'done' }), issue(2, { statusId: 'doing' }), issue(3)]),
      );

      store.move(3, 'todo', 0);

      expect(store.notice()).toMatchObject({ kind: 'error', detail: 'board.notice.stale' });
      expect(client.listAllIssues).toHaveBeenCalledTimes(1);
      expect(numbersIn('done')).toEqual([1]);
    });

    it('el rollback de un issue no pisa el movimiento exitoso de otro', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'done');
      store.move(3, 'done');
      second.next(issue(3, { statusId: 'done' }));
      first.error(apiError(503));

      expect(numbersIn('done')).toEqual([3]);
      expect(numbersIn('todo')).toEqual([1]);
    });

    it('sólo cuenta la respuesta del último movimiento del mismo issue', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'doing');
      store.move(1, 'done');
      first.error(apiError(500)); // viejo: se ignora, no hay rollback
      expect(numbersIn('done')).toEqual([1]);
      expect(store.isPending(1)).toBe(true);

      second.next(issue(1, { statusId: 'done' }));
      expect(numbersIn('done')).toEqual([1]);
      expect(store.isPending(1)).toBe(false);
    });

    it('si fallan dos movimientos seguidos, vuelve a lo que tiene el servidor', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'doing');
      store.move(1, 'done');
      first.error(apiError(500));
      second.error(apiError(500));

      expect(numbersIn('todo')).toEqual([1, 3]);
      expect(numbersIn('doing')).toEqual([2]);
      expect(store.notice()).toMatchObject({ kind: 'error', column: 'Por hacer' });
    });

    it('si el primero se aplicó y falla el último, vuelve a lo que confirmó el primero', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'doing');
      store.move(1, 'done');
      first.next(issue(1, { statusId: 'doing' }));
      second.error(apiError(500));

      expect(numbersIn('doing')).toEqual([1, 2]);
      expect(store.isPending(1)).toBe(false);
      expect(store.notice()).toMatchObject({ kind: 'error', column: 'En curso' });
    });

    it('si el último falla antes de que responda el primero, espera y vuelve a lo que confirmó el primero', () => {
      const first = new Subject<Issue>();
      const second = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(first).mockReturnValueOnce(second);

      store.move(1, 'done');
      store.move(1, 'doing');
      second.error(apiError(500));

      expect(store.isPending(1)).toBe(true);
      expect(store.notice()).toBeNull();

      first.next(issue(1, { statusId: 'done' }));

      expect(numbersIn('done')).toEqual([1]);
      expect(store.isPending(1)).toBe(false);
      expect(store.notice()).toMatchObject({ kind: 'error', column: 'Hecho' });
    });

    it('la respuesta de un movimiento no toca el tablero de otro proyecto', () => {
      const ok = new Subject<Issue>();
      const ko = new Subject<Issue>();
      client.moveIssue.mockReturnValueOnce(ok).mockReturnValueOnce(ko);
      store.move(3, 'done');
      store.move(1, 'done');

      const other = (n: number) => issue(n, { id: `w${n}`, projectId: 'p2', title: `WEB ${n}` });
      client.listAllProjects.mockReturnValue(of([project, { ...project, id: 'p2', key: 'WEB' }]));
      client.listAllIssues.mockReturnValue(of([other(1), other(3)]));
      store.load('p2');

      ok.next(issue(3, { statusId: 'done' }));
      ko.error(apiError(500));

      expect(store.issues()).toEqual([other(1), other(3)]);
      expect(store.isPending(1)).toBe(false);
      expect(store.isPending(3)).toBe(false);
      expect(store.notice()).toBeNull();
    });

    it('un refresco del tablero no deshace un movimiento en vuelo', () => {
      client.moveIssue.mockReturnValue(new Subject<Issue>());
      store.move(1, 'done');

      store.load('p1'); // el servidor todavía dice «Por hacer»

      expect(numbersIn('done')).toEqual([1]);
    });
  });

  it('create suma el issue a su columna y lo anuncia con el nombre del estado', () => {
    client.createIssue.mockReturnValue(of(issue(4, { priority: 'PRIORITY_URGENT', rank: '0|a9' })));

    store.create({ title: 'Nuevo', description: '', priority: 'PRIORITY_URGENT' }).subscribe();

    expect(numbersIn('todo')).toEqual([1, 3, 4]);
    expect(store.activeColumn()).toBe('todo');
    expect(store.notice()).toMatchObject({
      message: 'board.notice.created',
      issue: 'TK-4',
      column: 'Por hacer',
    });
  });

  describe('update', () => {
    it('guarda lo que devuelve el servidor', () => {
      client.updateIssue.mockReturnValue(of(issue(1, { title: 'Nuevo título', labelIds: ['l1'] })));

      store.update(1, { title: 'Nuevo título' }).subscribe();

      expect(client.updateIssue).toHaveBeenCalledWith('p1', 1, { title: 'Nuevo título' });
      expect(store.issues().find((i) => i.number === 1)).toMatchObject({
        title: 'Nuevo título',
        labelIds: ['l1'],
      });
    });

    it('con un movimiento en vuelo conserva la posición optimista', () => {
      client.moveIssue.mockReturnValue(new Subject<Issue>());
      client.updateIssue.mockReturnValue(of(issue(1, { title: 'x' })));
      store.move(1, 'done');

      store.update(1, { title: 'x' }).subscribe();

      expect(numbersIn('done')).toEqual([1]);
      expect(store.issues().find((i) => i.number === 1)?.title).toBe('x');
    });

    it('el error llega como DomainError y no toca el issue', () => {
      client.updateIssue.mockReturnValue(throwError(() => apiError(400)));
      let error: unknown;

      store.update(1, { title: 'x' }).subscribe({ error: (e: unknown) => (error = e) });

      expect(error).toBeInstanceOf(DomainError);
      expect(store.issues().find((i) => i.number === 1)?.title).toBe('Issue 1');
    });
  });

  it('select refresca el issue desde el servidor y el detalle refleja los movimientos', () => {
    client.getIssue.mockReturnValue(of(issue(1, { description: '# Hola' })));
    client.moveIssue.mockReturnValue(of(issue(1, { statusId: 'done' })));

    store.select(1);
    expect(store.selected()?.description).toBe('# Hola');

    store.move(1, 'done');
    expect(store.selected()?.statusId).toBe('done');
  });

  it('select de un número inexistente marca no encontrado', () => {
    client.getIssue.mockReturnValue(throwError(() => apiError(404)));
    store.select(99);
    expect(store.selected()).toBeNull();
    expect(store.selectedNotFound()).toBe(true);
  });
});
