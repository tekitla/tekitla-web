import type {
  Issue,
  IssueState,
  PageResponse,
  Priority,
  Project,
  RawIssue,
  RawPageResponse,
  RawProject,
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

/**
 * grpc-gateway omite los campos con valor por defecto: ausente = default del
 * proto ('' / 0 / false / primer valor del enum). Un enum desconocido (versión
 * nueva del backend) también cae en UNSPECIFIED en lugar de romper la UI.
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
    state: oneOf(raw.state, ISSUE_STATES, 'ISSUE_STATE_UNSPECIFIED'),
    priority: oneOf(raw.priority, PRIORITY_VALUES, 'PRIORITY_UNSPECIFIED'),
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
    rank: raw.rank ?? '',
  };
}

export function toPage(raw: RawPageResponse = {}): PageResponse {
  return { nextCursor: raw.nextCursor ?? '', hasNext: raw.hasNext ?? false };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
