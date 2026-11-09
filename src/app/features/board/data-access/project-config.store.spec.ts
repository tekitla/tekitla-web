import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError, IssuesClient, type Label, type Status } from '@/app/api';
import { ProjectConfigStore } from './project-config.store';

const status = (id: string, category: Status['category'], rank: string): Status => ({
  id,
  projectId: 'p1',
  name: id,
  category,
  rank,
  color: 'LABEL_COLOR_UNSPECIFIED',
  wipLimit: 0,
  hidden: category === 'ISSUE_STATE_CANCELED',
});

const label = (id: string, name: string): Label => ({
  id,
  projectId: 'p1',
  name,
  color: 'LABEL_COLOR_INFO',
});

const todo = status('todo', 'ISSUE_STATE_TODO', 'a');
const doing = status('doing', 'ISSUE_STATE_IN_PROGRESS', 'b');
const done = status('done', 'ISSUE_STATE_DONE', 'c');
const canceled = status('canceled', 'ISSUE_STATE_CANCELED', 'd');

type ClientMock = Record<
  'batchUpdateStatuses' | 'listStatuses' | 'createLabel' | 'updateLabel' | 'deleteLabel',
  ReturnType<typeof vi.fn>
>;

describe('ProjectConfigStore', () => {
  let client: ClientMock;
  let store: ProjectConfigStore;

  beforeEach(() => {
    client = {
      batchUpdateStatuses: vi.fn(),
      listStatuses: vi.fn(),
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [ProjectConfigStore, { provide: IssuesClient, useValue: client }],
    });
    store = TestBed.inject(ProjectConfigStore);
    store.set('p1', [done, canceled, todo, doing], [label('l2', 'web'), label('l1', 'API')]);
  });

  it('ordena estados por rank, etiquetas por nombre y deja fuera del tablero los ocultos', () => {
    expect(store.statuses().map((s) => s.id)).toEqual(['todo', 'doing', 'done', 'canceled']);
    expect(store.boardStatuses().map((s) => s.id)).toEqual(['todo', 'doing', 'done']);
    expect(store.labels().map((l) => l.name)).toEqual(['API', 'web']);
    expect(store.labelsById().get('l2')?.name).toBe('web');
  });

  it('saveStatuses manda el lote y queda con lo que devolvió el servidor', () => {
    const review = status('review', 'ISSUE_STATE_IN_PROGRESS', 'b5');
    client.batchUpdateStatuses.mockReturnValue(of([canceled, review, todo, doing, done]));
    const req = { statuses: [], deletions: [] };
    const version = store.version;

    store.saveStatuses(req).subscribe();

    expect(client.batchUpdateStatuses).toHaveBeenCalledWith('p1', req);
    expect(store.statuses().map((s) => s.id)).toEqual([
      'todo',
      'doing',
      'review',
      'done',
      'canceled',
    ]);
    expect(store.version).toBe(version + 1);
  });

  it('reloadStatuses trae los estados de nuevo', () => {
    client.listStatuses.mockReturnValue(of([todo, done]));
    store.reloadStatuses().subscribe();
    expect(client.listStatuses).toHaveBeenCalledWith('p1');
    expect(store.statuses().map((s) => s.id)).toEqual(['todo', 'done']);
  });

  it('un error llega como DomainError y no cambia nada', () => {
    client.batchUpdateStatuses.mockReturnValue(
      throwError(
        () =>
          new DomainError({
            status: 400,
            code: 'FAILED_PRECONDITION',
            reason: 'STALE_STATUSES',
            message: 'x',
            details: [],
            traceId: null,
          }),
      ),
    );
    let error: unknown;

    store
      .saveStatuses({ statuses: [], deletions: [] })
      .subscribe({ error: (e: unknown) => (error = e) });

    expect((error as DomainError).api.reason).toBe('STALE_STATUSES');
    expect(store.statuses().map((s) => s.id)).toEqual(['todo', 'doing', 'done', 'canceled']);
  });

  it('etiquetas: crear, editar (reordena por nombre) y borrar', () => {
    client.createLabel.mockReturnValue(of(label('l3', 'Backend')));
    client.updateLabel.mockReturnValue(of(label('l2', 'Accesibilidad')));
    client.deleteLabel.mockReturnValue(of(undefined));

    store.createLabel({ name: 'Backend', color: 'LABEL_COLOR_INFO' }).subscribe();
    expect(store.labels().map((l) => l.name)).toEqual(['API', 'Backend', 'web']);

    store.updateLabel('l2', { name: 'Accesibilidad' }).subscribe();
    expect(store.labels().map((l) => l.name)).toEqual(['Accesibilidad', 'API', 'Backend']);

    store.deleteLabel('l1').subscribe();
    expect(store.labels().map((l) => l.id)).toEqual(['l2', 'l3']);
  });

  it('una respuesta que llega después de cambiar de proyecto no toca el store', () => {
    const response = new Subject<Label>();
    client.createLabel.mockReturnValue(response);
    const next = vi.fn();
    const complete = vi.fn();

    store.createLabel({ name: 'x', color: 'LABEL_COLOR_INFO' }).subscribe({ next, complete });
    store.reset('p2');
    response.next(label('l9', 'x'));
    response.complete();

    expect(store.labels()).toEqual([]);
    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalled();
  });
});
