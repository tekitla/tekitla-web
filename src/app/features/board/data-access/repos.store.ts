import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, map, tap } from 'rxjs';

import { ReposClient, isDomainError } from '@/app/api';
import type { Connection, IssueLink, Repository, ScopeSpec } from '@/app/api';
import { linksByIssue } from './repos.logic';

/** Por qué falló una acción (clave de i18n `repos.error.*`). */
export type ReposError =
  | 'load'
  | 'connect'
  | 'installation'
  | 'exists'
  | 'disabled'
  | 'scope'
  | 'update'
  | 'sync'
  | 'disconnect'
  | 'link'
  | 'unlink';

/**
 * Repos de GitHub y GitLab de UN proyecto y las ramas ligadas a sus issues
 * (issue 016). Provisto en `proyectos/:projectId`: lo comparten Ajustes ›
 * Repositorios, el tablero (resumen en cada tarjeta) y el detalle.
 */
@Injectable()
export class ReposStore {
  private readonly client = inject(ReposClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _projectId = signal('');
  private readonly _connections = signal<readonly Connection[]>([]);
  private readonly _repositories = signal<readonly Repository[]>([]);
  private readonly _installUrl = signal('');
  private readonly _loaded = signal(false);
  private readonly _links = signal<readonly IssueLink[]>([]);
  private readonly _error = signal<ReposError | null>(null);

  readonly connections = this._connections.asReadonly();
  readonly repositories = this._repositories.asReadonly();
  /** URL de instalación de la GitHub App; vacía si GitHub no está habilitado. */
  readonly installUrl = this._installUrl.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();
  /** Links del proyecto por número de issue (tablero y detalle). */
  readonly linksByIssue = computed(() => linksByIssue(this._links()));

  private settingsRequest = 0;
  private linksRequest = 0;
  /** Último pedido de links por issue: una respuesta vieja no pisa una nueva. */
  private readonly issueRequests = new Map<number, number>();
  private issueSeq = 0;

  private switchProject(projectId: string): void {
    if (projectId === this._projectId()) return;
    // Las respuestas en vuelo del proyecto anterior se descartan.
    this.settingsRequest++;
    this.linksRequest++;
    this.issueRequests.clear();
    this._error.set(null);
    this._projectId.set(projectId);
    this._connections.set([]);
    this._repositories.set([]);
    this._installUrl.set('');
    this._links.set([]);
    this._loaded.set(false);
  }

  /** Conexiones y repos (Ajustes › Repositorios). */
  load(projectId: string): void {
    if (!projectId) return;
    this.switchProject(projectId);
    const id = ++this.settingsRequest;
    this._error.set(null);
    this.client
      .listConnections(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          if (id !== this.settingsRequest || projectId !== this._projectId()) return;
          this._connections.set(view.connections);
          this._installUrl.set(view.githubInstallUrl);
          this._loaded.set(true);
        },
        error: () => {
          if (id !== this.settingsRequest || projectId !== this._projectId()) return;
          this._error.set('load');
          this._loaded.set(true);
        },
      });
    this.loadRepositories(projectId);
  }

  private loadRepositories(projectId: string): void {
    this.client
      .listRepositories(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (repos) => {
          if (projectId === this._projectId()) this._repositories.set(repos);
        },
        error: () => undefined,
      });
  }

  /**
   * Links de todo el proyecto (tablero). Un error no rompe el tablero: las
   * tarjetas quedan sin resumen.
   */
  loadLinks(projectId: string): void {
    if (!projectId) return;
    this.switchProject(projectId);
    const id = ++this.linksRequest;
    this.client
      .listIssueLinks(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          if (id === this.linksRequest && projectId === this._projectId()) this._links.set(links);
        },
        error: () => undefined,
      });
  }

  /** Links de un issue (detalle): reemplaza los de ese issue. */
  loadIssueLinks(projectId: string, number: number): void {
    if (!projectId || number <= 0) return;
    this.switchProject(projectId);
    if (this._error() === 'link' || this._error() === 'unlink') this._error.set(null);
    const id = ++this.issueSeq;
    this.issueRequests.set(number, id);
    // Una lista del proyecto pedida antes no pisa esta.
    this.linksRequest++;
    this.client
      .listIssueLinks(projectId, number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          if (projectId !== this._projectId() || this.issueRequests.get(number) !== id) return;
          this._links.update((all) => [...all.filter((l) => l.issueNumber !== number), ...links]);
        },
        error: () => undefined,
      });
    if (!this._repositories().length) this.loadRepositories(projectId);
  }

  /** Conecta la org de GitHub con la App ya instalada. */
  connectGithub(installationId: string, scope: ScopeSpec): Observable<Connection> {
    const projectId = this._projectId();
    this._error.set(null);
    return this.client.connectGithub(projectId, { installationId, ...scope }).pipe(
      tap({
        next: ({ connection }) => {
          if (projectId !== this._projectId()) return;
          this._connections.update((l) => [...l, connection]);
          this.loadRepositories(projectId);
        },
        error: (err: unknown) => this._error.set(connectError(err)),
      }),
      map(({ connection }) => connection),
    );
  }

  updateScope(connectionId: string, scope: ScopeSpec): Observable<Connection> {
    return this.replaceConnection(
      this.client.updateConnection(this._projectId(), connectionId, scope),
      'update',
    );
  }

  sync(connectionId: string): Observable<Connection> {
    const projectId = this._projectId();
    return this.replaceConnection(this.client.sync(projectId, connectionId), 'sync').pipe(
      tap(() => {
        if (projectId === this._projectId()) this.loadLinks(projectId);
      }),
    );
  }

  private replaceConnection(
    req: Observable<{ connection: Connection }>,
    failure: ReposError,
  ): Observable<Connection> {
    const projectId = this._projectId();
    this._error.set(null);
    return req.pipe(
      tap({
        next: ({ connection }) => {
          if (projectId !== this._projectId()) return;
          this._connections.update((l) => l.map((c) => (c.id === connection.id ? connection : c)));
          this.loadRepositories(projectId);
        },
        error: () => this._error.set(failure),
      }),
      map(({ connection }) => connection),
    );
  }

  disconnect(connectionId: string): Observable<void> {
    const projectId = this._projectId();
    this._error.set(null);
    return this.client.disconnect(projectId, connectionId).pipe(
      tap({
        next: () => {
          if (projectId !== this._projectId()) return;
          this._connections.update((l) => l.filter((c) => c.id !== connectionId));
          this._repositories.update((l) => l.filter((r) => r.connectionId !== connectionId));
          this.loadLinks(projectId);
        },
        error: () => this._error.set('disconnect'),
      }),
    );
  }

  /** Liga a mano una rama a un issue. */
  link(number: number, repositoryId: string, branch: string): Observable<IssueLink> {
    const projectId = this._projectId();
    this._error.set(null);
    // Una lista del proyecto en vuelo (pedida antes) no pisa este cambio.
    this.linksRequest++;
    this.issueRequests.delete(number);
    return this.client.linkIssue(projectId, number, { repositoryId, branch }).pipe(
      tap({
        next: (link) => {
          if (projectId !== this._projectId()) return;
          this._links.update((all) => [...all.filter((l) => l.id !== link.id), link]);
        },
        error: () => this._error.set('link'),
      }),
    );
  }

  /** Quita un link (queda suprimido en el servicio). */
  unlink(number: number, linkId: string): Observable<void> {
    const projectId = this._projectId();
    this._error.set(null);
    this.linksRequest++;
    this.issueRequests.delete(number);
    return this.client.unlinkIssue(projectId, number, linkId).pipe(
      tap({
        next: () => {
          if (projectId === this._projectId())
            this._links.update((all) => all.filter((l) => l.id !== linkId));
        },
        error: () => this._error.set('unlink'),
      }),
    );
  }
}

function connectError(err: unknown): ReposError {
  if (!isDomainError(err)) return 'connect';
  if (err.api.code === 'INVALID_ARGUMENT') return 'scope';
  switch (err.api.reason) {
    case 'GITHUB_INSTALLATION_NOT_FOUND':
      return 'installation';
    case 'CONNECTION_EXISTS':
      return 'exists';
    case 'GITHUB_NOT_ENABLED':
    case 'GITLAB_NOT_ENABLED':
      return 'disabled';
  }
  return 'connect';
}
