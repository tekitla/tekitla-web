import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError, IssuesClient, type Project } from '@/app/api';
import { ProjectsStore } from './projects.store';

const project = (id: string, name: string, key = 'TK'): Project => ({
  id,
  key,
  name,
  description: '',
  createdAt: '',
  updatedAt: '',
  workspaceId: 'w1',
});

describe('ProjectsStore', () => {
  let client: {
    listAllProjects: ReturnType<typeof vi.fn>;
    createProject: ReturnType<typeof vi.fn>;
  };
  let store: ProjectsStore;

  beforeEach(() => {
    client = { listAllProjects: vi.fn(), createProject: vi.fn() };
    TestBed.configureTestingModule({
      providers: [ProjectsStore, { provide: IssuesClient, useValue: client }],
    });
    store = TestBed.inject(ProjectsStore);
  });

  it('carga los proyectos', () => {
    client.listAllProjects.mockReturnValue(of([project('1', 'Tekitla')]));
    store.load();
    expect(store.projects().map((p) => p.name)).toEqual(['Tekitla']);
    expect(store.loading()).toBe(false);
    expect(store.isEmpty()).toBe(false);
  });

  it('create suma el proyecto nuevo ordenado por nombre', () => {
    client.listAllProjects.mockReturnValue(of([project('1', 'Beta'), project('2', 'Delta')]));
    client.createProject.mockReturnValue(of(project('3', 'Charlie', 'CH')));
    store.load();

    store.create({ key: 'CH', name: 'Charlie', description: '' }).subscribe();

    expect(store.projects().map((p) => p.name)).toEqual(['Beta', 'Charlie', 'Delta']);
  });

  it('create con key repetida propaga el 409 y no toca la lista', () => {
    client.listAllProjects.mockReturnValue(of([project('1', 'Tekitla')]));
    client.createProject.mockReturnValue(
      throwError(
        () =>
          new DomainError({
            status: 409,
            code: 'ALREADY_EXISTS',
            reason: 'PROJECT_KEY_TAKEN',
            message: 'exists',
            details: [],
            traceId: null,
          }),
      ),
    );
    store.load();
    let error: DomainError | undefined;

    store
      .create({ key: 'TK', name: 'Otro', description: '' })
      .subscribe({ error: (e: DomainError) => (error = e) });

    expect(error?.isConflict()).toBe(true);
    expect(store.projects()).toHaveLength(1);
  });
});
