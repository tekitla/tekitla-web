import type { BoardColumn } from './board.logic';

/**
 * Lógica del detalle en panel lateral del tablero (issue 033, parte 1).
 * El issue abierto vive en la URL: `?issue=RND-231`.
 */

/**
 * Número del issue a partir del query param. Acepta la clave completa
 * (`RND-231`, sin importar mayúsculas) o solo el número (`231`). Una clave de
 * otro proyecto, o algo que no es un número positivo, no abre nada. Sin la
 * clave del proyecto (todavía cargando: `''`) no abre nada, ni con número: así
 * `?issue=3` y `?issue=TK-3` se comportan igual, y un `TK-3` en el tablero de
 * RND nunca abre RND-3.
 */
export function parseIssueParam(
  value: string | null | undefined,
  projectKey: string,
): number | null {
  const raw = value?.trim();
  if (!raw || !projectKey) return null;
  const match = /^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/.exec(raw);
  if (!match) return null;
  const [, key, digits] = match;
  if (key && key.toUpperCase() !== projectKey.toUpperCase()) return null;
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
 * Id de este documento: cambia con cada carga de la página. La marca del
 * historial lo lleva, así una entrada marcada antes de recargar no cuenta
 * (`history.state` sobrevive a la recarga, pero la entrada anterior ya es de
 * otro documento: volver «atrás» a ella recargaría la app).
 */
const DOCUMENT_ID = Math.random().toString(36).slice(2);

/**
 * `history.state` de las entradas que el tablero abre encima de sí mismo. Si
 * la entrada actual la tiene, cerrar el panel es volver atrás (no queda una
 * entrada de más); si no (enlace directo, recarga), cerrar reemplaza la URL.
 */
export function panelHistoryState(): { readonly tkPanel: string } {
  return { tkPanel: DOCUMENT_ID };
}

export function openedOverBoard(state: unknown): boolean {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as Record<string, unknown>)['tkPanel'] === DOCUMENT_ID
  );
}

/**
 * `history.state` para una navegación del panel: conserva lo demás que tenga
 * la entrada actual y pone o quita la marca del tablero.
 */
export function withPanelMark(state: unknown, mark: boolean): Record<string, unknown> {
  const current = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  const { tkPanel: _mark, ...rest } = current;
  return mark ? { ...rest, ...panelHistoryState() } : rest;
}
