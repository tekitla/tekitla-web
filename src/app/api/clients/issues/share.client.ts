import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { RestClient } from '../rest/rest.client';
import { SKIP_AUTH } from '../../http/tokens';
import { BULK_PAGE_LIMIT, fetchPages } from './issues.client';
import type {
  CreateShareLinkRequest,
  CreatedShareLink,
  ListSharedIssuesRequest,
  ListSharedIssuesResponse,
  RawCreatedShareLink,
  RawListShareLinksResponse,
  RawListSharedIssuesResponse,
  RawShareLinkEnvelope,
  RawSharedIssueEnvelope,
  RawSharedProjectView,
  ShareLink,
  SharedIssue,
  SharedProjectView,
} from './share.contracts';
import {
  toListSharedIssues,
  toShareLink,
  toSharedIssue,
  toSharedProjectView,
} from './share.mappers';

function shareLinksPath(projectId: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}/share-links`;
}

/**
 * Gestión de los enlaces de solo lectura de un proyecto (issue 009): con la
 * sesión del dueño. Sólo HTTP.
 */
@Injectable({ providedIn: 'root' })
export class ShareLinksClient {
  private readonly rest = inject(RestClient);

  /** Crea un enlace. El token viene solo en esta respuesta. */
  create(projectId: string, req: CreateShareLinkRequest): Observable<CreatedShareLink> {
    return this.rest
      .post<RawCreatedShareLink>(shareLinksPath(projectId), req)
      .pipe(map((res) => ({ shareLink: toShareLink(res.shareLink), token: res.token ?? '' })));
  }

  /** Enlaces del proyecto, los más nuevos primero (también revocados y vencidos). */
  list(projectId: string): Observable<ShareLink[]> {
    return this.rest
      .get<RawListShareLinksResponse>(shareLinksPath(projectId))
      .pipe(map((res) => (res.shareLinks ?? []).map(toShareLink)));
  }

  revoke(projectId: string, shareLinkId: string): Observable<ShareLink> {
    return this.rest
      .post<RawShareLinkEnvelope>(
        `${shareLinksPath(projectId)}/${encodeURIComponent(shareLinkId)}:revoke`,
        {},
      )
      .pipe(map((res) => toShareLink(res.shareLink)));
  }
}

/**
 * Lectura pública de un proyecto por el token de un enlace (issue 009). Sin
 * sesión (`SKIP_AUTH`: no manda el ID token ni reintenta un 401). El token va
 * en el cuerpo de un POST: así no queda en el path, que sí se registra.
 */
@Injectable({ providedIn: 'root' })
export class SharedClient {
  private readonly rest = inject(RestClient);
  private readonly options = { context: new HttpContext().set(SKIP_AUTH, true) };

  getProject(token: string): Observable<SharedProjectView> {
    return this.rest
      .post<RawSharedProjectView>('/v1/shared/project:get', { token }, this.options)
      .pipe(map(toSharedProjectView));
  }

  listIssues(
    token: string,
    req: ListSharedIssuesRequest = {},
  ): Observable<ListSharedIssuesResponse> {
    const page = req.page ?? {};
    return this.rest
      .post<RawListSharedIssuesResponse>(
        '/v1/shared/issues:list',
        { token, page: { cursor: page.cursor || undefined, limit: page.limit || undefined } },
        this.options,
      )
      .pipe(map(toListSharedIssues));
  }

  /** Todos los issues que deja ver el enlace (todas las páginas), en orden. */
  listAllIssues(token: string): Observable<SharedIssue[]> {
    return fetchPages((cursor) =>
      this.listIssues(token, { page: { cursor, limit: BULK_PAGE_LIMIT } }).pipe(
        map((res) => ({ items: res.issues, page: res.page })),
      ),
    ).pipe(map((all) => all.items));
  }

  /** Un issue (solo con alcance panel; con plan, 404). */
  getIssue(token: string, number: number): Observable<SharedIssue> {
    return this.rest
      .post<RawSharedIssueEnvelope>('/v1/shared/issues:get', { token, number }, this.options)
      .pipe(map((res) => toSharedIssue(res.issue)));
  }
}
