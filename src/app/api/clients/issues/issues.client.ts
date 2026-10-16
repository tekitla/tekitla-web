import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';

import { RestClient } from '../rest/rest.client';
import type {
  BatchUpdateStatusesRequest,
  Comment,
  CreateIssueRequest,
  CreateLabelRequest,
  CreateProjectRequest,
  CreateStatusRequest,
  DiscardIssueRequest,
  Issue,
  IssueEvent,
  Label,
  ListIssueEventsResponse,
  ListIssuesRequest,
  ListIssuesResponse,
  ListProjectsResponse,
  MoveIssueRequest,
  PageRequest,
  Project,
  RawCommentEnvelope,
  RawIssueEnvelope,
  RawLabelEnvelope,
  RawListIssueEventsResponse,
  RawListIssuesResponse,
  RawListLabelsResponse,
  RawListProjectsResponse,
  RawListStatusesResponse,
  RawProjectEnvelope,
  RawStatusEnvelope,
  Status,
  UpdateIssueRequest,
  UpdateLabelRequest,
  UpdateStatusRequest,
} from './issues.contracts';
import {
  toComment,
  toIssue,
  toIssueEvent,
  toLabel,
  toPage,
  toProject,
  toStatus,
} from './issues.mappers';

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

  /**
   * Una página de issues. Los filtros vacíos no viajan (sin ellos, como en
   * v0.3); `orderBy` RANK tampoco, porque es el default.
   */
  listIssues(projectId: string, req: ListIssuesRequest = {}): Observable<ListIssuesResponse> {
    const list = <T>(values?: readonly T[]) => (values?.length ? values : undefined);
    const params = {
      ...pageParams(req.page ?? {}),
      state: req.state && req.state !== 'ISSUE_STATE_UNSPECIFIED' ? req.state : undefined,
      query: req.query?.trim() || undefined,
      states: list(req.states),
      status_ids: list(req.statusIds),
      priorities: list(req.priorities),
      label_ids: list(req.labelIds),
      order_by:
        req.orderBy &&
        req.orderBy !== 'ISSUE_ORDER_UNSPECIFIED' &&
        req.orderBy !== 'ISSUE_ORDER_RANK'
          ? req.orderBy
          : undefined,
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
      .get<RawIssueEnvelope>(issuePath(projectId, number))
      .pipe(map((res) => toIssue(res.issue)));
  }

  createIssue(projectId: string, body: CreateIssueRequest): Observable<Issue> {
    return this.rest
      .post<RawIssueEnvelope>(issuesPath(projectId), body)
      .pipe(map((res) => toIssue(res.issue)));
  }

  /** Cambia de estado y, con vecinos, de lugar en la columna (ver `MoveIssueRequest`). */
  moveIssue(projectId: string, number: number, req: MoveIssueRequest): Observable<Issue> {
    const body = {
      statusId: req.statusId,
      afterNumber: req.afterNumber || undefined,
      beforeNumber: req.beforeNumber || undefined,
    };
    return this.rest
      .post<RawIssueEnvelope>(`${issuePath(projectId, number)}:move`, body)
      .pipe(map((res) => toIssue(res.issue)));
  }

  /** Edita solo lo que viene; `labelIds` va como `labels: {ids}` (presencia en el proto). */
  updateIssue(projectId: string, number: number, req: UpdateIssueRequest): Observable<Issue> {
    const { labelIds, ...rest } = req;
    const body = labelIds ? { ...rest, labels: { ids: labelIds } } : rest;
    return this.rest
      .patch<RawIssueEnvelope>(issuePath(projectId, number), body)
      .pipe(map((res) => toIssue(res.issue)));
  }

  /** Lo pasa a un estado CANCELED con motivo (ver `DiscardIssueRequest`). */
  discardIssue(projectId: string, number: number, req: DiscardIssueRequest): Observable<Issue> {
    const body = { reason: req.reason, statusId: req.statusId || undefined };
    return this.rest
      .post<RawIssueEnvelope>(`${issuePath(projectId, number)}:discard`, body)
      .pipe(map((res) => toIssue(res.issue)));
  }

  /**
   * Lo vuelve al primer estado de categoría TODO, al final de la columna. Uno
   * que no está descartado: FAILED_PRECONDITION `ISSUE_NOT_DISCARDED`.
   */
  restoreIssue(projectId: string, number: number): Observable<Issue> {
    return this.rest
      .post<RawIssueEnvelope>(`${issuePath(projectId, number)}:restore`, {})
      .pipe(map((res) => toIssue(res.issue)));
  }

  createComment(projectId: string, number: number, body: string): Observable<Comment> {
    return this.rest
      .post<RawCommentEnvelope>(`${issuePath(projectId, number)}/comments`, { body })
      .pipe(map((res) => toComment(res.comment)));
  }

  listIssueEvents(
    projectId: string,
    number: number,
    page: PageRequest = {},
  ): Observable<ListIssueEventsResponse> {
    return this.rest
      .get<RawListIssueEventsResponse>(`${issuePath(projectId, number)}/events`, {
        params: pageParams(page),
      })
      .pipe(
        map((res) => ({ events: (res.events ?? []).map(toIssueEvent), page: toPage(res.page) })),
      );
  }

  // ── Estados (columnas) ────────────────────────────────────────────────────

  /** Sin paginar (máximo 20), en el orden de las columnas. */
  listStatuses(projectId: string): Observable<Status[]> {
    return this.rest
      .get<RawListStatusesResponse>(`${projectPath(projectId)}/statuses`)
      .pipe(map((res) => (res.statuses ?? []).map(toStatus)));
  }

  createStatus(projectId: string, req: CreateStatusRequest): Observable<Status> {
    return this.rest
      .post<RawStatusEnvelope>(`${projectPath(projectId)}/statuses`, req)
      .pipe(map((res) => toStatus(res.status)));
  }

  updateStatus(projectId: string, statusId: string, req: UpdateStatusRequest): Observable<Status> {
    return this.rest
      .patch<RawStatusEnvelope>(statusPath(projectId, statusId), req)
      .pipe(map((res) => toStatus(res.status)));
  }

  /** Borra el estado y pasa sus issues a `moveToStatusId` (obligatorio si tiene issues). */
  deleteStatus(projectId: string, statusId: string, moveToStatusId?: string): Observable<void> {
    return this.rest
      .delete<unknown>(statusPath(projectId, statusId), {
        params: { moveToStatusId: moveToStatusId || undefined },
      })
      .pipe(map(() => undefined));
  }

  /**
   * Guarda la lista completa de estados en una transacción (todo o nada) y
   * devuelve cómo quedaron, en el orden de las columnas.
   */
  batchUpdateStatuses(projectId: string, req: BatchUpdateStatusesRequest): Observable<Status[]> {
    return this.rest
      .post<RawListStatusesResponse>(`${projectPath(projectId)}/statuses:batchUpdate`, req)
      .pipe(map((res) => (res.statuses ?? []).map(toStatus)));
  }

  // ── Etiquetas ─────────────────────────────────────────────────────────────

  /** Sin paginar (máximo 100), por nombre. */
  listLabels(projectId: string): Observable<Label[]> {
    return this.rest
      .get<RawListLabelsResponse>(`${projectPath(projectId)}/labels`)
      .pipe(map((res) => (res.labels ?? []).map(toLabel)));
  }

  createLabel(projectId: string, req: CreateLabelRequest): Observable<Label> {
    return this.rest
      .post<RawLabelEnvelope>(`${projectPath(projectId)}/labels`, req)
      .pipe(map((res) => toLabel(res.label)));
  }

  updateLabel(projectId: string, labelId: string, req: UpdateLabelRequest): Observable<Label> {
    return this.rest
      .patch<RawLabelEnvelope>(labelPath(projectId, labelId), req)
      .pipe(map((res) => toLabel(res.label)));
  }

  /** Borra la etiqueta y la quita de todos los issues. */
  deleteLabel(projectId: string, labelId: string): Observable<void> {
    return this.rest.delete<unknown>(labelPath(projectId, labelId)).pipe(map(() => undefined));
  }
}

function projectPath(projectId: string): string {
  return `${PROJECTS}/${encodeURIComponent(projectId)}`;
}

function issuesPath(projectId: string): string {
  return `${projectPath(projectId)}/issues`;
}

function issuePath(projectId: string, number: number): string {
  return `${issuesPath(projectId)}/${number}`;
}

function statusPath(projectId: string, statusId: string): string {
  return `${projectPath(projectId)}/statuses/${encodeURIComponent(statusId)}`;
}

function labelPath(projectId: string, labelId: string): string {
  return `${projectPath(projectId)}/labels/${encodeURIComponent(labelId)}`;
}

/** grpc-gateway lee los campos de mensajes anidados con notación de punto. */
function pageParams(page: PageRequest) {
  return {
    'page.cursor': page.cursor || undefined,
    'page.limit': page.limit && page.limit > 0 ? page.limit : undefined,
  };
}

/** Una página: sus items y la paginación que devolvió el backend. */
export interface Chunk<T> {
  items: T[];
  page: { nextCursor: string; hasNext: boolean };
}

/** Varias páginas juntas: los items, cuántas se pidieron y desde dónde seguir. */
export interface Pages<T> {
  items: T[];
  pages: number;
  nextCursor: string;
  hasNext: boolean;
}

/**
 * Pide páginas en serie desde `cursor` (`''` = la primera) mientras haya
 * `hasNext` y un cursor, hasta `maxPages` (nunca más de `MAX_PAGES`), y junta
 * los items.
 */
export function fetchPages<T>(
  fetchPage: (cursor: string) => Observable<Chunk<T>>,
  cursor = '',
  maxPages = MAX_PAGES,
): Observable<Pages<T>> {
  const limit = Math.min(maxPages, MAX_PAGES);
  const more = (chunk: Chunk<T>) => chunk.page.hasNext && chunk.page.nextCursor !== '';
  return fetchPage(cursor).pipe(
    expand((chunk, index) =>
      more(chunk) && index + 1 < limit ? fetchPage(chunk.page.nextCursor) : EMPTY,
    ),
    reduce(
      (all, chunk) => ({
        items: all.items.concat(chunk.items),
        pages: all.pages + 1,
        nextCursor: more(chunk) ? chunk.page.nextCursor : '',
        hasNext: more(chunk),
      }),
      { items: [], pages: 0, nextCursor: '', hasNext: false } as Pages<T>,
    ),
  );
}

/** Todas las páginas (hasta `MAX_PAGES`), sólo los items. */
function collectPages<T>(fetchPage: (cursor?: string) => Observable<Chunk<T>>): Observable<T[]> {
  return fetchPages((cursor) => fetchPage(cursor || undefined)).pipe(map((all) => all.items));
}
