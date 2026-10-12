import type { Status } from '@/app/api';

/**
 * Validaciones de Ajustes del lado del cliente (las mismas reglas del
 * backend), para avisar antes de pedir en lugar de esperar el error.
 */

/** Largo máximo del nombre de un estado o una etiqueta. */
export const NAME_MAX = 40;
/** Máximos por proyecto. */
export const MAX_STATUSES = 20;
export const MAX_LABELS = 100;

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
  const taken = existing.some((e) => e.id !== exceptId && e.name.toLocaleLowerCase() === key);
  return taken ? 'taken' : null;
}

/** Cada categoría necesita al menos un estado: el último no se puede borrar. */
export function isLastOfCategory(status: Status, statuses: readonly Status[]): boolean {
  return !statuses.some((s) => s.id !== status.id && s.category === status.category);
}

/**
 * Destino sugerido para los issues de un estado que se borra: otro de la
 * misma categoría si hay, si no el primero de los demás.
 */
export function defaultDestination(status: Status, statuses: readonly Status[]): string {
  const others = statuses.filter((s) => s.id !== status.id);
  return (others.find((s) => s.category === status.category) ?? others[0])?.id ?? '';
}
