import type { Actor, AgentTool } from '@/app/api';
import type { AuthUser } from '@/app/core/auth/session.store';
import { initialsOf } from '@/app/layout/shell/initials';

/**
 * Cómo se muestra un actor en el tablero. `unknown`: el issue está asignado a
 * alguien que `ListActors` no devuelve (otra persona, cuando haya equipos).
 */
export interface ActorView {
  readonly id: string;
  readonly kind: 'person' | 'agent' | 'unknown';
  /** Vacío si no se conoce (la UI pone un texto genérico). */
  readonly name: string;
  /** Una o dos letras; `?` si no hay nombre. */
  readonly initials: string;
  /** Solo en agentes. */
  readonly tool: AgentTool;
  /** Solo en agentes: el nombre de su dueño. */
  readonly ownerName: string;
  readonly revoked: boolean;
}

/** El asignado que `ListActors` no conoce: uno solo, para no cambiar de identidad. */
export const UNKNOWN_ACTOR: ActorView = {
  id: '',
  kind: 'unknown',
  name: '',
  initials: '?',
  tool: 'AGENT_TOOL_UNSPECIFIED',
  ownerName: '',
  revoked: false,
};

/** Identidad de un actor para el avatar del shell (`initialsOf`). */
interface Identity {
  readonly displayName: string | null;
  readonly email: string | null;
}

/**
 * Identidad de una persona: el nombre que manda el servicio y, si viene
 * vacío y es el usuario de la sesión, su nombre (o correo) de Firebase.
 */
function personIdentity(actor: Actor, user: AuthUser | null): Identity {
  if (actor.displayName) return { displayName: actor.displayName, email: null };
  if (user && actor.userId && actor.userId === user.uid) {
    return { displayName: user.displayName, email: user.email };
  }
  return { displayName: null, email: null };
}

/** Iniciales con las reglas del avatar del shell; `?` sin nombre. */
function initials(identity: Identity): string {
  return initialsOf(identity) || '?';
}

/** Actores de `ListActors` por id, listos para la UI. */
export function toActorViews(
  actors: readonly Actor[],
  user: AuthUser | null,
): ReadonlyMap<string, ActorView> {
  const people = new Map<string, Identity>();
  for (const actor of actors) {
    if (actor.kind !== 'ACTOR_KIND_AGENT') people.set(actor.id, personIdentity(actor, user));
  }
  const nameOf = (identity: Identity | undefined) =>
    identity?.displayName?.trim() || identity?.email || '';
  const views = new Map<string, ActorView>();
  for (const actor of actors) {
    const agent = actor.kind === 'ACTOR_KIND_AGENT';
    const identity: Identity = agent
      ? { displayName: actor.displayName, email: null }
      : (people.get(actor.id) ?? { displayName: null, email: null });
    views.set(actor.id, {
      id: actor.id,
      kind: agent ? 'agent' : 'person',
      name: nameOf(identity),
      initials: initials(identity),
      tool: agent ? actor.tool : 'AGENT_TOOL_UNSPECIFIED',
      ownerName: agent ? nameOf(people.get(actor.ownerActorId)) : '',
      revoked: !!actor.revokedAt,
    });
  }
  return views;
}
