import type { AgentTool } from './issues.contracts';
import { toPage } from './issues.mappers';
import type {
  AgentSession,
  DurationStats,
  FlowEfficiency,
  HiringSignal,
  HumanQueue,
  RawFlowEfficiency,
  RawHiringSignal,
  RawHumanQueue,
  RawSignalWindow,
  SignalWindow,
  FlowMetrics,
  FlowSummary,
  FlowWeek,
  ListAgentSessionsResponse,
  MetricSource,
  RawAgentSession,
  RawDurationStats,
  RawFlowMetrics,
  RawFlowSummary,
  RawFlowWeek,
  RawListAgentSessionsResponse,
  RawMetricSource,
  RawStaleIssue,
  StaleIssue,
} from './metrics.contracts';

/**
 * `google.protobuf.Duration` en JSON: `"3600s"`, `"1.5s"`, `"-2s"`. Devuelve
 * segundos; `null` si no vino o no se entiende.
 */
export function toSeconds(raw: string | undefined | null): number | null {
  if (raw == null || raw === '') return null;
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

export function toDurationStats(raw: RawDurationStats = {}): DurationStats {
  const count = raw.count ?? 0;
  return {
    count,
    median: count > 0 ? toSeconds(raw.median) : null,
    p85: count > 0 ? toSeconds(raw.p85) : null,
  };
}

function toMetricSource(raw: RawMetricSource = {}): MetricSource {
  return {
    confidence: raw.confidence ?? 'METRIC_CONFIDENCE_UNSPECIFIED',
    live: raw.live ?? 0,
    importHistory: raw.importHistory ?? 0,
    importFile: raw.importFile ?? 0,
    importSync: raw.importSync ?? 0,
  };
}

function toFlowWeek(raw: RawFlowWeek): FlowWeek {
  return {
    start: raw.start ?? '',
    end: raw.end ?? '',
    leadTime: toDurationStats(raw.leadTime),
    cycleTime: toDurationStats(raw.cycleTime),
    closedValue: raw.closedValue ?? 0,
    closedOther: raw.closedOther ?? 0,
    canceled: raw.canceled ?? 0,
    started: raw.started ?? 0,
    wip: raw.wip ?? 0,
    source: toMetricSource(raw.source),
    efficiency: raw.efficiency ? toFlowEfficiency(raw.efficiency) : null,
    humanQueue: raw.humanQueue ? toHumanQueue(raw.humanQueue) : null,
  };
}

function toFlowSummary(raw: RawFlowSummary = {}): FlowSummary {
  return {
    leadTime: toDurationStats(raw.leadTime),
    cycleTime: toDurationStats(raw.cycleTime),
    closedValue: raw.closedValue ?? 0,
    closedOther: raw.closedOther ?? 0,
    canceled: raw.canceled ?? 0,
    started: raw.started ?? 0,
    wip: raw.wip ?? 0,
    source: toMetricSource(raw.source),
    efficiency: raw.efficiency ? toFlowEfficiency(raw.efficiency) : null,
    humanQueue: raw.humanQueue ? toHumanQueue(raw.humanQueue) : null,
  };
}

/** Eficiencia (036 parte 3): duraciones ausentes son 0; sin tiempo medido, sin puntos base. */
export function toFlowEfficiency(raw: RawFlowEfficiency = {}): FlowEfficiency {
  return {
    working: toSeconds(raw.working) ?? 0,
    waitingHuman: toSeconds(raw.waitingHuman) ?? 0,
    blocked: toSeconds(raw.blocked) ?? 0,
    inReview: toSeconds(raw.inReview) ?? 0,
    idle: toSeconds(raw.idle) ?? 0,
    efficiencyBp: raw.efficiencyBp ?? null,
    issues: raw.issues ?? 0,
    waitingHumanByReason: (raw.waitingHumanByReason ?? []).map((r) => ({
      reason: r.reason ?? 'WAITING_REASON_UNSPECIFIED',
      duration: toSeconds(r.duration) ?? 0,
    })),
  };
}

export function toHumanQueue(raw: RawHumanQueue = {}): HumanQueue {
  return {
    pending: raw.pending ?? 0,
    responseTime: toDurationStats(raw.responseTime),
    oldestPending: toSeconds(raw.oldestPending),
  };
}

function toSignalWindow(raw: RawSignalWindow): SignalWindow {
  return {
    start: raw.start ?? '',
    end: raw.end ?? '',
    efficiency: toFlowEfficiency(raw.efficiency),
    humanResponse: toDurationStats(raw.humanResponse),
    wipMedian: raw.wipMedian ?? 0,
    closed: raw.closed ?? 0,
  };
}

export function toHiringSignal(raw: RawHiringSignal): HiringSignal {
  return {
    verdict: raw.verdict ?? 'HIRING_VERDICT_UNSPECIFIED',
    liveWeeks: raw.liveWeeks ?? 0,
    weeksNeeded: raw.weeksNeeded ?? 8,
    weeksNeededPreliminary: raw.weeksNeededPreliminary ?? 4,
    preliminary: raw.preliminary ?? false,
    wipHigh: raw.wipHigh ?? false,
    profiles: (raw.profiles ?? []).map((p) => ({
      reason: p.reason ?? 'WAITING_REASON_UNSPECIFIED',
      shareBp: p.shareBp ?? 0,
    })),
    current: raw.current ? toSignalWindow(raw.current) : null,
    previous: raw.previous ? toSignalWindow(raw.previous) : null,
  };
}

function toStaleIssue(raw: RawStaleIssue): StaleIssue {
  const number = Number(raw.number ?? 0);
  return {
    number: Number.isFinite(number) ? number : 0,
    title: raw.title ?? '',
    statusId: raw.statusId ?? '',
    inProgressSince: raw.inProgressSince ?? '',
    lastActivityAt: raw.lastActivityAt ?? '',
    confidence: raw.confidence ?? 'METRIC_CONFIDENCE_UNSPECIFIED',
  };
}

export function toFlowMetrics(raw: RawFlowMetrics = {}): FlowMetrics {
  return {
    from: raw.from ?? '',
    to: raw.to ?? '',
    timeZone: raw.timeZone ?? '',
    weeks: (raw.weeks ?? []).map(toFlowWeek),
    summary: toFlowSummary(raw.summary),
    stale: (raw.stale ?? []).map(toStaleIssue),
    staleTotal: raw.staleTotal ?? 0,
    valueLabelIds: raw.valueLabelIds ?? [],
    coverage: {
      issues: raw.coverage?.issues ?? 0,
      doneWithoutDates: raw.coverage?.doneWithoutDates ?? 0,
    },
    sessionsRecordedSince: raw.sessionsRecordedSince ?? '',
    hiringSignal: raw.hiringSignal ? toHiringSignal(raw.hiringSignal) : null,
  };
}

export function toAgentSession(raw: RawAgentSession = {}): AgentSession {
  const issueNumber = Number(raw.issueNumber ?? 0);
  return {
    id: raw.id ?? '',
    source: raw.source ?? 'SESSION_SOURCE_UNSPECIFIED',
    externalId: raw.externalId ?? '',
    agentActorId: raw.agentActorId ?? '',
    agentDisplayName: raw.agentDisplayName ?? '',
    tool: (raw.tool ?? 'AGENT_TOOL_UNSPECIFIED') as AgentTool,
    machine: raw.machine ?? '',
    cwdRel: raw.cwdRel ?? '',
    sessionName: raw.sessionName ?? '',
    workspaceLabel: raw.workspaceLabel ?? '',
    projectId: raw.projectId ?? '',
    issueNumber: Number.isFinite(issueNumber) ? issueNumber : 0,
    link: raw.link ?? 'SESSION_LINK_UNSPECIFIED',
    status: raw.status ?? 'SESSION_STATUS_UNSPECIFIED',
    statusChangedAt: raw.statusChangedAt ?? '',
    lastSeenAt: raw.lastSeenAt ?? '',
    startedAt: raw.startedAt ?? '',
    endedAt: raw.endedAt ?? '',
    waitingOn: raw.waitingOn ?? 'WAITING_ON_UNSPECIFIED',
    waitingTarget: raw.waitingTarget ?? '',
    waitingText: raw.waitingText ?? '',
    waitingReason: raw.waitingReason ?? 'WAITING_REASON_UNSPECIFIED',
  };
}

export function toListAgentSessions(
  raw: RawListAgentSessionsResponse = {},
): ListAgentSessionsResponse {
  return { sessions: (raw.sessions ?? []).map(toAgentSession), page: toPage(raw.page) };
}
