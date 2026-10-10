import { BOARD_STATES, type BoardState, type Issue } from '@/app/api';

/** Funciones puras del tablero (sin Angular): agrupar, mover, ordenar. */

export type BoardColumns = Record<BoardState, Issue[]>;

/**
 * Columna en la que se muestra un issue, o `null` si no va en el tablero
 * (descartado). Un estado desconocido cae en «Por hacer».
 */
export function columnOf(issue: Pick<Issue, 'state'>): BoardState | null {
  switch (issue.state) {
    case 'ISSUE_STATE_CANCELED':
      return null;
    case 'ISSUE_STATE_UNSPECIFIED':
      return 'ISSUE_STATE_TODO';
    default:
      return issue.state;
  }
}

/**
 * Mismo orden que ListIssues: `rank` ascendente, comparado como string (sin
 * locale, como el backend). El número sólo desempata ranks vacíos o iguales.
 */
export function compareIssues(a: Issue, b: Issue): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  return a.number - b.number;
}

export function groupByState(issues: readonly Issue[]): BoardColumns {
  const columns: BoardColumns = {
    ISSUE_STATE_TODO: [],
    ISSUE_STATE_IN_PROGRESS: [],
    ISSUE_STATE_DONE: [],
  };
  for (const issue of issues) {
    const column = columnOf(issue);
    if (column) columns[column].push(issue);
  }
  for (const state of BOARD_STATES) columns[state].sort(compareIssues);
  return columns;
}

/** Copia de la lista con el issue `number` en el estado `state`. */
export function withState(issues: readonly Issue[], number: number, state: BoardState): Issue[] {
  return issues.map((i) => (i.number === number ? { ...i, state } : i));
}

/** Reemplaza (por número) o agrega un issue. */
export function upsertIssue(issues: readonly Issue[], issue: Issue): Issue[] {
  const exists = issues.some((i) => i.number === issue.number);
  return exists ? issues.map((i) => (i.number === issue.number ? issue : i)) : [...issues, issue];
}

/** Columna vecina (para mover con el teclado), o `null` en los bordes. */
export function adjacentState(state: BoardState, direction: -1 | 1): BoardState | null {
  const index = BOARD_STATES.indexOf(state) + direction;
  return BOARD_STATES[index] ?? null;
}

/** `TQ-42`. */
export function issueKey(projectKey: string, number: number): string {
  return projectKey ? `${projectKey}-${number}` : `#${number}`;
}
