import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { RestClient } from '../rest/rest.client';
import { fetchPages } from './issues.client';
import type {
  AgentSession,
  FlowMetrics,
  FlowMetricsRequest,
  ListAgentSessionsRequest,
  ListAgentSessionsResponse,
  RawFlowMetrics,
  RawListAgentSessionsResponse,
} from './metrics.contracts';
import { toFlowMetrics, toListAgentSessions } from './metrics.mappers';

/**
 * Métricas de flujo (issue 036) y sesiones de agentes (issue 026), vía el
 * gateway REST. Sólo HTTP: sin estado.
 */
@Injectable({ providedIn: 'root' })
export class MetricsClient {
  private readonly rest = inject(RestClient);

  /** `GET /v1/projects/{id}/flowMetrics`. */
  getFlowMetrics(projectId: string, req: FlowMetricsRequest = {}): Observable<FlowMetrics> {
    return this.rest
      .get<RawFlowMetrics>(`/v1/projects/${encodeURIComponent(projectId)}/flowMetrics`, {
        params: {
          from: req.from || undefined,
          to: req.to || undefined,
          time_zone: req.timeZone || undefined,
          label_ids: req.labelIds?.length ? req.labelIds : undefined,
          stale_after_days: req.staleAfterDays || undefined,
          stale_limit: req.staleLimit || undefined,
        },
      })
      .pipe(map(toFlowMetrics));
  }

  /** `GET /v1/agentSessions`: las sesiones de la persona, con filtros. */
  listAgentSessions(req: ListAgentSessionsRequest = {}): Observable<ListAgentSessionsResponse> {
    return this.rest
      .get<RawListAgentSessionsResponse>('/v1/agentSessions', {
        params: {
          project_id: req.projectId || undefined,
          issue_number: req.issueNumber || undefined,
          statuses: req.statuses?.length ? req.statuses : undefined,
          include_inactive: req.includeInactive || undefined,
          'page.cursor': req.cursor || undefined,
          'page.limit': req.limit || undefined,
        },
      })
      .pipe(map(toListAgentSessions));
  }

  /**
   * Todas las sesiones activas de un proyecto, siguiendo el cursor (hasta
   * `maxPages` páginas de 100). `hasMore`: quedaron sin traer.
   */
  listAllAgentSessions(
    projectId: string,
    maxPages = 5,
  ): Observable<{ sessions: AgentSession[]; hasMore: boolean }> {
    return fetchPages(
      (cursor) =>
        this.listAgentSessions({ projectId, cursor, limit: 100 }).pipe(
          map((res) => ({ items: res.sessions, page: res.page })),
        ),
      '',
      maxPages,
    ).pipe(map((all) => ({ sessions: all.items, hasMore: all.hasNext })));
  }
}
