import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainError } from '../../http/http-errors';
import { errorInterceptor } from '../../http/interceptors/error.interceptor';
import { joinApi } from '../rest/rest.endpoints';
import { IssuesClient } from './issues.client';
import type { Issue, IssueEvent, Label, Project, Status } from './issues.contracts';

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

  it('moveIssue usa el verbo custom :move con estado y vecinos', () => {
    let issue: Issue | undefined;

    client
      .moveIssue('p1', 42, { statusId: 's2', afterNumber: 7, beforeNumber: 0 })
      .subscribe((res) => (issue = res));

    const req = httpMock.expectOne(url('/v1/projects/p1/issues/42:move'));
    expect(req.request.method).toBe('POST');
    // Sin vecino de un lado: el campo no viaja (0 = ninguno).
    expect(JSON.parse(JSON.stringify(req.request.body))).toEqual({
      statusId: 's2',
      afterNumber: 7,
    });
    req.flush({
      issue: { id: 'i1', number: 42, state: 'ISSUE_STATE_DONE', statusId: 's2', labelIds: ['l1'] },
    });
    expect(issue).toMatchObject({ state: 'ISSUE_STATE_DONE', statusId: 's2', labelIds: ['l1'] });
  });

  it('un issue sin statusId ni etiquetas (omitidos) se normaliza', () => {
    let issue: Issue | undefined;
    client.getIssue('p1', 1).subscribe((res) => (issue = res));
    httpMock.expectOne(url('/v1/projects/p1/issues/1')).flush({ issue: { number: 1 } });
    expect(issue).toMatchObject({ statusId: '', labelIds: [] });
  });

  it('updateIssue hace PATCH solo con lo que viene; las etiquetas van como labels.ids', () => {
    client.updateIssue('p1', 42, { title: 'T', labelIds: [] }).subscribe();

    const req = httpMock.expectOne(url('/v1/projects/p1/issues/42'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'T', labels: { ids: [] } });
    req.flush({ issue: { number: 42 } });

    client.updateIssue('p1', 42, { priority: 'PRIORITY_HIGH' }).subscribe();
    const second = httpMock.expectOne(url('/v1/projects/p1/issues/42'));
    expect(second.request.body).toEqual({ priority: 'PRIORITY_HIGH' });
    second.flush({ issue: { number: 42 } });
  });

  it('estados: listar, crear, renombrar/reubicar y borrar con destino', () => {
    let statuses: Status[] = [];
    client.listStatuses('p1').subscribe((res) => (statuses = res));
    httpMock.expectOne(url('/v1/projects/p1/statuses')).flush({
      statuses: [{ id: 's1', name: 'Por hacer', category: 'ISSUE_STATE_TODO', rank: 'a' }],
    });
    expect(statuses).toEqual([
      { id: 's1', projectId: '', name: 'Por hacer', category: 'ISSUE_STATE_TODO', rank: 'a' },
    ]);

    client.createStatus('p1', { name: 'QA', category: 'ISSUE_STATE_IN_PROGRESS' }).subscribe();
    const create = httpMock.expectOne(url('/v1/projects/p1/statuses'));
    expect(create.request.method).toBe('POST');
    create.flush({ status: { id: 's9' } });

    client.updateStatus('p1', 's9', { afterStatusId: '' }).subscribe();
    const update = httpMock.expectOne(url('/v1/projects/p1/statuses/s9'));
    expect(update.request.method).toBe('PATCH');
    // Presente y vacío = al principio: tiene que viajar.
    expect(update.request.body).toEqual({ afterStatusId: '' });
    update.flush({ status: { id: 's9' } });

    client.deleteStatus('p1', 's9', 's1').subscribe();
    const del = httpMock.expectOne((r) => r.url === url('/v1/projects/p1/statuses/s9'));
    expect(del.request.method).toBe('DELETE');
    expect(del.request.params.get('moveToStatusId')).toBe('s1');
    del.flush({});

    client.deleteStatus('p1', 's1').subscribe();
    const empty = httpMock.expectOne((r) => r.url === url('/v1/projects/p1/statuses/s1'));
    expect(empty.request.params.has('moveToStatusId')).toBe(false);
    empty.flush({});
  });

  it('etiquetas: el color desconocido cae en UNSPECIFIED', () => {
    let labels: Label[] = [];
    client.listLabels('p1').subscribe((res) => (labels = res));
    httpMock.expectOne(url('/v1/projects/p1/labels')).flush({
      labels: [
        { id: 'l1', name: 'API', color: 'LABEL_COLOR_INFO' },
        { id: 'l2', name: 'web', color: 'LABEL_COLOR_NUEVO' },
      ],
    });
    expect(labels.map((l) => l.color)).toEqual(['LABEL_COLOR_INFO', 'LABEL_COLOR_UNSPECIFIED']);

    client.updateLabel('p1', 'l1', { color: 'LABEL_COLOR_DANGER' }).subscribe();
    const update = httpMock.expectOne(url('/v1/projects/p1/labels/l1'));
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ color: 'LABEL_COLOR_DANGER' });
    update.flush({ label: { id: 'l1' } });

    client.deleteLabel('p1', 'l1').subscribe();
    httpMock.expectOne(url('/v1/projects/p1/labels/l1')).flush({});
  });

  it('comentar y leer el historial (oneof → kind)', () => {
    client.createComment('p1', 42, 'Hola').subscribe();
    const comment = httpMock.expectOne(url('/v1/projects/p1/issues/42/comments'));
    expect(comment.request.body).toEqual({ body: 'Hola' });
    comment.flush({ comment: { id: 'c1', body: 'Hola' } });

    let events: IssueEvent[] = [];
    client
      .listIssueEvents('p1', 42, { cursor: 'n1', limit: 50 })
      .subscribe((res) => (events = res.events));
    const req = httpMock.expectOne((r) => r.url === url('/v1/projects/p1/issues/42/events'));
    expect(req.request.params.get('page.cursor')).toBe('n1');
    req.flush({
      events: [
        { id: 'e1', actorId: 'u1', created: {} },
        {
          id: 'e2',
          statusChanged: {
            fromStatusName: 'Por hacer',
            toStatusName: 'Hecho',
            toState: 'ISSUE_STATE_DONE',
          },
        },
        { id: 'e3', titleChanged: { from: 'a', to: 'b' } },
        { id: 'e4', descriptionChanged: {} },
        { id: 'e5', priorityChanged: { to: 'PRIORITY_URGENT' } },
        { id: 'e6', labelsChanged: { addedLabelNames: ['API'] } },
        { id: 'e7', commented: { id: 'c1', body: 'Hola', authorId: 'u1' } },
        { id: 'e8', algoNuevo: {} },
      ],
    });

    expect(events.map((e) => e.change.kind)).toEqual([
      'created',
      'statusChanged',
      'titleChanged',
      'descriptionChanged',
      'priorityChanged',
      'labelsChanged',
      'commented',
      'unknown',
    ]);
    expect(events[1]!.change).toMatchObject({
      fromState: 'ISSUE_STATE_UNSPECIFIED',
      toState: 'ISSUE_STATE_DONE',
      toStatusName: 'Hecho',
    });
    expect(events[4]!.change).toMatchObject({
      from: 'PRIORITY_UNSPECIFIED',
      to: 'PRIORITY_URGENT',
    });
    expect(events[5]!.change).toMatchObject({ addedLabelNames: ['API'], removedLabelNames: [] });
    expect(events[0]).toMatchObject({ actorId: 'u1', createdAt: '' });
  });
});
