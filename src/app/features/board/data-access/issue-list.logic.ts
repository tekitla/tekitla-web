import type { Issue, IssueOrder, ListIssuesRequest, Priority, StatusCategory } from '@/app/api';

/**
 * Lista de issues (pantalla Issues): filtros, su forma en la URL (para
 * compartirla y que recargar muestre lo mismo) y el request de `ListIssues`.
 * Funciones puras, sin Angular.
 */

/** Pestañas de la lista. */
export type IssueScope = 'activos' | 'hechos' | 'descartados' | 'todos';
export const SCOPES: readonly IssueScope[] = ['activos', 'hechos', 'descartados', 'todos'];

/** Orden: el del tablero, último cambio o prioridad (empates, por el del tablero). */
export type IssueSort = 'tablero' | 'cambio' | 'prioridad';
export const SORTS: readonly IssueSort[] = ['tablero', 'cambio', 'prioridad'];

export type PriorityFilter = Exclude<Priority, 'PRIORITY_UNSPECIFIED'>;

/** Prioridad en la URL (`?prioridad=alta`). */
export const PRIORITY_PARAM: Record<string, PriorityFilter> = {
  baja: 'PRIORITY_LOW',
  media: 'PRIORITY_MEDIUM',
  alta: 'PRIORITY_HIGH',
  urgente: 'PRIORITY_URGENT',
};

export interface IssueFilters {
  scope: IssueScope;
  /** Título o clave (`TK-12`); hasta `QUERY_MAX` caracteres. */
  query: string;
  priority: PriorityFilter | '';
  labelId: string;
  statusId: string;
  sort: IssueSort;
}

/** Largo máximo de la búsqueda (tekitla-issues: `IssueSearchMaxLen`). */
export const QUERY_MAX = 200;

export const DEFAULT_FILTERS: IssueFilters = {
  scope: 'activos',
  query: '',
  priority: '',
  labelId: '',
  statusId: '',
  sort: 'tablero',
};

/** Query params de la URL, tal como los entrega el router (ausentes: `undefined`). */
export interface IssueListParams {
  q?: string;
  ver?: string;
  prioridad?: string;
  etiqueta?: string;
  estado?: string;
  orden?: string;
}

const STATES: Record<IssueScope, readonly StatusCategory[]> = {
  activos: ['ISSUE_STATE_TODO', 'ISSUE_STATE_IN_PROGRESS'],
  hechos: ['ISSUE_STATE_DONE'],
  descartados: ['ISSUE_STATE_CANCELED'],
  todos: [],
};

const ORDER: Record<IssueSort, IssueOrder> = {
  tablero: 'ISSUE_ORDER_RANK',
  cambio: 'ISSUE_ORDER_UPDATED_DESC',
  prioridad: 'ISSUE_ORDER_PRIORITY_DESC',
};

/** Filtros desde la URL; lo que no se reconoce cae en el valor por defecto. */
export function filtersFromParams(params: IssueListParams): IssueFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T) =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    scope: pick(params.ver, SCOPES, DEFAULT_FILTERS.scope),
    query: (params.q ?? '').slice(0, QUERY_MAX),
    priority: PRIORITY_PARAM[params.prioridad ?? ''] ?? '',
    labelId: params.etiqueta ?? '',
    statusId: params.estado ?? '',
    sort: pick(params.orden, SORTS, DEFAULT_FILTERS.sort),
  };
}

/**
 * Filtros como query params: solo lo que difiere del valor por defecto
 * (`null` borra el parámetro de la URL, con `queryParamsHandling: 'merge'`).
 */
export function filtersToParams(
  filters: IssueFilters,
): Record<keyof IssueListParams, string | null> {
  const priority = Object.entries(PRIORITY_PARAM).find(([, p]) => p === filters.priority)?.[0];
  const query = filters.query.trim();
  return {
    q: query || null,
    ver: filters.scope === DEFAULT_FILTERS.scope ? null : filters.scope,
    prioridad: priority ?? null,
    etiqueta: filters.labelId || null,
    estado: filters.statusId || null,
    orden: filters.sort === DEFAULT_FILTERS.sort ? null : filters.sort,
  };
}

/** Si hay algún filtro además de la pestaña y el orden («Limpiar filtros»). */
export function hasFilters(filters: IssueFilters): boolean {
  return !!(filters.query.trim() || filters.priority || filters.labelId || filters.statusId);
}

/** Mismos filtros y orden: un cursor de uno sirve para el otro. */
export function sameFilters(a: IssueFilters, b: IssueFilters): boolean {
  return (
    a.scope === b.scope &&
    a.query.trim() === b.query.trim() &&
    a.priority === b.priority &&
    a.labelId === b.labelId &&
    a.statusId === b.statusId &&
    a.sort === b.sort
  );
}

/**
 * Si un issue sigue cumpliendo los filtros después de cambiarlo (pestaña,
 * estado, prioridad y etiqueta; la búsqueda y el orden no cambian con mover,
 * descartar o restaurar).
 */
export function matchesFilters(issue: Issue, filters: IssueFilters): boolean {
  const states = STATES[filters.scope];
  return (
    (!states.length || states.includes(issue.state as StatusCategory)) &&
    (!filters.statusId || issue.statusId === filters.statusId) &&
    (!filters.priority || issue.priority === filters.priority) &&
    (!filters.labelId || issue.labelIds.includes(filters.labelId))
  );
}

/** El request de `ListIssues` (sin la página). Nunca manda `state` junto con `states`. */
export function toListRequest(filters: IssueFilters): ListIssuesRequest {
  return {
    query: filters.query.trim() || undefined,
    states: STATES[filters.scope],
    statusIds: filters.statusId ? [filters.statusId] : [],
    priorities: filters.priority ? [filters.priority] : [],
    labelIds: filters.labelId ? [filters.labelId] : [],
    orderBy: ORDER[filters.sort],
  };
}
