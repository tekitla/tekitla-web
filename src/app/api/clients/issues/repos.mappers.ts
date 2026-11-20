import type {
  CiStatus,
  Connection,
  ConnectionScope,
  GitlabSyncMode,
  IssueLink,
  LinkOrigin,
  PrState,
  RawConnection,
  RawIssueLink,
  RawRepository,
  RepoKind,
  RepoProvider,
  RepoSource,
  Repository,
} from './repos.contracts';

/**
 * Normalización de repos y ramas ligadas (issue 016). grpc-gateway omite los
 * campos con valor por defecto; un enum desconocido queda en UNSPECIFIED.
 */

function oneOf<T extends string>(values: readonly T[], value: unknown): T {
  return values.includes(value as T) ? (value as T) : values[0];
}

const PROVIDERS: readonly RepoProvider[] = [
  'REPO_PROVIDER_UNSPECIFIED',
  'REPO_PROVIDER_GITHUB',
  'REPO_PROVIDER_GITLAB',
];
const SCOPES: readonly ConnectionScope[] = [
  'CONNECTION_SCOPE_UNSPECIFIED',
  'CONNECTION_SCOPE_ALL',
  'CONNECTION_SCOPE_TOPIC',
  'CONNECTION_SCOPE_SELECTED',
];
const SYNC_MODES: readonly GitlabSyncMode[] = [
  'GITLAB_SYNC_MODE_UNSPECIFIED',
  'GITLAB_SYNC_MODE_WEBHOOK',
  'GITLAB_SYNC_MODE_POLL',
];
const SOURCES: readonly RepoSource[] = [
  'REPO_SOURCE_UNSPECIFIED',
  'REPO_SOURCE_REPO',
  'REPO_SOURCE_ORG',
  'REPO_SOURCE_GROUP',
];
const KINDS: readonly RepoKind[] = ['REPO_KIND_UNSPECIFIED', 'REPO_KIND_CODE', 'REPO_KIND_DOCS'];
const PR_STATES: readonly PrState[] = [
  'PR_STATE_UNSPECIFIED',
  'PR_STATE_NONE',
  'PR_STATE_DRAFT',
  'PR_STATE_OPEN',
  'PR_STATE_MERGED',
  'PR_STATE_CLOSED',
];
const CI_STATUSES: readonly CiStatus[] = [
  'CI_STATUS_UNSPECIFIED',
  'CI_STATUS_NONE',
  'CI_STATUS_PENDING',
  'CI_STATUS_SUCCESS',
  'CI_STATUS_FAILED',
  'CI_STATUS_CANCELED',
];
const ORIGINS: readonly LinkOrigin[] = [
  'LINK_ORIGIN_UNSPECIFIED',
  'LINK_ORIGIN_BRANCH_NAME',
  'LINK_ORIGIN_PR_TEXT',
  'LINK_ORIGIN_MANUAL',
];

export function toConnection(raw: RawConnection = {}): Connection {
  return {
    id: raw.id ?? '',
    projectId: raw.projectId ?? '',
    provider: oneOf(PROVIDERS, raw.provider),
    host: raw.host ?? '',
    owner: raw.owner ?? '',
    scope: oneOf(SCOPES, raw.scope),
    topic: raw.topic ?? '',
    selected: raw.selected ?? [],
    credentialRef: raw.credentialRef ?? '',
    syncMode: oneOf(SYNC_MODES, raw.syncMode),
    pollIntervalMinutes: raw.pollIntervalMinutes ?? 0,
    lastDeliveryAt: raw.lastDeliveryAt ?? '',
    createdAt: raw.createdAt ?? '',
    repositoryCount: raw.repositoryCount ?? 0,
  };
}

export function toRepository(raw: RawRepository = {}): Repository {
  return {
    id: raw.id ?? '',
    projectId: raw.projectId ?? '',
    connectionId: raw.connectionId ?? '',
    provider: oneOf(PROVIDERS, raw.provider),
    owner: raw.owner ?? '',
    name: raw.name ?? '',
    defaultBranch: raw.defaultBranch ?? '',
    source: oneOf(SOURCES, raw.source),
    kind: oneOf(KINDS, raw.kind),
    webUrl: safeUrl(raw.webUrl),
  };
}

export function toIssueLink(raw: RawIssueLink = {}): IssueLink {
  return {
    id: raw.id ?? '',
    issueNumber: raw.issueNumber ?? 0,
    repo: toRepository(raw.repo),
    branch: raw.branch ?? '',
    headSha: raw.headSha ?? '',
    headTitle: raw.headTitle ?? '',
    commits: raw.commits ?? 0,
    prNumber: raw.prNumber ?? 0,
    prTitle: raw.prTitle ?? '',
    // Sin PR, grpc-gateway puede omitir el estado: es «sin PR».
    prState: raw.prState ? oneOf(PR_STATES, raw.prState) : 'PR_STATE_NONE',
    reviewRequested: raw.reviewRequested ?? false,
    ciStatus: raw.ciStatus ? oneOf(CI_STATUSES, raw.ciStatus) : 'CI_STATUS_NONE',
    origin: oneOf(ORIGINS, raw.origin),
    updatedBy: raw.updatedBy ?? '',
    updatedAt: raw.updatedAt ?? '',
    branchDeleted: raw.branchDeleted ?? false,
    webUrl: safeUrl(raw.webUrl),
  };
}

/** Solo URLs https: el panel las pone en un href. */
export function safeUrl(url: unknown): string {
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
}
