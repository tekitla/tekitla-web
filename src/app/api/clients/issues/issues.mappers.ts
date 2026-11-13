import type {
  Actor,
  ActorKind,
  AgentTool,
  Comment,
  DiscardInfo,
  EventSource,
  Issue,
  IssueChange,
  IssueEvent,
  IssueState,
  Label,
  LabelColor,
  PageResponse,
  Priority,
  Project,
  RawActor,
  RawComment,
  RawDiscardInfo,
  RawIssue,
  RawIssueEvent,
  RawLabel,
  RawPageResponse,
  RawProject,
  RawStatus,
  Status,
} from './issues.contracts';

const ISSUE_STATES: readonly IssueState[] = [
  'ISSUE_STATE_UNSPECIFIED',
  'ISSUE_STATE_TODO',
  'ISSUE_STATE_IN_PROGRESS',
  'ISSUE_STATE_DONE',
  'ISSUE_STATE_CANCELED',
];

const PRIORITY_VALUES: readonly Priority[] = [
  'PRIORITY_UNSPECIFIED',
  'PRIORITY_LOW',
  'PRIORITY_MEDIUM',
  'PRIORITY_HIGH',
  'PRIORITY_URGENT',
];

const LABEL_COLOR_VALUES: readonly LabelColor[] = [
  'LABEL_COLOR_UNSPECIFIED',
  'LABEL_COLOR_NEUTRAL',
  'LABEL_COLOR_INFO',
  'LABEL_COLOR_SUCCESS',
  'LABEL_COLOR_WARNING',
  'LABEL_COLOR_DANGER',
  'LABEL_COLOR_ACCENT',
  'LABEL_COLOR_BRAND',
];

const ACTOR_KINDS: readonly ActorKind[] = [
  'ACTOR_KIND_UNSPECIFIED',
  'ACTOR_KIND_PERSON',
  'ACTOR_KIND_AGENT',
];

const AGENT_TOOLS: readonly AgentTool[] = [
  'AGENT_TOOL_UNSPECIFIED',
  'AGENT_TOOL_CLAUDE_CODE',
  'AGENT_TOOL_CODEX',
  'AGENT_TOOL_CLOUD',
  'AGENT_TOOL_OTHER',
];

const EVENT_SOURCES: readonly EventSource[] = [
  'EVENT_SOURCE_UNSPECIFIED',
  'EVENT_SOURCE_LIVE',
  'EVENT_SOURCE_IMPORT_HISTORY',
  'EVENT_SOURCE_IMPORT_FILE',
  'EVENT_SOURCE_IMPORT_SYNC',
];

/**
 * grpc-gateway omite los campos con valor por defecto: ausente = default del
 * proto ('' / 0 / false / primer valor del enum / lista vacía). Un enum
 * desconocido (versión nueva del backend) también cae en UNSPECIFIED en lugar
 * de romper la UI.
 */
export function toProject(raw: RawProject = {}): Project {
  return {
    id: raw.id ?? '',
    key: raw.key ?? '',
    name: raw.name ?? '',
    description: raw.description ?? '',
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
    workspaceId: raw.workspaceId ?? '',
  };
}

export function toIssue(raw: RawIssue = {}): Issue {
  const number = Number(raw.number ?? 0);
  return {
    id: raw.id ?? '',
    projectId: raw.projectId ?? '',
    number: Number.isFinite(number) ? number : 0,
    title: raw.title ?? '',
    description: raw.description ?? '',
    state: toState(raw.state),
    priority: toPriority(raw.priority),
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
    rank: raw.rank ?? '',
    statusId: raw.statusId ?? '',
    labelIds: raw.labelIds ?? [],
    discard: raw.discard ? toDiscardInfo(raw.discard) : null,
    assigneeActorId: raw.assigneeActorId ?? '',
    sourceKey: raw.sourceKey ?? '',
  };
}

function toDiscardInfo(raw: RawDiscardInfo): DiscardInfo {
  return {
    reason: raw.reason ?? '',
    actorId: raw.actorId ?? '',
    discardedAt: raw.discardedAt ?? '',
  };
}

/**
 * Un backend de v0.3 no manda color: queda UNSPECIFIED y el panel usa el tono
 * de la categoría.
 */
export function toStatus(raw: RawStatus = {}): Status {
  return {
    id: raw.id ?? '',
    projectId: raw.projectId ?? '',
    name: raw.name ?? '',
    category: toState(raw.category),
    rank: raw.rank ?? '',
    color: toColor(raw.color),
    wipLimit: Number(raw.wipLimit ?? 0) || 0,
    hidden: raw.hidden ?? false,
  };
}

export function toLabel(raw: RawLabel = {}): Label {
  return {
    id: raw.id ?? '',
    projectId: raw.projectId ?? '',
    name: raw.name ?? '',
    color: toColor(raw.color),
    countsAsValue: raw.countsAsValue ?? false,
  };
}

export function toComment(raw: RawComment = {}): Comment {
  return {
    id: raw.id ?? '',
    issueId: raw.issueId ?? '',
    authorId: raw.authorId ?? '',
    body: raw.body ?? '',
    createdAt: raw.createdAt ?? '',
  };
}

export function toIssueEvent(raw: RawIssueEvent = {}): IssueEvent {
  return {
    id: raw.id ?? '',
    issueId: raw.issueId ?? '',
    actorId: raw.actorId ?? '',
    createdAt: raw.createdAt ?? '',
    change: toChange(raw),
    agentId: raw.agentId ?? '',
    // Sin el campo (backend anterior a v0.6.0): en vivo.
    source: oneOf(raw.source, EVENT_SOURCES, 'EVENT_SOURCE_LIVE'),
    sourceRef: raw.sourceRef ?? '',
  };
}

/** El caso del `oneof` que vino (a lo sumo uno); ninguno conocido → `unknown`. */
function toChange(raw: RawIssueEvent): IssueChange {
  if (raw.statusChanged) {
    const c = raw.statusChanged;
    return {
      kind: 'statusChanged',
      fromStatusId: c.fromStatusId ?? '',
      fromStatusName: c.fromStatusName ?? '',
      fromState: toState(c.fromState),
      toStatusId: c.toStatusId ?? '',
      toStatusName: c.toStatusName ?? '',
      toState: toState(c.toState),
    };
  }
  if (raw.titleChanged) {
    return {
      kind: 'titleChanged',
      from: raw.titleChanged.from ?? '',
      to: raw.titleChanged.to ?? '',
    };
  }
  if (raw.priorityChanged) {
    return {
      kind: 'priorityChanged',
      from: toPriority(raw.priorityChanged.from),
      to: toPriority(raw.priorityChanged.to),
    };
  }
  if (raw.labelsChanged) {
    const c = raw.labelsChanged;
    return {
      kind: 'labelsChanged',
      addedLabelIds: c.addedLabelIds ?? [],
      removedLabelIds: c.removedLabelIds ?? [],
      addedLabelNames: c.addedLabelNames ?? [],
      removedLabelNames: c.removedLabelNames ?? [],
    };
  }
  if (raw.discarded) {
    const c = raw.discarded;
    return {
      kind: 'discarded',
      reason: c.reason ?? '',
      fromStatusId: c.fromStatusId ?? '',
      fromStatusName: c.fromStatusName ?? '',
      fromState: toState(c.fromState),
      toStatusId: c.toStatusId ?? '',
      toStatusName: c.toStatusName ?? '',
    };
  }
  if (raw.restored) {
    const c = raw.restored;
    return {
      kind: 'restored',
      fromStatusId: c.fromStatusId ?? '',
      fromStatusName: c.fromStatusName ?? '',
      toStatusId: c.toStatusId ?? '',
      toStatusName: c.toStatusName ?? '',
    };
  }
  if (raw.commented) return { kind: 'commented', comment: toComment(raw.commented) };
  if (raw.descriptionChanged) return { kind: 'descriptionChanged' };
  if (raw.created) return { kind: 'created' };
  return { kind: 'unknown' };
}

export function toActor(raw: RawActor = {}): Actor {
  return {
    id: raw.id ?? '',
    kind: oneOf(raw.kind, ACTOR_KINDS, 'ACTOR_KIND_UNSPECIFIED'),
    displayName: raw.displayName ?? '',
    ownerActorId: raw.ownerActorId ?? '',
    tool: oneOf(raw.tool, AGENT_TOOLS, 'AGENT_TOOL_UNSPECIFIED'),
    createdAt: raw.createdAt ?? '',
    revokedAt: raw.revokedAt ?? '',
    userId: raw.userId ?? '',
  };
}

export function toPage(raw: RawPageResponse = {}): PageResponse {
  return { nextCursor: raw.nextCursor ?? '', hasNext: raw.hasNext ?? false };
}

function toState(value: unknown): IssueState {
  return oneOf(value, ISSUE_STATES, 'ISSUE_STATE_UNSPECIFIED');
}

function toColor(value: unknown): LabelColor {
  return oneOf(value, LABEL_COLOR_VALUES, 'LABEL_COLOR_UNSPECIFIED');
}

function toPriority(value: unknown): Priority {
  return oneOf(value, PRIORITY_VALUES, 'PRIORITY_UNSPECIFIED');
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
