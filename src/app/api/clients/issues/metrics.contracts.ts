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

/**
 * Para qué espera una sesión a su persona (token `espera_motivo`, issue 036).
 * UNSPECIFIED = sin motivo.
 */
export type WaitingReason = `WAITING_REASON_${keyof typeof sp.WaitingReason}`;

/** Tiempo de espera a una persona con un motivo (segundos). */
export type ReasonTime = Json<fm.ReasonTime, { reason: WaitingReason; duration: number }>;

/**
 * Dónde se va el tiempo según las sesiones de agentes (parte 3, CU-036-6).
 * Duraciones en segundos; `efficiencyBp` en puntos base, `null` sin tiempo
 * medido.
 */
export type FlowEfficiency = Json<
  fm.FlowEfficiency,
  {
    working: number;
    waitingHuman: number;
    blocked: number;
    inReview: number;
    idle: number;
    efficiencyBp: number | null;
    waitingHumanByReason: ReasonTime[];
  }
>;

/** Esperas a una persona: pendientes, la más vieja y cuánto tardan. */
export type HumanQueue = Json<
  fm.HumanQueue,
  { responseTime: DurationStats; oldestPending: number | null }
>;

/** Una semana `[start, end)`; la primera y la última pueden venir recortadas. */
export type FlowWeek = Json<
  fm.FlowWeek,
  {
    start: string;
    end: string;
    leadTime: DurationStats;
    cycleTime: DurationStats;
    source: MetricSource;
    /** `null`: la semana termina antes de que hubiera historia de sesiones. */
    efficiency: FlowEfficiency | null;
    humanQueue: HumanQueue | null;
  }
>;

export type FlowSummary = Json<
  fm.FlowSummary,
  {
    leadTime: DurationStats;
    cycleTime: DurationStats;
    source: MetricSource;
    efficiency: FlowEfficiency | null;
    humanQueue: HumanQueue | null;
  }
>;

export type HiringVerdict = `HIRING_VERDICT_${keyof typeof fm.HiringVerdict}`;

export type ProfileShare = Json<fm.ProfileShare, { reason: WaitingReason }>;

/** Los números de 4 semanas que sostienen la señal. */
export type SignalWindow = Json<
  fm.SignalWindow,
  { start: string; end: string; efficiency: FlowEfficiency; humanResponse: DurationStats }
>;

/** Señal de contratación (CU-036-7 y 8): una señal, no una decisión. */
export type HiringSignal = Json<
  fm.HiringSignal,
  {
    verdict: HiringVerdict;
    profiles: ProfileShare[];
    current: SignalWindow | null;
    previous: SignalWindow | null;
  }
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
    /** Desde cuándo hay historia de sesiones; vacío: ninguna. */
    sessionsRecordedSince: string;
    hiringSignal: HiringSignal | null;
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
    waitingReason: WaitingReason;
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

export interface RawFlowEfficiency {
  working?: string;
  waitingHuman?: string;
  blocked?: string;
  inReview?: string;
  idle?: string;
  efficiencyBp?: number;
  issues?: number;
  waitingHumanByReason?: { reason?: WaitingReason; duration?: string }[];
}

export interface RawHumanQueue {
  pending?: number;
  responseTime?: RawDurationStats;
  oldestPending?: string;
}

type SessionParts = 'efficiency' | 'humanQueue';

export type RawFlowWeek = Partial<
  Omit<FlowWeek, 'leadTime' | 'cycleTime' | 'source' | SessionParts>
> & {
  leadTime?: RawDurationStats;
  cycleTime?: RawDurationStats;
  source?: RawMetricSource;
  efficiency?: RawFlowEfficiency;
  humanQueue?: RawHumanQueue;
};

export type RawFlowSummary = Partial<
  Omit<FlowSummary, 'leadTime' | 'cycleTime' | 'source' | SessionParts>
> & {
  leadTime?: RawDurationStats;
  cycleTime?: RawDurationStats;
  source?: RawMetricSource;
  efficiency?: RawFlowEfficiency;
  humanQueue?: RawHumanQueue;
};

export interface RawSignalWindow {
  start?: string;
  end?: string;
  efficiency?: RawFlowEfficiency;
  humanResponse?: RawDurationStats;
  wipMedian?: number;
  closed?: number;
}

export interface RawHiringSignal {
  verdict?: HiringVerdict;
  liveWeeks?: number;
  weeksNeeded?: number;
  weeksNeededPreliminary?: number;
  preliminary?: boolean;
  wipHigh?: boolean;
  profiles?: { reason?: WaitingReason; shareBp?: number }[];
  current?: RawSignalWindow;
  previous?: RawSignalWindow;
}

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
  sessionsRecordedSince?: string;
  hiringSignal?: RawHiringSignal;
}

export type RawAgentSession = Partial<Omit<AgentSession, 'issueNumber'>> & {
  issueNumber?: number | string;
};

export interface RawListAgentSessionsResponse {
  sessions?: RawAgentSession[];
  page?: RawPageResponse;
}
