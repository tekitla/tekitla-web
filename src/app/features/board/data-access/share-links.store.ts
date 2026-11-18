import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, map, tap } from 'rxjs';

import { ShareLinksClient, isDomainError } from '@/app/api';
import type { CreateShareLinkRequest, ShareLink } from '@/app/api';

/** Por qué falló una acción sobre los enlaces (clave de i18n `share.error.*`). */
export type ShareLinksError = 'load' | 'create' | 'limit' | 'revoke';

/**
 * Enlaces de solo lectura de UN proyecto (issue 009): la lista, crear y
 * revocar. Provisto en `proyectos/:projectId` junto con el resto de los
 * stores del proyecto. El token de un enlace recién creado no se guarda acá:
 * lo devuelve `create` y lo muestra la pantalla una sola vez.
 */
@Injectable()
export class ShareLinksStore {
  private readonly client = inject(ShareLinksClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _projectId = signal('');
  private readonly _links = signal<readonly ShareLink[]>([]);
  private readonly _loaded = signal(false);
  private readonly _error = signal<ShareLinksError | null>(null);

  readonly links = this._links.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();

  private requestId = 0;

  /** Carga los enlaces del proyecto (de nuevo si cambia el proyecto). */
  load(projectId: string): void {
    if (!projectId) return;
    const id = ++this.requestId;
    if (projectId !== this._projectId()) {
      this._projectId.set(projectId);
      this._links.set([]);
      this._loaded.set(false);
    }
    this._error.set(null);
    this.client
      .list(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (links) => {
          if (id !== this.requestId) return;
          this._links.set(links);
          this._loaded.set(true);
        },
        error: () => {
          if (id !== this.requestId) return;
          this._error.set('load');
          this._loaded.set(true);
        },
      });
  }

  /** Crea un enlace y lo agrega arriba de la lista. Emite el token (solo esta vez). */
  create(req: CreateShareLinkRequest): Observable<string> {
    const projectId = this._projectId();
    this._error.set(null);
    return this.client.create(projectId, req).pipe(
      tap({
        next: ({ shareLink }) => {
          if (projectId === this._projectId()) this._links.update((l) => [shareLink, ...l]);
        },
        error: (err: unknown) =>
          this._error.set(isDomainError(err) && err.isFailedPrecondition() ? 'limit' : 'create'),
      }),
      map(({ token }) => token),
    );
  }

  /** Revoca un enlace y lo reemplaza en la lista. */
  revoke(shareLinkId: string): Observable<ShareLink> {
    const projectId = this._projectId();
    this._error.set(null);
    return this.client.revoke(projectId, shareLinkId).pipe(
      tap({
        next: (link) => {
          if (projectId === this._projectId())
            this._links.update((l) => l.map((x) => (x.id === link.id ? link : x)));
        },
        error: () => this._error.set('revoke'),
      }),
    );
  }
}
