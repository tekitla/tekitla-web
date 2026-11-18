import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { SharedClient, isDomainError } from '@/app/api';
import type { SharedIssue, SharedProjectView } from '@/app/api';
import type { ActorView } from './actors.logic';
import { buildColumns } from './board.logic';
import {
  isPanelScope,
  sharedActorViews,
  sharedWaitingNotes,
  toBoardIssues,
  toBoardLabels,
  toBoardStatuses,
} from './shared.logic';

/**
 * Store de la vista de un enlace de solo lectura (issue 009): el proyecto,
 * sus estados, etiquetas e issues tal como los deja ver el enlace. Provisto
 * en `compartido/:token` (shared.routes.ts): lo comparten tablero, Plan y
 * detalle. Solo lee: no hay nada que escribir con un enlace.
 *
 * Un 404 (enlace que no existe, venció o se revocó) queda en `notFound`; el
 * servicio no dice cuál de los tres fue.
 */
@Injectable()
export class SharedStore {
  private readonly client = inject(SharedClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _token = signal('');
  private readonly _view = signal<SharedProjectView | null>(null);
  private readonly _issues = signal<readonly SharedIssue[]>([]);
  private readonly _loaded = signal(false);
  private readonly _notFound = signal(false);
  private readonly _error = signal(false);

  readonly token = this._token.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly notFound = this._notFound.asReadonly();
  readonly error = this._error.asReadonly();

  readonly project = computed(() => this._view()?.project ?? null);
  readonly projectKey = computed(() => this._view()?.project.key ?? '');
  readonly scope = computed(() => this._view()?.scope ?? 'SHARE_LINK_SCOPE_UNSPECIFIED');
  /** Deja ver tablero y detalle (alcance panel); si no, solo la vista Plan. */
  readonly isPanel = computed(() => isPanelScope(this.scope()));

  readonly statuses = computed(() => {
    const view = this._view();
    return view ? toBoardStatuses(view) : [];
  });
  readonly labels = computed(() => {
    const view = this._view();
    return view ? toBoardLabels(view) : [];
  });
  readonly labelsById = computed(() => new Map(this.labels().map((l) => [l.id, l])));
  readonly issues = computed(() => toBoardIssues(this._issues()));
  /** Columnas visibles del tablero (sin las ocultas), con sus issues por rank. */
  readonly columns = computed(() => buildColumns(this.issues(), this.statuses()));
  private readonly actors = computed(() => sharedActorViews(this._issues()));
  private readonly notes = computed(() => sharedWaitingNotes(this._issues()));

  private requestId = 0;
  private loading = false;

  /**
   * Carga todo lo que deja ver el enlace. Una vez por token: no repite si ya
   * cargó bien o hay un pedido en vuelo; después de un error, sí.
   */
  load(token: string): void {
    if (!token) return;
    if (token === this._token() && (this.loading || (this._loaded() && !this._error()))) return;
    const id = ++this.requestId;
    this.loading = true;
    this._token.set(token);
    this._view.set(null);
    this._issues.set([]);
    this._loaded.set(false);
    this._notFound.set(false);
    this._error.set(false);
    forkJoin({ view: this.client.getProject(token), issues: this.client.listAllIssues(token) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ view, issues }) => {
          if (id !== this.requestId) return;
          this.loading = false;
          this._view.set(view);
          this._issues.set(issues);
          this._loaded.set(true);
        },
        error: (err: unknown) => {
          if (id !== this.requestId) return;
          this.loading = false;
          if (isDomainError(err) && err.isNotFound()) this._notFound.set(true);
          else this._error.set(true);
          this._loaded.set(true);
        },
      });
  }

  /** Cómo se muestra el asignado de un issue (`null`: sin asignar). */
  assignee(assigneeActorId: string): ActorView | null {
    return assigneeActorId ? (this.actors().get(assigneeActorId) ?? null) : null;
  }

  /** «Qué espera» de un issue: el que manda el servicio con alcance plan. */
  waitingNote(number: number): string {
    return this.notes().get(number) ?? '';
  }

  /** Un issue del enlace por número (`null` si no está). */
  issue(number: number) {
    return this.issues().find((i) => i.number === number) ?? null;
  }
}
