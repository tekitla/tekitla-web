import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Subscription } from 'rxjs';

import { type Actor, IssuesClient } from '@/app/api';
import { SessionStore } from '@/app/core/auth/session.store';
import { type ActorView, UNKNOWN_ACTOR, toActorViews } from './actors.logic';

/** Lo que devolvió `ListActors` y para quién (el uid de la sesión). */
interface Loaded {
  readonly uid: string;
  readonly actors: readonly Actor[];
}

/**
 * Actores que pueden estar asignados: la persona del usuario y sus agentes,
 * también los revocados (un issue puede seguir asignado a uno). El tablero
 * los pide cada vez que se abre (un agente nuevo aparece al volver a él);
 * mientras tanto se muestra lo anterior. Si falla, las tarjetas no muestran
 * asignado hasta la próxima vez. Lo de otra sesión (salir y entrar con otra
 * cuenta en la misma pestaña) nunca se muestra. Provisto en la ruta del
 * proyecto (board.routes.ts).
 */
@Injectable()
export class ActorsStore {
  private readonly client = inject(IssuesClient);
  private readonly session = inject(SessionStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _loaded = signal<Loaded | null>(null);
  private request: Subscription | null = null;

  private readonly uid = computed(() => this.session.user()?.uid ?? '');
  /** Lo cargado, solo si es de la sesión actual. */
  private readonly current = computed(() => {
    const loaded = this._loaded();
    return loaded && loaded.uid === this.uid() ? loaded : null;
  });

  /** Ya llegó la lista: un id que no está es de alguien desconocido. */
  readonly loaded = computed(() => this.current() !== null);
  readonly byId = computed(() => toActorViews(this.current()?.actors ?? [], this.session.user()));

  /** Pide la lista (si ya hay un pedido en vuelo, lo deja seguir). */
  load(): void {
    if (this.request && !this.request.closed) return;
    const uid = this.uid();
    this.request = this.client
      .listActors(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actors) => this._loaded.set({ uid, actors }),
        error: () => undefined,
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
