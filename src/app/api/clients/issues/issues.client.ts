import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';

import { RestClient } from '../rest/rest.client';
import type {
  BoardState,
  CreateIssueRequest,
  CreateProjectRequest,
  Issue,
  ListIssuesRequest,
  ListIssuesResponse,
  ListProjectsResponse,
  PageRequest,
  Project,
  RawIssueEnvelope,
  RawListIssuesResponse,
  RawListProjectsResponse,
  RawProjectEnvelope,
} from './issues.contracts';
import { toIssue, toPage, toProject } from './issues.mappers';

const PROJECTS = '/v1/projects';

/** Tamaño de página al traer "todo" (tablero, lista de proyectos). */
export const BULK_PAGE_LIMIT = 100;
/** Corta la paginación aunque el backend diga `hasNext` (protección ante un bucle). */
export const MAX_PAGES = 50;

/**
 * Cliente tipado del `IssueService` (vía gateway REST). Sólo HTTP: sin estado.
 * Devuelve siempre modelos normalizados (ver `issues.mappers.ts`). Lo usan las
 * features `projects` y `board`, por eso vive en la capa `api/` y no en una feature.
 */
@Injectable({ providedIn: 'root' })
export class IssuesClient {
  private readonly rest = inject(RestClient);

  listProjects(page: PageRequest = {}): Observable<ListProjectsResponse> {
    return this.rest
      .get<RawListProjectsResponse>(PROJECTS, { params: pageParams(page) })
      .pipe(
        map((res) => ({ projects: (res.projects ?? []).map(toProject), page: toPage(res.page) })),
      );
  }

  /** Todas las páginas de proyectos. */
  listAllProjects(): Observable<Project[]> {
    return collectPages((cursor) =>
      this.listProjects({ cursor, limit: BULK_PAGE_LIMIT }).pipe(
        map((res) => ({ items: res.projects, page: res.page })),
      ),
    );
  }

  createProject(body: CreateProjectRequest): Observable<Project> {
    return this.rest
      .post<RawProjectEnvelope>(PROJECTS, body)
      .pipe(map((res) => toProject(res.project)));
  }

  listIssues(projectId: string, req: ListIssuesRequest = {}): Observable<ListIssuesResponse> {
    const params = {
      ...pageParams(req.page ?? {}),
      state: req.state && req.state !== 'ISSUE_STATE_UNSPECIFIED' ? req.state : undefined,
    };
    return this.rest
      .get<RawListIssuesResponse>(issuesPath(projectId), { params })
      .pipe(map((res) => ({ issues: (res.issues ?? []).map(toIssue), page: toPage(res.page) })));
  }

  /** Todos los issues del proyecto (todas las páginas), en el orden del backend. */
  listAllIssues(projectId: string): Observable<Issue[]> {
    return collectPages((cursor) =>
      this.listIssues(projectId, { page: { cursor, limit: BULK_PAGE_LIMIT } }).pipe(
        map((res) => ({ items: res.issues, page: res.page })),
      ),
    );
  }

  getIssue(projectId: string, number: number): Observable<Issue> {
    return this.rest
      .get<RawIssueEnvelope>(`${issuesPath(projectId)}/${number}`)
      .pipe(map((res) => toIssue(res.issue)));
  }

  createIssue(projectId: string, body: CreateIssueRequest): Observable<Issue> {
    return this.rest
      .post<RawIssueEnvelope>(issuesPath(projectId), body)
      .pipe(map((res) => toIssue(res.issue)));
  }

  moveIssue(projectId: string, number: number, state: BoardState): Observable<Issue> {
    return this.rest
      .post<RawIssueEnvelope>(`${issuesPath(projectId)}/${number}:move`, { state })
      .pipe(map((res) => toIssue(res.issue)));
  }
}

function issuesPath(projectId: string): string {
  return `${PROJECTS}/${encodeURIComponent(projectId)}/issues`;
}

/** grpc-gateway lee los campos de mensajes anidados con notación de punto. */
function pageParams(page: PageRequest) {
  return {
    'page.cursor': page.cursor || undefined,
    'page.limit': page.limit && page.limit > 0 ? page.limit : undefined,
  };
}

interface Chunk<T> {
  items: T[];
  page: { nextCursor: string; hasNext: boolean };
}

/** Pide páginas en serie mientras haya `hasNext` y un cursor, y junta los items. */
function collectPages<T>(fetchPage: (cursor?: string) => Observable<Chunk<T>>): Observable<T[]> {
  let pages = 0;
  return fetchPage().pipe(
    expand((chunk) => {
      pages++;
      const more = chunk.page.hasNext && chunk.page.nextCursor !== '' && pages < MAX_PAGES;
      return more ? fetchPage(chunk.page.nextCursor) : EMPTY;
    }),
    reduce((all, chunk) => all.concat(chunk.items), [] as T[]),
  );
}
