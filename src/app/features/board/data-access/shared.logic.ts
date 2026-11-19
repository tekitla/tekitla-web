import type {
  Issue,
  Label,
  SharedActor,
  SharedIssue,
  SharedProjectView,
  ShareLink,
  ShareLinkScope,
  Status,
} from '@/app/api';
import { initialsOf } from '@/app/layout/shell/initials';
import type { ActorView } from './actors.logic';

/**
 * Vista de un enlace de solo lectura (issue 009) con los tipos del tablero:
 * así el tablero, la vista Plan y las tarjetas se reutilizan tal cual. Los
 * ids que el enlace no manda (issue, proyecto, actor) se arman acá y no salen
 * de esta vista.
 */

/** Ruta base de la vista pública de un enlace. */
export const SHARED_BASE = '/compartido';

/** `/compartido/<token>/<...rest>` como comandos del router. */
export function sharedLink(token: string, ...rest: (string | number)[]): (string | number)[] {
  return [SHARED_BASE, token, ...rest];
}

/** El enlace deja ver el tablero y el detalle (alcance panel). */
export function isPanelScope(scope: ShareLinkScope): boolean {
  return scope === 'SHARE_LINK_SCOPE_PANEL';
}

/** Clave estable de un asignado del enlace (no hay ids): tipo, nombre y herramienta. */
export function sharedActorKey(actor: SharedActor): string {
  return `${actor.kind}|${actor.tool}|${actor.displayName}`;
}

/** Cómo se muestra un asignado del enlace (`ActorView` del tablero). */
export function sharedActorView(actor: SharedActor): ActorView {
  const agent = actor.kind === 'ACTOR_KIND_AGENT';
  return {
    id: sharedActorKey(actor),
    kind: agent ? 'agent' : 'person',
    name: actor.displayName,
    initials: initialsOf({ displayName: actor.displayName, email: null }) || '?',
    tool: agent ? actor.tool : 'AGENT_TOOL_UNSPECIFIED',
    ownerName: '',
    revoked: false,
  };
}

/** Rank opaco con el orden en que llegaron (el servicio ya los manda por rank). */
function rankAt(index: number): string {
  return index.toString().padStart(6, '0');
}

/**
 * Issues del enlace como `Issue` del tablero, en el orden en que llegaron.
 * `id` es `shared-<número>` y `assigneeActorId`, la clave del asignado.
 */
export function toBoardIssues(shared: readonly SharedIssue[]): Issue[] {
  return shared.map((it, index) => ({
    id: `shared-${it.number}`,
    projectId: '',
    number: it.number,
    title: it.title,
    description: it.description,
    state: it.state,
    priority: it.priority,
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
    rank: rankAt(index),
    statusId: it.statusId,
    labelIds: it.labelIds,
    discard: null,
    assigneeActorId: it.assignee ? sharedActorKey(it.assignee) : '',
    sourceKey: '',
  }));
}

/** Asignados del enlace por su clave. */
export function sharedActorViews(shared: readonly SharedIssue[]): ReadonlyMap<string, ActorView> {
  const views = new Map<string, ActorView>();
  for (const it of shared) {
    if (it.assignee) views.set(sharedActorKey(it.assignee), sharedActorView(it.assignee));
  }
  return views;
}

/** «Qué espera» por número: con alcance plan lo manda el servicio (sin descripción). */
export function sharedWaitingNotes(shared: readonly SharedIssue[]): ReadonlyMap<number, string> {
  return new Map(shared.filter((it) => it.waitingNote).map((it) => [it.number, it.waitingNote]));
}

/** Estados del enlace como `Status` del tablero, en el orden de las columnas. */
export function toBoardStatuses(view: SharedProjectView): Status[] {
  return view.statuses.map((s, index) => ({
    id: s.id,
    projectId: '',
    name: s.name,
    category: s.category,
    rank: rankAt(index),
    color: s.color,
    wipLimit: s.wipLimit,
    hidden: s.hidden,
  }));
}

/** Etiquetas del enlace como `Label` del tablero. */
export function toBoardLabels(view: SharedProjectView): Label[] {
  return view.labels.map((l) => ({
    id: l.id,
    projectId: '',
    name: l.name,
    color: l.color,
    countsAsValue: false,
  }));
}

/** URL completa de un enlace recién creado (el token solo se ve esta vez). */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${SHARED_BASE}/${encodeURIComponent(token)}`;
}

/** Estado de un enlace en la lista: vigente, vencido o revocado. */
export type ShareLinkState = 'active' | 'expired' | 'revoked';

export function shareLinkState(link: ShareLink, now: Date): ShareLinkState {
  if (link.revokedAt) return 'revoked';
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'active';
}
