import type { Actor, AgentTool } from '@/app/api';
import type { AuthUser } from '@/app/core/auth/session.store';
import { initialsOf as shellInitials } from '@/app/layout/shell/initials';

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

/**
 * Iniciales de un nombre, como el avatar del shell: la primera letra de las
 * dos primeras palabras («Ana Torres» → «AT»), las dos primeras de una sola
 * («Victor» → «VI») o el inicio de un correo. `?` sin nombre.
 */
export function initialsOf(name: string): string {
  const user = name.includes('@')
    ? { displayName: null, email: name }
    : { displayName: name, email: null };
  return shellInitials(user).toLocaleUpperCase('es') || '?';
}

/**
 * Nombre de una persona: el que manda el servicio y, si viene vacío y es el
 * usuario de la sesión, su nombre (o correo) de Firebase.
 */
function personName(actor: Actor, user: AuthUser | null): string {
  if (actor.displayName) return actor.displayName;
  if (user && actor.userId && actor.userId === user.uid) {
    return user.displayName || user.email || '';
  }
  return '';
}

/** Actores de `ListActors` por id, listos para la UI. */
export function toActorViews(
  actors: readonly Actor[],
  user: AuthUser | null,
): ReadonlyMap<string, ActorView> {
  const people = new Map<string, string>();
  for (const actor of actors) {
    if (actor.kind !== 'ACTOR_KIND_AGENT') people.set(actor.id, personName(actor, user));
  }
  const views = new Map<string, ActorView>();
  for (const actor of actors) {
    const agent = actor.kind === 'ACTOR_KIND_AGENT';
    const name = agent ? actor.displayName : (people.get(actor.id) ?? '');
    views.set(actor.id, {
      id: actor.id,
      kind: agent ? 'agent' : 'person',
      name,
      initials: initialsOf(name),
      tool: agent ? actor.tool : 'AGENT_TOOL_UNSPECIFIED',
      ownerName: agent ? (people.get(actor.ownerActorId) ?? '') : '',
      revoked: !!actor.revokedAt,
    });
  }
  return views;
}
