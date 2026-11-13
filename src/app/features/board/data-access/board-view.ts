/**
 * Modelo de «vista» del tablero (033, decisiones de Victor del 2026-11-13).
 * Una vista = cómo se ve (panel, agrupar, densidad) + qué se ve (filtros).
 * El 034 la guarda en el servidor con nombre y alcance sin cambiar la forma:
 * `SavedView = { name, scope, kind: 'tablero', ...BoardView }`.
 *
 * Mientras no exista el 034, «cómo se ve» se recuerda en localStorage por
 * proyecto, y los filtros van en la URL (parte 6). Hoy el tablero usa la
 * densidad; panel y agrupar llegan con las partes 5 y 6.
 */
export type PanelLayout = 'acoplado' | 'dividido';
export type ViewGroupBy = 'ninguno' | 'asignado' | 'prioridad' | 'etiqueta';
export type ViewDensity = 'comoda' | 'compacta';

export interface BoardViewFilters {
  /** Actores (personas o agentes) y/o «sin asignar». Vacío = todos. */
  readonly assigneeIds: readonly string[];
}

export interface BoardView {
  readonly panel: PanelLayout;
  readonly groupBy: ViewGroupBy;
  readonly density: ViewDensity;
  readonly filters: BoardViewFilters;
}

/** La primera vez en un proyecto (decisión 5 de Victor). */
export const DEFAULT_VIEW: BoardView = {
  panel: 'acoplado',
  groupBy: 'ninguno',
  density: 'compacta',
  filters: { assigneeIds: [] },
};

export const DENSITIES: readonly ViewDensity[] = ['comoda', 'compacta'];
const PANELS: readonly PanelLayout[] = ['acoplado', 'dividido'];
const GROUPS: readonly ViewGroupBy[] = ['ninguno', 'asignado', 'prioridad', 'etiqueta'];

export function viewStorageKey(projectKey: string): string {
  return `tk.tablero.vista.${projectKey}`;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Lee lo guardado. Tolera basura, valores viejos o campos que falten: cada
 * campo inválido vuelve a su default. Los filtros no se guardan acá (van en
 * la URL), así que siempre salen vacíos.
 */
export function parseStoredView(raw: string | null): BoardView {
  if (!raw) return DEFAULT_VIEW;
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_VIEW;
    data = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_VIEW;
  }
  return {
    panel: pick(data['panel'], PANELS, DEFAULT_VIEW.panel),
    groupBy: pick(data['groupBy'], GROUPS, DEFAULT_VIEW.groupBy),
    density: pick(data['density'], DENSITIES, DEFAULT_VIEW.density),
    filters: DEFAULT_VIEW.filters,
  };
}

/** Lo que se recuerda por proyecto: solo «cómo se ve». */
export function serializeStoredView(view: BoardView): string {
  const { panel, groupBy, density } = view;
  return JSON.stringify({ panel, groupBy, density });
}
