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
  'createStatus' | 'updateStatus' | 'deleteStatus' | 'createLabel' | 'updateLabel' | 'deleteLabel',
  ReturnType<typeof vi.fn>
>;

describe('ProjectConfigStore', () => {
  let client: ClientMock;
  let store: ProjectConfigStore;

  beforeEach(() => {
    client = {
      createStatus: vi.fn(),
      updateStatus: vi.fn(),
      deleteStatus: vi.fn(),
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

  it('ordena estados por rank, etiquetas por nombre y separa las columnas', () => {
    expect(store.statuses().map((s) => s.id)).toEqual(['todo', 'doing', 'done', 'canceled']);
    expect(store.boardStatuses().map((s) => s.id)).toEqual(['todo', 'doing', 'done']);
    expect(store.labels().map((l) => l.name)).toEqual(['API', 'web']);
    expect(store.labelsById().get('l2')?.name).toBe('web');
  });

  it('createStatus agrega el estado en su lugar', () => {
    const review = status('review', 'ISSUE_STATE_IN_PROGRESS', 'b5');
    client.createStatus.mockReturnValue(of(review));

    store.createStatus({ name: 'review', category: 'ISSUE_STATE_IN_PROGRESS' }).subscribe();

    expect(client.createStatus).toHaveBeenCalledWith('p1', {
      name: 'review',
      category: 'ISSUE_STATE_IN_PROGRESS',
    });
    expect(store.statuses().map((s) => s.id)).toEqual([
      'todo',
      'doing',
      'review',
      'done',
      'canceled',
    ]);
  });

  describe('moveStatus', () => {
    it('subir pide quedar después del que está dos lugares arriba', () => {
      client.updateStatus.mockReturnValue(of({ ...done, rank: 'a5' }));

      store.moveStatus('done', -1)!.subscribe();

      expect(client.updateStatus).toHaveBeenCalledWith('p1', 'done', { afterStatusId: 'todo' });
      expect(store.statuses().map((s) => s.id)).toEqual(['todo', 'done', 'doing', 'canceled']);
    });

    it('al principio va con afterStatusId vacío; bajar, después del siguiente', () => {
      client.updateStatus.mockReturnValue(of(doing));
      store.moveStatus('doing', -1)!.subscribe();
      expect(client.updateStatus).toHaveBeenLastCalledWith('p1', 'doing', { afterStatusId: '' });

      store.moveStatus('todo', 1)!.subscribe();
      expect(client.updateStatus).toHaveBeenLastCalledWith('p1', 'todo', {
        afterStatusId: 'doing',
      });
    });

    it('en los bordes no hace nada', () => {
      expect(store.moveStatus('todo', -1)).toBeNull();
      expect(store.moveStatus('canceled', 1)).toBeNull();
    });
  });

  it('deleteStatus manda el destino y lo saca de la lista', () => {
    client.deleteStatus.mockReturnValue(of(undefined));

    store.deleteStatus('doing', 'todo').subscribe();

    expect(client.deleteStatus).toHaveBeenCalledWith('p1', 'doing', 'todo');
    expect(store.statuses().map((s) => s.id)).not.toContain('doing');
  });

  it('un error llega como DomainError y no cambia nada', () => {
    client.updateStatus.mockReturnValue(
      throwError(
        () =>
          new DomainError({
            status: 409,
            code: 'ALREADY_EXISTS',
            reason: 'STATUS_NAME_TAKEN',
            message: 'x',
            details: [],
            traceId: null,
          }),
      ),
    );
    let error: unknown;

    store.renameStatus('todo', 'doing').subscribe({ error: (e: unknown) => (error = e) });

    expect((error as DomainError).api.code).toBe('ALREADY_EXISTS');
    expect(store.statuses()[0]!.name).toBe('todo');
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
