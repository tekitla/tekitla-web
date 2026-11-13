import { type UrlTree, DefaultUrlSerializer } from '@angular/router';

import type { BoardColumn } from './board.logic';

/**
 * Lógica del detalle en panel lateral del tablero (issue 033, parte 1).
 * El issue abierto vive en la URL: `?issue=RND-231`.
 */

/**
 * Número del issue a partir del query param. Acepta la clave completa
 * (`RND-231`, sin importar mayúsculas) o solo el número (`231`). Una clave de
 * otro proyecto, o algo que no es un número positivo, no abre nada.
 */
export function parseIssueParam(
  value: string | null | undefined,
  projectKey: string,
): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = /^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/.exec(raw);
  if (!match) return null;
  const [, key, digits] = match;
  if (key && projectKey && key.toUpperCase() !== projectKey.toUpperCase()) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/**
 * El issue anterior (`-1`) o siguiente (`1`) en la columna del tablero donde
 * está `number`, tal como se ve. `null` en los bordes o si no está en ninguna
 * columna visible.
 */
export function neighborInColumn(
  columns: readonly BoardColumn[],
  number: number,
  direction: -1 | 1,
): number | null {
  for (const column of columns) {
    const index = column.issues.findIndex((i) => i.number === number);
    if (index === -1) continue;
    return column.issues[index + direction]?.number ?? null;
  }
  return null;
}

/**
 * El foco está en algo que usa el teclado por su cuenta (campo de texto,
 * selector, radio, editor): ahí `Esc` y las flechas son suyos, no del panel.
 */
export function ownsKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, textarea, select, [role="menu"], [role="listbox"], dialog');
}

/**
 * Marca en `history.state` de las entradas que abrió el tablero encima de sí
 * mismo. Si está, cerrar el panel es volver atrás (no queda una entrada de
 * más); si no (enlace directo, recarga), cerrar reemplaza la URL.
 */
export interface PanelHistoryState {
  readonly [key: string]: unknown;
  readonly tkPanel: boolean;
}

export function openedOverBoard(state: unknown): boolean {
  return (
    !!state && typeof state === 'object' && (state as Record<string, unknown>)['tkPanel'] === true
  );
}

const serializer = new DefaultUrlSerializer();

/** La URL sin `?issue=`: identifica la «página» que queda debajo del panel. */
function withoutPanel(tree: UrlTree): string {
  const copy = serializer.parse(serializer.serialize(tree));
  delete copy.queryParams['issue'];
  return serializer.serialize(copy);
}

/**
 * La navegación solo abre, cambia o cierra el panel (lo demás de la URL queda
 * igual): el tablero conserva su scroll en vez de volver arriba (CU-033-2).
 */
export function onlyPanelChanged(from: UrlTree, to: UrlTree): boolean {
  return withoutPanel(from) === withoutPanel(to);
}
