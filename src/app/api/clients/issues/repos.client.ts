import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { RestClient } from '../rest/rest.client';
import type {
  ConnectGithubRequest,
  ConnectionWithRepos,
  ConnectionsView,
  IssueLink,
  LinkIssueRequest,
  RawConnectionWithRepos,
  RawIssueLink,
  RawListConnectionsResponse,
  RawListIssueLinksResponse,
  RawListRepositoriesResponse,
  Repository,
  ScopeSpec,
} from './repos.contracts';
import { toConnection, toIssueLink, toRepository } from './repos.mappers';

function projectPath(projectId: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}`;
}

function connectionPath(projectId: string, connectionId: string): string {
  return `${projectPath(projectId)}/connections/${encodeURIComponent(connectionId)}`;
}

function toConnectionWithRepos(res: RawConnectionWithRepos): ConnectionWithRepos {
  return {
    connection: toConnection(res.connection),
    repositories: (res.repositories ?? []).map(toRepository),
  };
}

/**
 * Repos de GitHub y GitLab de un proyecto y ramas ligadas a sus issues (issue
 * 016): `RepositoryService`, con la sesión del dueño. Sólo HTTP.
 */
@Injectable({ providedIn: 'root' })
export class ReposClient {
  private readonly rest = inject(RestClient);

  listConnections(projectId: string): Observable<ConnectionsView> {
    return this.rest.get<RawListConnectionsResponse>(`${projectPath(projectId)}/connections`).pipe(
      map((res) => ({
        connections: (res.connections ?? []).map(toConnection),
        githubInstallUrl: res.githubInstallUrl ?? '',
        gitlabEnabled: res.gitlabEnabled ?? false,
      })),
    );
  }

  /** Conecta la org de GitHub (la App ya instalada) y devuelve sus repos. */
  connectGithub(projectId: string, req: ConnectGithubRequest): Observable<ConnectionWithRepos> {
    const { installationId, ...scope } = req;
    return this.rest
      .post<RawConnectionWithRepos>(`${projectPath(projectId)}/connections`, {
        github: { installationId },
        ...scope,
      })
      .pipe(map(toConnectionWithRepos));
  }

  updateConnection(
    projectId: string,
    connectionId: string,
    scope: ScopeSpec,
  ): Observable<ConnectionWithRepos> {
    return this.rest
      .patch<RawConnectionWithRepos>(connectionPath(projectId, connectionId), scope)
      .pipe(map(toConnectionWithRepos));
  }

  disconnect(projectId: string, connectionId: string): Observable<void> {
    return this.rest
      .post<unknown>(`${connectionPath(projectId, connectionId)}:disconnect`, {})
      .pipe(map(() => undefined));
  }

  /** Vuelve a listar los repos y liga los PR abiertos. */
  sync(projectId: string, connectionId: string): Observable<ConnectionWithRepos> {
    return this.rest
      .post<RawConnectionWithRepos>(`${connectionPath(projectId, connectionId)}:sync`, {})
      .pipe(map(toConnectionWithRepos));
  }

  listRepositories(projectId: string): Observable<Repository[]> {
    return this.rest
      .get<RawListRepositoriesResponse>(`${projectPath(projectId)}/repositories`)
      .pipe(map((res) => (res.repositories ?? []).map(toRepository)));
  }

  /** Ramas ligadas de un issue, o de todo el proyecto con `issueNumber` 0. */
  listIssueLinks(projectId: string, issueNumber = 0): Observable<IssueLink[]> {
    return this.rest
      .get<RawListIssueLinksResponse>(
        `${projectPath(projectId)}/issueLinks?issueNumber=${encodeURIComponent(String(issueNumber))}`,
      )
      .pipe(map((res) => (res.links ?? []).map(toIssueLink)));
  }

  linkIssue(projectId: string, number: number, req: LinkIssueRequest): Observable<IssueLink> {
    return this.rest
      .post<{ link?: RawIssueLink }>(`${projectPath(projectId)}/issues/${number}/links`, req)
      .pipe(map((res) => toIssueLink(res.link)));
  }

  unlinkIssue(projectId: string, number: number, linkId: string): Observable<void> {
    return this.rest
      .post<unknown>(
        `${projectPath(projectId)}/issues/${number}/links/${encodeURIComponent(linkId)}:unlink`,
        {},
      )
      .pipe(map(() => undefined));
  }
}
