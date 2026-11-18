import type * as sharePb from '@tekitla/tekitla-protos/issues/v1/share_links_pb';

import type {
  ActorKind,
  AgentTool,
  IssueState,
  Json,
  LabelColor,
  PageRequest,
  PageResponse,
  Priority,
} from './issues.contracts';

/**
 * Contratos de los enlaces de solo lectura (issue 009): `ShareLinkService`
 * (gestión, con la sesión) y `SharedProjectService` (lectura pública por el
 * token del enlace). Se derivan de `@tekitla/tekitla-protos` como el resto de
 * `issues.contracts.ts` (solo tipos), con los `Raw*` de lo que llega por la
 * red y los normalizados que usa la app (`share.mappers.ts`).
 */

/** Qué ve quien abre el enlace: solo la vista Plan, o el panel completo. */
export type ShareLinkScope = `SHARE_LINK_SCOPE_${keyof typeof sharePb.ShareLinkScope}`;

/** Vencimiento al crear. */
export type ShareLinkDuration = `SHARE_LINK_DURATION_${keyof typeof sharePb.ShareLinkDuration}`;

/** Alcances elegibles al crear. */
export const SHARE_SCOPES: readonly Exclude<ShareLinkScope, 'SHARE_LINK_SCOPE_UNSPECIFIED'>[] = [
  'SHARE_LINK_SCOPE_PLAN',
  'SHARE_LINK_SCOPE_PANEL',
];

/** Vencimientos elegibles al crear, en el orden del diálogo. */
export const SHARE_DURATIONS: readonly Exclude<
  ShareLinkDuration,
  'SHARE_LINK_DURATION_UNSPECIFIED'
>[] = [
  'SHARE_LINK_DURATION_SEVEN_DAYS',
  'SHARE_LINK_DURATION_THIRTY_DAYS',
  'SHARE_LINK_DURATION_NINETY_DAYS',
  'SHARE_LINK_DURATION_NEVER',
];

/** Largos máximos (los valida también el servicio). */
export const SHARE_NOTE_MAX = 80;
export const SHARE_OWNER_NAME_MAX = 40;

/**
 * Un enlace, sin el token. Fechas en RFC 3339; `expiresAt`, `lastUsedAt` y
 * `revokedAt` vacíos si no tienen (sin vencimiento, nunca usado, vigente).
 */
export type ShareLink = Json<
  sharePb.ShareLink,
  {
    scope: ShareLinkScope;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string;
    revokedAt: string;
  }
>;

/** POST /v1/projects/{project_id}/share-links. */
export type CreateShareLinkRequest = Omit<
  Json<sharePb.CreateShareLinkRequest, { scope: ShareLinkScope; duration: ShareLinkDuration }>,
  'projectId'
>;

/** El enlace recién creado y su token, que solo sale esta vez. */
export type CreatedShareLink = { shareLink: ShareLink; token: string };

// ── Lectura pública ──────────────────────────────────────────────────────

export type SharedProject = Json<sharePb.SharedProject>;
export type SharedStatus = Json<sharePb.SharedStatus, { category: IssueState; color: LabelColor }>;
export type SharedLabel = Json<sharePb.SharedLabel, { color: LabelColor }>;
export type SharedActor = Json<sharePb.SharedActor, { kind: ActorKind; tool: AgentTool }>;
export type SharedIssue = Json<
  sharePb.SharedIssue,
  {
    state: IssueState;
    priority: Priority;
    assignee: SharedActor | null;
    createdAt: string;
    updatedAt: string;
  }
>;

export type SharedProjectView = Json<
  sharePb.GetSharedProjectResponse,
  {
    project: SharedProject;
    scope: ShareLinkScope;
    statuses: SharedStatus[];
    labels: SharedLabel[];
  }
>;

export type ListSharedIssuesResponse = { issues: SharedIssue[]; page: PageResponse };
export type ListSharedIssuesRequest = { page?: PageRequest };

// ── Lo que llega por la red ──────────────────────────────────────────────

export type RawShareLink = Partial<ShareLink>;
export interface RawShareLinkEnvelope {
  shareLink?: RawShareLink;
}
export interface RawCreatedShareLink {
  shareLink?: RawShareLink;
  token?: string;
}
export interface RawListShareLinksResponse {
  shareLinks?: RawShareLink[];
}
export type RawSharedActor = Partial<SharedActor>;
export type RawSharedIssue = Partial<Omit<SharedIssue, 'assignee' | 'labelIds'>> & {
  assignee?: RawSharedActor | null;
  labelIds?: string[];
};
export interface RawSharedProjectView {
  project?: Partial<SharedProject>;
  scope?: ShareLinkScope;
  statuses?: Partial<SharedStatus>[];
  labels?: Partial<SharedLabel>[];
}
export interface RawListSharedIssuesResponse {
  issues?: RawSharedIssue[];
  page?: Partial<PageResponse>;
}
export interface RawSharedIssueEnvelope {
  issue?: RawSharedIssue;
}
