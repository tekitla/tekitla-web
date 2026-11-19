import type { Label, Status } from './issues.contracts';
import { toActor, toIssue, toLabel, toPage, toStatus } from './issues.mappers';
import type {
  ListSharedIssuesResponse,
  RawListSharedIssuesResponse,
  RawShareLink,
  RawSharedActor,
  RawSharedIssue,
  RawSharedProjectView,
  ShareLink,
  ShareLinkScope,
  SharedActor,
  SharedIssue,
  SharedProjectView,
} from './share.contracts';

/**
 * Normalización de los enlaces de solo lectura (issue 009). Reutiliza los
 * mappers de `issues.mappers.ts` para los enums (estado, prioridad, color,
 * tipo de actor): un valor desconocido queda en UNSPECIFIED igual que en el
 * resto del panel.
 */

const SCOPES: readonly ShareLinkScope[] = [
  'SHARE_LINK_SCOPE_UNSPECIFIED',
  'SHARE_LINK_SCOPE_PLAN',
  'SHARE_LINK_SCOPE_PANEL',
];

function toScope(value: unknown): ShareLinkScope {
  return SCOPES.includes(value as ShareLinkScope)
    ? (value as ShareLinkScope)
    : 'SHARE_LINK_SCOPE_UNSPECIFIED';
}

export function toShareLink(raw: RawShareLink = {}): ShareLink {
  return {
    id: raw.id ?? '',
    projectId: raw.projectId ?? '',
    scope: toScope(raw.scope),
    note: raw.note ?? '',
    createdAt: raw.createdAt ?? '',
    expiresAt: raw.expiresAt ?? '',
    lastUsedAt: raw.lastUsedAt ?? '',
    revokedAt: raw.revokedAt ?? '',
    ownerDisplayName: raw.ownerDisplayName ?? '',
  };
}

function toSharedActor(raw: RawSharedActor): SharedActor {
  const actor = toActor({ kind: raw.kind, tool: raw.tool, displayName: raw.displayName });
  return { kind: actor.kind, displayName: actor.displayName, tool: actor.tool };
}

export function toSharedIssue(raw: RawSharedIssue = {}): SharedIssue {
  const issue = toIssue({
    number: raw.number,
    title: raw.title,
    description: raw.description,
    state: raw.state,
    priority: raw.priority,
    statusId: raw.statusId,
    labelIds: raw.labelIds,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  });
  return {
    number: issue.number,
    title: issue.title,
    description: issue.description,
    waitingNote: raw.waitingNote ?? '',
    state: issue.state,
    priority: issue.priority,
    statusId: issue.statusId,
    labelIds: issue.labelIds,
    assignee: raw.assignee ? toSharedActor(raw.assignee) : null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

export function toSharedProjectView(raw: RawSharedProjectView = {}): SharedProjectView {
  return {
    project: {
      key: raw.project?.key ?? '',
      name: raw.project?.name ?? '',
      description: raw.project?.description ?? '',
    },
    scope: toScope(raw.scope),
    statuses: (raw.statuses ?? []).map((s) => {
      const st: Status = toStatus(s);
      return {
        id: st.id,
        name: st.name,
        category: st.category,
        color: st.color,
        wipLimit: st.wipLimit,
        hidden: st.hidden,
      };
    }),
    labels: (raw.labels ?? []).map((l) => {
      const label: Label = toLabel(l);
      return { id: label.id, name: label.name, color: label.color };
    }),
  };
}

export function toListSharedIssues(
  raw: RawListSharedIssuesResponse = {},
): ListSharedIssuesResponse {
  return { issues: (raw.issues ?? []).map(toSharedIssue), page: toPage(raw.page) };
}
