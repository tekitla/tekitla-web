import type * as fm from '@tekitla/tekitla-protos/issues/v1/flow_metrics_pb';
import type * as sp from '@tekitla/tekitla-protos/issues/v1/agent_sessions_pb';

import type { AgentTool, Json, RawPageResponse, PageResponse } from './issues.contracts';

/**
 * Métricas de flujo (issue 036, `GetFlowMetrics`) y sesiones de agentes
 * (issue 026, `ListAgentSessions` y `Issue.sessions`) tal como las expone el
 * gateway. Igual que `issues.contracts.ts`: los `Raw*` son lo que llega (todo
 * opcional) y los normalizados lo que usa la app (`metrics.mappers.ts`).
 *
 * JSON de grpc-gateway además de lo de `issues.contracts.ts`:
 * - `google.protobuf.Duration` llega como texto en segundos (`"3600s"`); acá
 *   se normaliza a segundos (`number`), `null` si no vino.
 */

/** Qué tan confiable es un número: registrado en vivo o histórico aproximado. */
export type MetricConfidence = `METRIC_CONFIDENCE_${keyof typeof fm.MetricConfidence}`;

/** Mediana y p85 en segundos; `null` si `count` es 0. */
export type DurationStats = Json<fm.DurationStats, { median: number | null; p85: number | null }>;

export type MetricSource = Json<fm.MetricSource, { confidence: MetricConfidence }>;

/** Una semana `[start, end)`; la primera y la última pueden venir recortadas. */
export type FlowWeek = Json<
  fm.FlowWeek,
  {
    start: string;
    end: string;
    leadTime: DurationStats;
    cycleTime: DurationStats;
    source: MetricSource;
  }
>;

export type FlowSummary = Json<
  fm.FlowSummary,
  { leadTime: DurationStats; cycleTime: DurationStats; source: MetricSource }
>;

/** En curso y sin actividad hace `stale_after_days` o más. */
export type StaleIssue = Json<
  fm.StaleIssue,
  { inProgressSince: string; lastActivityAt: string; confidence: MetricConfidence }
>;

export type FlowCoverage = Json<fm.FlowCoverage>;

export type FlowMetrics = Json<
  fm.GetFlowMetricsResponse,
  {
    from: string;
    to: string;
    weeks: FlowWeek[];
    summary: FlowSummary;
    stale: StaleIssue[];
    coverage: FlowCoverage;
  }
>;

/** Parámetros de `GetFlowMetrics`; ausente = el valor por defecto del servicio. */
export interface FlowMetricsRequest {
  /** RFC 3339. */
  from?: string;
  to?: string;
  timeZone?: string;
  labelIds?: readonly string[];
  staleAfterDays?: number;
  staleLimit?: number;
}

// ── Sesiones de agentes (026) ───────────────────────────────────────────────

/** `STALLED` (colgado) solo sale al leer: trabaja y no reporta hace más de 10 min. */
export type SessionStatus = `SESSION_STATUS_${keyof typeof sp.SessionStatus}`;
export type WaitingOn = `WAITING_ON_${keyof typeof sp.WaitingOn}`;
export type SessionLink = `SESSION_LINK_${keyof typeof sp.SessionLink}`;
export type SessionSource = `SESSION_SOURCE_${keyof typeof sp.SessionSource}`;

/** Una corrida de una herramienta en una terminal (herdr). Solo las propias. */
export type AgentSession = Json<
  sp.AgentSession,
  {
    source: SessionSource;
    tool: AgentTool;
    link: SessionLink;
    status: SessionStatus;
    waitingOn: WaitingOn;
    statusChangedAt: string;
    lastSeenAt: string;
    startedAt: string;
    endedAt: string;
  }
>;

export interface ListAgentSessionsRequest {
  projectId?: string;
  issueNumber?: number;
  statuses?: readonly SessionStatus[];
  includeInactive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListAgentSessionsResponse {
  sessions: AgentSession[];
  page: PageResponse;
}

// ── Raw (lo que llega por la red) ───────────────────────────────────────────

export interface RawDurationStats {
  count?: number;
  median?: string;
  p85?: string;
}

export type RawMetricSource = Partial<MetricSource>;

export type RawFlowWeek = Partial<Omit<FlowWeek, 'leadTime' | 'cycleTime' | 'source'>> & {
  leadTime?: RawDurationStats;
  cycleTime?: RawDurationStats;
  source?: RawMetricSource;
};

export type RawFlowSummary = Partial<Omit<FlowSummary, 'leadTime' | 'cycleTime' | 'source'>> & {
  leadTime?: RawDurationStats;
  cycleTime?: RawDurationStats;
  source?: RawMetricSource;
};

export type RawStaleIssue = Partial<Omit<StaleIssue, 'number'>> & { number?: number | string };

export interface RawFlowMetrics {
  from?: string;
  to?: string;
  timeZone?: string;
  weeks?: RawFlowWeek[];
  summary?: RawFlowSummary;
  stale?: RawStaleIssue[];
  staleTotal?: number;
  valueLabelIds?: string[];
  coverage?: Partial<FlowCoverage>;
}

export type RawAgentSession = Partial<Omit<AgentSession, 'issueNumber'>> & {
  issueNumber?: number | string;
};

export interface RawListAgentSessionsResponse {
  sessions?: RawAgentSession[];
  page?: RawPageResponse;
}
