import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainError } from '../../http/http-errors';
import { errorInterceptor } from '../../http/interceptors/error.interceptor';
import { joinApi } from '../rest/rest.endpoints';
import { IssuesClient } from './issues.client';
import type { Issue, Project } from './issues.contracts';

const url = (path: string) => joinApi(path);

describe('IssuesClient', () => {
  let client: IssuesClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(IssuesClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listProjects manda la paginación con notación de punto y normaliza', () => {
    let projects: Project[] = [];

    client.listProjects({ cursor: 'c1', limit: 10 }).subscribe((res) => (projects = res.projects));

    const req = httpMock.expectOne((r) => r.url === url('/v1/projects'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page.cursor')).toBe('c1');
    expect(req.request.params.get('page.limit')).toBe('10');
    // grpc-gateway omite `description` vacía y no manda `page` en la última.
    req.flush({ projects: [{ id: 'p1', key: 'TK', name: 'Tekitla', workspaceId: 'w1' }] });

    expect(projects).toEqual([
      {
        id: 'p1',
        key: 'TK',
        name: 'Tekitla',
        description: '',
        createdAt: '',
        updatedAt: '',
        workspaceId: 'w1',
      },
    ]);
  });

  it('listAllProjects recorre todas las páginas', () => {
    let projects: Project[] = [];

    client.listAllProjects().subscribe((res) => (projects = res));

    const first = httpMock.expectOne((r) => r.url === url('/v1/projects'));
    expect(first.request.params.has('page.cursor')).toBe(false);
    first.flush({ projects: [{ id: 'a' }], page: { nextCursor: 'n2', hasNext: true } });

    const second = httpMock.expectOne((r) => r.params.get('page.cursor') === 'n2');
    second.flush({ projects: [{ id: 'b' }], page: { hasNext: false } });

    expect(projects.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('listIssues filtra por estado y normaliza enums y números', () => {
    let issues: Issue[] = [];

    client
      .listIssues('p/1', { state: 'ISSUE_STATE_TODO' })
      .subscribe((res) => (issues = res.issues));

    const req = httpMock.expectOne((r) => r.url === url('/v1/projects/p%2F1/issues'));
    expect(req.request.params.get('state')).toBe('ISSUE_STATE_TODO');
    req.flush({
      issues: [
        { id: 'i1', number: 42, title: 'A', state: 'ISSUE_STATE_TODO', priority: 'PRIORITY_HIGH' },
        { id: 'i2', number: '7', title: 'B', priority: 'PRIORITY_DESCONOCIDA' },
        { id: 'i3', number: 8, state: 'ISSUE_STATE_CANCELED', rank: '0|hzzzzz:' },
      ],
    });

    expect(issues[0]).toMatchObject({ number: 42, priority: 'PRIORITY_HIGH', description: '' });
    expect(issues[1]).toMatchObject({
      number: 7,
      state: 'ISSUE_STATE_UNSPECIFIED',
      priority: 'PRIORITY_UNSPECIFIED',
      rank: '',
    });
    expect(issues[2]).toMatchObject({ state: 'ISSUE_STATE_CANCELED', rank: '0|hzzzzz:' });
  });

  it('listIssues sin estado no manda el parámetro', () => {
    client.listIssues('p1', { state: 'ISSUE_STATE_UNSPECIFIED' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === url('/v1/projects/p1/issues'));
    expect(req.request.params.has('state')).toBe(false);
    req.flush({});
  });

  it('getIssue desarma el sobre { issue }', () => {
    let issue: Issue | undefined;

    client.getIssue('p1', 42).subscribe((res) => (issue = res));

    httpMock
      .expectOne(url('/v1/projects/p1/issues/42'))
      .flush({ issue: { id: 'i1', number: 42, title: 'Hola' } });
    expect(issue?.title).toBe('Hola');
  });

  it('createProject hace POST con el body y devuelve el proyecto', () => {
    let project: Project | undefined;

    client
      .createProject({ key: 'TK', name: 'Tekitla', description: '' })
      .subscribe((res) => (project = res));

    const req = httpMock.expectOne(url('/v1/projects'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ key: 'TK', name: 'Tekitla', description: '' });
    req.flush({ project: { id: 'p1', key: 'TK', name: 'Tekitla' } });
    expect(project?.id).toBe('p1');
  });

  it('createProject con key repetida llega como DomainError 409', () => {
    let error: unknown;

    client
      .createProject({ key: 'TK', name: 'x', description: '' })
      .subscribe({ error: (e: unknown) => (error = e) });

    httpMock
      .expectOne(url('/v1/projects'))
      .flush(
        { code: 6, message: 'project key already exists', details: [] },
        { status: 409, statusText: 'Conflict' },
      );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).isConflict()).toBe(true);
  });

  it('createIssue manda título, descripción y prioridad', () => {
    client
      .createIssue('p1', { title: 'T', description: '**md**', priority: 'PRIORITY_LOW' })
      .subscribe();

    const req = httpMock.expectOne(url('/v1/projects/p1/issues'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      title: 'T',
      description: '**md**',
      priority: 'PRIORITY_LOW',
    });
    req.flush({ issue: { id: 'i9', number: 9 } });
  });

  it('moveIssue usa el verbo custom :move', () => {
    let issue: Issue | undefined;

    client.moveIssue('p1', 42, 'ISSUE_STATE_DONE').subscribe((res) => (issue = res));

    const req = httpMock.expectOne(url('/v1/projects/p1/issues/42:move'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ state: 'ISSUE_STATE_DONE' });
    req.flush({ issue: { id: 'i1', number: 42, state: 'ISSUE_STATE_DONE' } });
    expect(issue?.state).toBe('ISSUE_STATE_DONE');
  });
});
