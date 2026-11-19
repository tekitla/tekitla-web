import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SharedClient, toDomainError } from '@/app/api';
import type { SharedIssue, SharedProjectView } from '@/app/api';
import { SharedStore } from './shared.store';

const view = (scope: SharedProjectView['scope']): SharedProjectView => ({
  project: { key: 'DEMO', name: 'Demo', description: '' },
  scope,
  statuses: [
    {
      id: 'todo',
      name: 'Por hacer',
      category: 'ISSUE_STATE_TODO',
      color: 'LABEL_COLOR_NEUTRAL',
      wipLimit: 0,
      hidden: false,
    },
  ],
  labels: [],
});

const issues: SharedIssue[] = [
  {
    number: 1,
    title: 'Revisar el aviso',
    description: '',
    waitingNote: 'que apruebe el texto',
    state: 'ISSUE_STATE_TODO',
    priority: 'PRIORITY_HIGH',
    statusId: 'todo',
    labelIds: [],
    assignee: { kind: 'ACTOR_KIND_PERSON', displayName: 'Victor', tool: 'AGENT_TOOL_UNSPECIFIED' },
    createdAt: '',
    updatedAt: '',
  },
];

describe('SharedStore', () => {
  let getProject: ReturnType<typeof vi.fn>;
  let listAllIssues: ReturnType<typeof vi.fn>;
  let store: SharedStore;

  beforeEach(() => {
    getProject = vi.fn();
    listAllIssues = vi.fn();
    TestBed.configureTestingModule({
      providers: [SharedStore, { provide: SharedClient, useValue: { getProject, listAllIssues } }],
    });
    store = TestBed.inject(SharedStore);
  });

  it('carga proyecto e issues una vez por token y arma el tablero', () => {
    getProject.mockReturnValue(of(view('SHARE_LINK_SCOPE_PLAN')));
    listAllIssues.mockReturnValue(of(issues));
    store.load('tks_a');
    store.load('tks_a');
    expect(getProject).toHaveBeenCalledTimes(1);
    expect(getProject).toHaveBeenCalledWith('tks_a');
    expect(store.loaded()).toBe(true);
    expect(store.isPanel()).toBe(false);
    expect(store.projectKey()).toBe('DEMO');
    expect(store.columns()[0].issues.map((i) => i.number)).toEqual([1]);
    expect(store.waitingNote(1)).toBe('que apruebe el texto');
    const issue = store.issue(1)!;
    expect(store.assignee(issue.assigneeActorId)).toMatchObject({ kind: 'person', name: 'Victor' });
    expect(store.assignee('')).toBeNull();
    expect(store.issue(99)).toBeNull();
  });

  it('un 404 queda en notFound (sin decir por qué)', () => {
    const notFound = toDomainError(
      new HttpErrorResponse({ status: 404, error: { error: { code: 'NOT_FOUND' } } }),
    );
    getProject.mockReturnValue(throwError(() => notFound));
    listAllIssues.mockReturnValue(of([]));
    store.load('tks_b');
    expect(store.loaded()).toBe(true);
    expect(store.notFound()).toBe(true);
    expect(store.error()).toBe(false);
  });

  it('otro error queda en error', () => {
    getProject.mockReturnValue(throwError(() => toDomainError(new Error('offline'))));
    listAllIssues.mockReturnValue(of([]));
    store.load('tks_c');
    expect(store.error()).toBe(true);
    expect(store.notFound()).toBe(false);
  });

  it('una respuesta de un token anterior no pisa la del nuevo', () => {
    const first = new Subject<SharedProjectView>();
    getProject.mockReturnValueOnce(first).mockReturnValueOnce(of(view('SHARE_LINK_SCOPE_PANEL')));
    listAllIssues.mockReturnValue(of([]));
    store.load('tks_viejo');
    store.load('tks_nuevo');
    first.next(view('SHARE_LINK_SCOPE_PLAN'));
    first.complete();
    expect(store.token()).toBe('tks_nuevo');
    expect(store.isPanel()).toBe(true);
  });

  it('después de un error se puede reintentar; con un pedido en vuelo, no se repite', () => {
    getProject.mockReturnValueOnce(throwError(() => toDomainError(new Error('offline'))));
    listAllIssues.mockReturnValue(of(issues));
    store.load('tks_d');
    expect(store.error()).toBe(true);

    const pending = new Subject<SharedProjectView>();
    getProject.mockReturnValueOnce(pending);
    store.load('tks_d');
    store.load('tks_d');
    expect(getProject).toHaveBeenCalledTimes(2);
    pending.next(view('SHARE_LINK_SCOPE_PANEL'));
    pending.complete();
    expect(store.error()).toBe(false);
    expect(store.isPanel()).toBe(true);
  });
});
