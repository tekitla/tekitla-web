import type { Issue, IssueState, LabelColor, Status } from '@/app/api';

/** Funciones puras del tablero (sin Angular): columnas, orden, mover. */

/** Tonos de vrb (`vrb-kanban__column--*`, `vrb-kanban-card__label--*`, `vrb-segmented__dot--*`). */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'brand';

/** Tono de una columna según la categoría de su estado. */
export const CATEGORY_TONE: Record<IssueState, Tone> = {
  ISSUE_STATE_UNSPECIFIED: 'neutral',
  ISSUE_STATE_TODO: 'neutral',
  ISSUE_STATE_IN_PROGRESS: 'info',
  ISSUE_STATE_DONE: 'success',
  ISSUE_STATE_CANCELED: 'danger',
};

/** Tono de una etiqueta (UNSPECIFIED se guarda como NEUTRAL). */
export const LABEL_TONE: Record<LabelColor, Tone> = {
  LABEL_COLOR_UNSPECIFIED: 'neutral',
  LABEL_COLOR_NEUTRAL: 'neutral',
  LABEL_COLOR_INFO: 'info',
  LABEL_COLOR_SUCCESS: 'success',
  LABEL_COLOR_WARNING: 'warning',
  LABEL_COLOR_DANGER: 'danger',
  LABEL_COLOR_ACCENT: 'accent',
  LABEL_COLOR_BRAND: 'brand',
};

export interface BoardColumn {
  status: Status;
  issues: Issue[];
}

/** Lugar pedido al mover: vecinos tal como el cliente ve la columna destino (0 = ninguno). */
export interface Placement {
  afterNumber: number;
  beforeNumber: number;
}

/** Los ranks son opacos y se comparan como string, sin locale (como el backend). */
function compareRank(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Orden de las columnas: `rank` ascendente; el id desempata. */
export function compareStatuses(a: Status, b: Status): number {
  return compareRank(a.rank, b.rank) || compareRank(a.id, b.id);
}

/**
 * Mismo orden que ListIssues: `rank` ascendente. El número sólo desempata
 * ranks vacíos o iguales.
 */
export function compareIssues(a: Issue, b: Issue): number {
  return compareRank(a.rank, b.rank) || a.number - b.number;
}

/** Estados en el orden de las columnas. */
export function sortStatuses(statuses: readonly Status[]): Status[] {
  return [...statuses].sort(compareStatuses);
}

/** Columnas del tablero: todos los estados salvo los de categoría CANCELED. */
export function isBoardStatus(status: Status): boolean {
  return status.category !== 'ISSUE_STATE_CANCELED';
}

/**
 * Estado de un issue. `statuses` en el orden de las columnas (como los
 * guarda `ProjectConfigStore`). Si su `statusId` no está en la lista (vino de
 * un backend viejo o el estado se acaba de borrar), el primero de su categoría;
 * sin categoría (UNSPECIFIED, omitida por grpc-gateway), el primero de «Por
 * hacer», como en la rebanada 1.
 */
export function statusOf(issue: Issue, statuses: readonly Status[]): Status | null {
  const category = issue.state === 'ISSUE_STATE_UNSPECIFIED' ? 'ISSUE_STATE_TODO' : issue.state;
  return (
    statuses.find((s) => s.id === issue.statusId) ??
    statuses.find((s) => s.category === category) ??
    null
  );
}

/** Columnas en orden, cada una con sus issues por `rank`. Los descartados no van. */
export function buildColumns(issues: readonly Issue[], statuses: readonly Status[]): BoardColumn[] {
  const sorted = sortStatuses(statuses);
  const columns = sorted.filter(isBoardStatus).map((status) => ({ status, issues: [] as Issue[] }));
  const byId = new Map(columns.map((c) => [c.status.id, c]));
  for (const issue of issues) {
    const status = statusOf(issue, sorted);
    if (status) byId.get(status.id)?.issues.push(issue);
  }
  for (const column of columns) column.issues.sort(compareIssues);
  return columns;
}

/** Cuántos issues hay en cada estado (para saber si borrar uno pide destino). */
export function countByStatus(
  issues: readonly Issue[],
  statuses: readonly Status[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const status = statusOf(issue, statuses);
    if (status) counts.set(status.id, (counts.get(status.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Vecinos de `number` si queda en la posición `index` de `column` (la columna
 * destino tal como se ve, con o sin el issue): se saca el issue y se inserta
 * en `index`. Es la semántica de `currentIndex` de CDK drag & drop, tanto
 * dentro de la misma lista como entre listas.
 */
export function placementAt(column: readonly Issue[], number: number, index: number): Placement {
  const others = column.filter((i) => i.number !== number);
  const at = Math.max(0, Math.min(index, others.length));
  return {
    afterNumber: others[at - 1]?.number ?? 0,
    beforeNumber: others[at]?.number ?? 0,
  };
}

/**
 * Un rank estrictamente entre `after` y `before` (`null` = sin vecino de ese
 * lado), sólo para ubicar la tarjeta al instante mientras responde el
 * servidor: el rank real lo calcula el backend y llega en la respuesta.
 * `null` si no hay uno seguro (ranks iguales o desordenados): el issue
 * conserva su rank hasta la respuesta.
 */
export function rankBetween(after: string | null, before: string | null): string | null {
  const MAX = '￿';
  if (before === null) return (after ?? '') + MAX;
  const low = after ?? '';
  if (low >= before) return null;
  // `low` no es prefijo de `before`: difieren antes de que `low` termine, así
  // que cualquier extensión de `low` sigue siendo menor que `before`.
  if (!before.startsWith(low)) return low + MAX;
  // `before` = `low` + resto: un carácter menor que el primero del resto.
  const next = before.charCodeAt(low.length);
  return next > 0 ? low + String.fromCharCode(next - 1) + MAX : null;
}

/** Copia de la lista con el issue `number` movido al estado `status` (y `rank`, si viene). */
export function withMove(
  issues: readonly Issue[],
  number: number,
  status: Pick<Status, 'id' | 'category'>,
  rank?: string,
): Issue[] {
  return issues.map((i) =>
    i.number === number
      ? { ...i, statusId: status.id, state: status.category, rank: rank ?? i.rank }
      : i,
  );
}

/** Reemplaza (por número) o agrega un issue. */
export function upsertIssue(issues: readonly Issue[], issue: Issue): Issue[] {
  const exists = issues.some((i) => i.number === issue.number);
  return exists ? issues.map((i) => (i.number === issue.number ? issue : i)) : [...issues, issue];
}

/** `TK-42`. */
export function issueKey(projectKey: string, number: number): string {
  return projectKey ? `${projectKey}-${number}` : `#${number}`;
}
