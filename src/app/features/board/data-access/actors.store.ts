import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { type Actor, IssuesClient } from '@/app/api';
import { SessionStore } from '@/app/core/auth/session.store';
import { type ActorView, UNKNOWN_ACTOR, toActorViews } from './actors.logic';

/**
 * Actores que pueden estar asignados: la persona del usuario y sus agentes,
 * también los revocados (un issue puede seguir asignado a uno). Se piden una
 * vez; si falla, las tarjetas no muestran asignado y el próximo `load()`
 * reintenta. Provisto en la ruta del proyecto (board.routes.ts).
 */
@Injectable()
export class ActorsStore {
  private readonly client = inject(IssuesClient);
  private readonly session = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _actors = signal<readonly Actor[] | null>(null);
  private loading = false;

  /** Ya llegó la lista: un id que no está es de alguien desconocido. */
  readonly loaded = computed(() => this._actors() !== null);
  readonly byId = computed(() => toActorViews(this._actors() ?? [], this.session.user()));

  load(): void {
    if (this.loading || this._actors() !== null) return;
    this.loading = true;
    this.client
      .listActors(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actors) => {
          this.loading = false;
          this._actors.set(actors);
        },
        error: () => (this.loading = false),
      });
  }

  /**
   * Cómo mostrar el asignado de un issue: `null` sin asignar o mientras no
   * llegó la lista; `UNKNOWN_ACTOR` si la lista no lo trae.
   */
  view(actorId: string): ActorView | null {
    if (!actorId) return null;
    const known = this.byId().get(actorId);
    if (known) return known;
    return this.loaded() ? UNKNOWN_ACTOR : null;
  }
}
