import type * as intPb from '@tekitla/tekitla-protos/issues/v1/integrations_pb';

import type { Json } from './issues.contracts';

/**
 * Contratos de la integración con GitHub y GitLab (issue 016):
 * `RepositoryService` (conexiones, repos y ramas ligadas). Se derivan de
 * `@tekitla/tekitla-protos` como el resto (solo tipos), con los `Raw*` de lo
 * que llega por la red y los normalizados que usa la app (`repos.mappers.ts`).
 * Ninguna respuesta trae secretos: el token de GitLab es solo el nombre de una
 * variable (`credentialRef`).
 */

export type RepoProvider = `REPO_PROVIDER_${keyof typeof intPb.RepoProvider}`;
export type ConnectionScope = `CONNECTION_SCOPE_${keyof typeof intPb.ConnectionScope}`;
export type GitlabSyncMode = `GITLAB_SYNC_MODE_${keyof typeof intPb.GitlabSyncMode}`;
export type RepoSource = `REPO_SOURCE_${keyof typeof intPb.RepoSource}`;
export type RepoKind = `REPO_KIND_${keyof typeof intPb.RepoKind}`;
export type PrState = `PR_STATE_${keyof typeof intPb.PrState}`;
export type CiStatus = `CI_STATUS_${keyof typeof intPb.CiStatus}`;
export type LinkOrigin = `LINK_ORIGIN_${keyof typeof intPb.LinkOrigin}`;

/** Alcances elegibles al conectar. */
export const CONNECTION_SCOPES: readonly Exclude<
  ConnectionScope,
  'CONNECTION_SCOPE_UNSPECIFIED'
>[] = ['CONNECTION_SCOPE_TOPIC', 'CONNECTION_SCOPE_ALL', 'CONNECTION_SCOPE_SELECTED'];

/** Topic por defecto al conectar la org de Tekitla (decisión 5 de Victor). */
export const DEFAULT_TOPIC = 'tekitla';

/** Una conexión de organización o grupo, sin secretos. Fechas en RFC 3339. */
export type Connection = Json<
  intPb.Connection,
  {
    provider: RepoProvider;
    scope: ConnectionScope;
    syncMode: GitlabSyncMode;
    lastDeliveryAt: string;
    createdAt: string;
  }
>;

export type Repository = Json<
  intPb.Repository,
  { provider: RepoProvider; source: RepoSource; kind: RepoKind }
>;

/** Una rama (y su PR) ligada a un issue. */
export type IssueLink = Json<
  intPb.IssueLink,
  {
    repo: Repository;
    prState: PrState;
    ciStatus: CiStatus;
    origin: LinkOrigin;
    updatedAt: string;
  }
>;

/** Conexiones del proyecto y qué proveedores hay en el ambiente. */
export interface ConnectionsView {
  connections: Connection[];
  /** Vacía si GitHub no está habilitado. */
  githubInstallUrl: string;
  gitlabEnabled: boolean;
}

export interface ConnectionWithRepos {
  connection: Connection;
  repositories: Repository[];
}

/** El alcance de una conexión. */
export interface ScopeSpec {
  scope: Exclude<ConnectionScope, 'CONNECTION_SCOPE_UNSPECIFIED'>;
  topic?: string;
  selected?: string[];
}

/** Conectar la org de GitHub con la App ya instalada (id que manda GitHub). */
export interface ConnectGithubRequest extends ScopeSpec {
  installationId: string;
}

export interface LinkIssueRequest {
  repositoryId: string;
  branch: string;
}

// Lo que llega por la red: grpc-gateway omite los campos con valor por defecto.
export type RawConnection = Partial<Connection>;
export type RawRepository = Partial<Repository>;
export type RawIssueLink = Partial<Omit<IssueLink, 'repo'>> & { repo?: RawRepository };
export interface RawListConnectionsResponse {
  connections?: RawConnection[];
  githubInstallUrl?: string;
  gitlabEnabled?: boolean;
}
export interface RawConnectionWithRepos {
  connection?: RawConnection;
  repositories?: RawRepository[];
}
export interface RawListRepositoriesResponse {
  repositories?: RawRepository[];
}
export interface RawListIssueLinksResponse {
  links?: RawIssueLink[];
}
