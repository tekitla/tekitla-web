import {
  type BatchUpdateStatusesRequest,
  type IssueState,
  type LabelColor,
  STATUS_CATEGORIES,
  type Status,
  type StatusCategory,
} from '@/app/api';

/**
 * Lógica de Ajustes del lado del cliente: las mismas reglas del backend, para
 * avisar antes de pedir en lugar de esperar el error, y el borrador de
 * Ajustes › Estados, que se guarda entero con `BatchUpdateStatuses`.
 */

/** Largo máximo del nombre de un estado o una etiqueta. */
export const NAME_MAX = 40;
/** Máximos por proyecto. */
export const MAX_STATUSES = 20;
export const MAX_LABELS = 100;
/** Mayor límite WIP que acepta el formulario (el backend solo pide ≥ 0). */
export const WIP_MAX = 999;

export type NameError = 'required' | 'tooLong' | 'taken';

/**
 * Nombre de un estado o etiqueta: 1 a 40 caracteres y único en el proyecto
 * sin distinguir mayúsculas (`exceptId`: el que se está renombrando).
 */
export function nameError(
  name: string,
  existing: readonly { id: string; name: string }[],
  exceptId?: string,
): NameError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'required';
  if (Array.from(trimmed).length > NAME_MAX) return 'tooLong';
  const key = trimmed.toLocaleLowerCase();
  const taken = existing.some(
    (e) => e.id !== exceptId && e.name.trim().toLocaleLowerCase() === key,
  );
  return taken ? 'taken' : null;
}

// ── Borrador de Ajustes › Estados ───────────────────────────────────────────

/** Un estado tal como va a quedar. `id` vacío: nuevo. */
export interface StatusDraft {
  /** Para `track` y los ids del DOM: el id o, si es nuevo, `new-N`. */
  key: string;
  id: string;
  name: string;
  category: IssueState;
  color: LabelColor;
  wipLimit: number;
  hidden: boolean;
}

/** Estado guardado que se borra: dónde estaba (para deshacer) y a dónde pasan sus issues. */
export interface StatusRemoval {
  status: StatusDraft;
  index: number;
  moveToStatusId: string;
}

/** Estados en el orden de las columnas y los que se borran. */
export interface StatusesDraft {
  statuses: StatusDraft[];
  removed: StatusRemoval[];
}

/** Algo que impide guardar el borrador. */
export type DraftProblem =
  | { kind: 'name'; key: string; error: NameError }
  | { kind: 'tooMany' }
  | { kind: 'lastOfCategory'; category: StatusCategory }
  | { kind: 'destination'; statusId: string };

function toDraft(status: Status): StatusDraft {
  return {
    key: status.id,
    id: status.id,
    name: status.name,
    category: status.category,
    color: status.color,
    wipLimit: status.wipLimit,
    hidden: status.hidden,
  };
}

/** El borrador sin cambios: los estados como están guardados. */
export function draftFrom(statuses: readonly Status[]): StatusesDraft {
  return { statuses: statuses.map(toDraft), removed: [] };
}

let newKeys = 0;

/**
 * Agrega un estado nuevo al final: sin color propio (el de su categoría) y,
 * si es de descarte, oculto, como lo crea el backend.
 */
export function addStatus(
  draft: StatusesDraft,
  name: string,
  category: StatusCategory,
): StatusesDraft {
  const status: StatusDraft = {
    key: `new-${++newKeys}`,
    id: '',
    name: name.trim(),
    category,
    color: 'LABEL_COLOR_UNSPECIFIED',
    wipLimit: 0,
    hidden: category === 'ISSUE_STATE_CANCELED',
  };
  return { ...draft, statuses: [...draft.statuses, status] };
}

export function updateStatus(
  draft: StatusesDraft,
  key: string,
  patch: Partial<Pick<StatusDraft, 'name' | 'color' | 'wipLimit' | 'hidden'>>,
): StatusesDraft {
  return {
    ...draft,
    statuses: draft.statuses.map((s) => (s.key === key ? { ...s, ...patch } : s)),
  };
}

/** Corre un estado un lugar (`-1` antes, `1` después). */
export function moveStatus(draft: StatusesDraft, key: string, direction: -1 | 1): StatusesDraft {
  const list = [...draft.statuses];
  const from = list.findIndex((s) => s.key === key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return draft;
  [list[from], list[to]] = [list[to]!, list[from]!];
  return { ...draft, statuses: list };
}

/** El único de su categoría: no se puede quitar (cada categoría necesita uno). */
export function isLastOfCategory(draft: StatusesDraft, key: string): boolean {
  const status = draft.statuses.find((s) => s.key === key);
  return !!status && !draft.statuses.some((s) => s.key !== key && s.category === status.category);
}

/**
 * A dónde pueden pasar los issues de un estado que se borra: estados ya
 * guardados (no uno nuevo del mismo guardado) que se quedan.
 */
export function destinationsFor(draft: StatusesDraft, statusId: string): StatusDraft[] {
  return draft.statuses.filter((s) => s.id && s.id !== statusId);
}

/** Destino sugerido: otro de la misma categoría si hay, si no el primero. */
function suggestDestination(draft: StatusesDraft, status: StatusDraft): string {
  const options = destinationsFor(draft, status.id);
  return (options.find((s) => s.category === status.category) ?? options[0])?.id ?? '';
}

/**
 * Quita un estado. Uno nuevo simplemente desaparece; uno guardado queda como
 * borrado, con sus issues pasando al destino sugerido. Si era el destino de
 * otro borrado, ese pasa a su nuevo destino sugerido.
 */
export function removeStatus(draft: StatusesDraft, key: string): StatusesDraft {
  const index = draft.statuses.findIndex((s) => s.key === key);
  const status = draft.statuses[index];
  if (!status) return draft;
  const statuses = draft.statuses.filter((s) => s.key !== key);
  if (!status.id) return { ...draft, statuses };
  const next: StatusesDraft = { statuses, removed: draft.removed };
  const removal = { status, index, moveToStatusId: suggestDestination(next, status) };
  return {
    statuses,
    removed: [...draft.removed, removal].map((r) =>
      r.moveToStatusId === status.id
        ? { ...r, moveToStatusId: suggestDestination(next, r.status) }
        : r,
    ),
  };
}

export function setDestination(
  draft: StatusesDraft,
  statusId: string,
  moveToStatusId: string,
): StatusesDraft {
  return {
    ...draft,
    removed: draft.removed.map((r) => (r.status.id === statusId ? { ...r, moveToStatusId } : r)),
  };
}

/** Deshace un borrado: el estado vuelve a su lugar (o al final, si la lista se achicó). */
export function undoRemove(draft: StatusesDraft, statusId: string): StatusesDraft {
  const removal = draft.removed.find((r) => r.status.id === statusId);
  if (!removal) return draft;
  const statuses = [...draft.statuses];
  statuses.splice(Math.min(removal.index, statuses.length), 0, removal.status);
  return { statuses, removed: draft.removed.filter((r) => r !== removal) };
}

/** Lo que impide guardar, en el orden de la tabla. Vacío: se puede guardar. */
export function draftProblems(draft: StatusesDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const named = draft.statuses.map((s) => ({ id: s.key, name: s.name }));
  for (const status of draft.statuses) {
    const error = nameError(status.name, named, status.key);
    if (error) problems.push({ kind: 'name', key: status.key, error });
  }
  if (draft.statuses.length > MAX_STATUSES) problems.push({ kind: 'tooMany' });
  for (const category of STATUS_CATEGORIES) {
    if (!draft.statuses.some((s) => s.category === category)) {
      problems.push({ kind: 'lastOfCategory', category });
    }
  }
  for (const removal of draft.removed) {
    if (!draft.statuses.some((s) => s.id && s.id === removal.moveToStatusId)) {
      problems.push({ kind: 'destination', statusId: removal.status.id });
    }
  }
  return problems;
}

/**
 * El request de `BatchUpdateStatuses`: la lista completa en orden, con
 * `hidden` explícito en cada estado. El destino de un borrado viaja siempre
 * (el conteo local puede estar viejo); el servidor lo ignora si está vacío.
 */
export function toBatchRequest(draft: StatusesDraft): BatchUpdateStatusesRequest {
  return {
    statuses: draft.statuses.map((s) => ({
      id: s.id,
      name: s.name.trim(),
      category: s.category,
      color: s.color,
      wipLimit: s.wipLimit,
      hidden: s.hidden,
    })),
    deletions: draft.removed.map((r) => ({
      statusId: r.status.id,
      moveToStatusId: r.moveToStatusId,
    })),
  };
}

/** Si el borrador difiere de lo guardado. */
export function isDirty(draft: StatusesDraft, saved: readonly Status[]): boolean {
  const request = JSON.stringify(toBatchRequest(draft));
  return request !== JSON.stringify(toBatchRequest(draftFrom(saved)));
}

/**
 * Rebasa el borrador sobre los estados recién traídos (después de
 * `STALE_STATUSES`: otro los cambió). Se conservan los cambios propios de los
 * que siguen existiendo y los nuevos; se sueltan los que otro borró; los que
 * otro creó se suman al final, como están guardados.
 */
export function rebaseDraft(draft: StatusesDraft, fresh: readonly Status[]): StatusesDraft {
  const exists = new Set(fresh.map((s) => s.id));
  const known = new Set([
    ...draft.statuses.map((s) => s.id),
    ...draft.removed.map((r) => r.status.id),
  ]);
  const statuses = [
    ...draft.statuses.filter((s) => !s.id || exists.has(s.id)),
    ...fresh.filter((s) => !known.has(s.id)).map(toDraft),
  ];
  const kept: StatusesDraft = { statuses, removed: [] };
  const removed = draft.removed
    .filter((r) => exists.has(r.status.id))
    .map((r) =>
      statuses.some((s) => s.id && s.id === r.moveToStatusId)
        ? r
        : { ...r, moveToStatusId: suggestDestination(kept, r.status) },
    );
  return { statuses, removed };
}
