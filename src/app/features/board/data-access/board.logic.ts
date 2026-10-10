import { BOARD_STATES, type BoardState, type Issue, type Priority } from '@/app/api';

/** Funciones puras del tablero (sin Angular): agrupar, mover, ordenar. */

export type BoardColumns = Record<BoardState, Issue[]>;

const PRIORITY_RANK: Record<Priority, number> = {
  PRIORITY_URGENT: 4,
  PRIORITY_HIGH: 3,
  PRIORITY_MEDIUM: 2,
  PRIORITY_UNSPECIFIED: 2, // el backend guarda UNSPECIFIED como MEDIUM
  PRIORITY_LOW: 1,
};

/** Columna en la que se muestra un issue. Un estado desconocido cae en «Por hacer». */
export function columnOf(issue: Pick<Issue, 'state'>): BoardState {
  return issue.state === 'ISSUE_STATE_UNSPECIFIED' ? 'ISSUE_STATE_TODO' : issue.state;
}

/**
 * Mismo orden que ListIssues: prioridad descendente y, dentro de la misma, el
 * más reciente primero. Así una tarjeta movida cae donde la pondría el backend.
 */
export function compareIssues(a: Issue, b: Issue): number {
  const byPriority = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (byPriority !== 0) return byPriority;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return b.number - a.number;
}

export function groupByState(issues: readonly Issue[]): BoardColumns {
  const columns: BoardColumns = {
    ISSUE_STATE_TODO: [],
    ISSUE_STATE_IN_PROGRESS: [],
    ISSUE_STATE_DONE: [],
  };
  for (const issue of issues) columns[columnOf(issue)].push(issue);
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

/** `TK-42`. */
export function issueKey(projectKey: string, number: number): string {
  return projectKey ? `${projectKey}-${number}` : `#${number}`;
}
