/**
 * Vista Plan (039): los issues de un proyecto por categoría, con tres
 * carriles (hecho, en curso, por hacer). La categoría es una etiqueta con un
 * prefijo (`perfil/escuela`): el nombre es lo que sigue al prefijo. Puro: sin
 * Angular, para probarlo con vitest.
 */
import type { Issue, Label } from '@/app/api';
import { environment } from '@/environments/environment';

export type Lane = 'done' | 'doing' | 'todo';
/** Orden de los carriles en pantalla. */
export const LANES: readonly Lane[] = ['done', 'doing', 'todo'];

/** Prefijo por defecto (decisión del issue 039). */
export const DEFAULT_PREFIX = 'perfil/';
/** Etiqueta de un responsable sin cuenta en Tekitla (decisión de Victor, 2026-11-18). */
export const RESPONSIBLE_PREFIX = 'responsable/';
/** Etiqueta de un issue que espera a una persona, mientras no esté el 026. */
export const WAITING_PREFIX = 'espera/';
/** El carril «hecho» muestra lo cerrado en estos días, salvo «ver todos». */
export const RECENT_DONE_DAYS = 28;
/** Valor de `?categoria=` para el bloque «Sin categoría». */
export const UNCATEGORIZED = 'sin-categoria';

/** Prefijos que no son categorías: ya tienen su lugar en la vista. */
const RESERVED = [RESPONSIBLE_PREFIX, WAITING_PREFIX];

export interface PlanBlock {
  /** El valor tras el prefijo (`escuela`) o `UNCATEGORIZED`. */
  readonly key: string;
  /** Issues de cada carril. El de hecho, solo los recientes salvo `allDone`. */
  readonly lanes: Readonly<Record<Lane, readonly Issue[]>>;
  /** Cuántos hay en cada carril (el de hecho cuenta todos). */
  readonly counts: Readonly<Record<Lane, number>>;
  /** Hechos que no se muestran por viejos («ver todos»). */
  readonly olderDone: number;
}

export interface WaitingGroup {
  readonly person: string;
  readonly issues: readonly Issue[];
}

export interface Plan {
  /** Una por categoría, por nombre; «Sin categoría» al final si tiene issues. */
  readonly blocks: readonly PlanBlock[];
  /** Totales de los bloques visibles: cada issue cuenta una vez (CU-039-3). */
  readonly totals: Readonly<Record<Lane, number>>;
  /** Issues abiertos con `espera/<persona>`, por persona (CU-039-8). */
  readonly waiting: readonly WaitingGroup[];
  /** Todas las categorías del proyecto con el prefijo (para el filtro). */
  readonly categories: readonly string[];
  /** Hay issues sin categoría (el filtro ofrece «Sin categoría»). */
  readonly hasUncategorized: boolean;
}

export interface PlanInput {
  readonly issues: readonly Issue[];
  readonly labelsById: ReadonlyMap<string, Label>;
  readonly prefix: string;
  /** `?categoria=`: solo ese bloque. Vacío o desconocido: todos. */
  readonly category?: string;
  /** Bloques con «ver todos» abierto. */
  readonly allDone?: ReadonlySet<string>;
  readonly now: Date;
}

/** El carril de un issue; null si está descartado. */
export function laneOf(issue: Issue): Lane | null {
  switch (issue.state) {
    case 'ISSUE_STATE_DONE':
      return 'done';
    case 'ISSUE_STATE_IN_PROGRESS':
      return 'doing';
    case 'ISSUE_STATE_TODO':
      return 'todo';
    default:
      return null;
  }
}

/**
 * Normaliza lo que se escribe o se recuerda como prefijo: minúsculas, sin
 * espacios y con la barra al final (`Area` → `area/`). Vacío: el default.
 */
export function normalizePrefix(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toLowerCase().replace(/\/+$/, '');
  return value ? `${value}/` : DEFAULT_PREFIX;
}

/**
 * Prefijos que se pueden elegir: los de las etiquetas con `/` del proyecto,
 * salvo los reservados, más el actual. Por nombre.
 */
export function prefixesOf(labels: readonly Label[], current: string): string[] {
  const set = new Set<string>([current]);
  for (const label of labels) {
    const i = label.name.indexOf('/');
    if (i <= 0) continue;
    const prefix = label.name.slice(0, i + 1).toLowerCase();
    if (!RESERVED.includes(prefix)) set.add(prefix);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Valores de las etiquetas de un issue con ese prefijo, sin repetir. */
function valuesWith(
  issue: Issue,
  labelsById: ReadonlyMap<string, Label>,
  prefix: string,
): string[] {
  const out: string[] = [];
  for (const id of issue.labelIds) {
    const name = labelsById.get(id)?.name.toLowerCase();
    if (!name?.startsWith(prefix)) continue;
    const value = name.slice(prefix.length).trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Responsables sin cuenta del issue (`responsable/<nombre>`). */
export function responsiblesOf(issue: Issue, labelsById: ReadonlyMap<string, Label>): string[] {
  return valuesWith(issue, labelsById, RESPONSIBLE_PREFIX);
}

/** Cómo se muestra un valor (`escuela` → `Escuela`, `admin-round` → `Admin round`). */
export function displayName(value: string): string {
  const text = value.replace(/-/g, ' ');
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

/** Nombre de una persona desde la etiqueta (`ana-perez` → `Ana Perez`; los acentos ya no vienen). */
export function personName(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('es') + w.slice(1))
    .join(' ');
}

/** Cerrado hace menos de `RECENT_DONE_DAYS` (con `updatedAt`: el contrato no tiene fecha de cierre). */
function isRecent(issue: Issue, now: Date): boolean {
  const at = Date.parse(issue.updatedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at <= RECENT_DONE_DAYS * 24 * 60 * 60 * 1000;
}

const PRIORITY_ORDER: Record<string, number> = {
  PRIORITY_URGENT: 0,
  PRIORITY_HIGH: 1,
  PRIORITY_MEDIUM: 2,
  PRIORITY_LOW: 3,
};

/** Hechos: lo último cerrado primero. Los demás: por prioridad y después por rank. */
function sortLane(lane: Lane, issues: Issue[]): Issue[] {
  if (lane === 'done') {
    return issues.sort((a, b) =>
      b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0,
    );
  }
  return issues.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0),
  );
}

function emptyLanes(): Record<Lane, Issue[]> {
  return { done: [], doing: [], todo: [] };
}

export function buildPlan(input: PlanInput): Plan {
  const { labelsById, prefix, now } = input;
  const byCategory = new Map<string, Record<Lane, Issue[]>>();
  const uncategorized = emptyLanes();
  const categoriesOf = new Map<Issue, string[]>();
  for (const issue of input.issues) {
    const lane = laneOf(issue);
    if (!lane) continue;
    const values = valuesWith(issue, labelsById, prefix);
    categoriesOf.set(issue, values);
    if (!values.length) uncategorized[lane].push(issue);
    for (const value of values) {
      let lanes = byCategory.get(value);
      if (!lanes) byCategory.set(value, (lanes = emptyLanes()));
      lanes[lane].push(issue);
    }
  }

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  const hasUncategorized = LANES.some((l) => uncategorized[l].length > 0);
  const wanted = input.category ?? '';
  const known = wanted === UNCATEGORIZED ? hasUncategorized : byCategory.has(wanted);
  const visible = (key: string) => !known || key === wanted;

  const block = (key: string, lanes: Record<Lane, Issue[]>): PlanBlock => {
    const done = sortLane('done', lanes.done);
    const shown = input.allDone?.has(key) ? done : done.filter((i) => isRecent(i, now));
    return {
      key,
      lanes: {
        done: shown,
        doing: sortLane('doing', lanes.doing),
        todo: sortLane('todo', lanes.todo),
      },
      counts: { done: done.length, doing: lanes.doing.length, todo: lanes.todo.length },
      olderDone: done.length - shown.length,
    };
  };
  const blocks = categories.filter(visible).map((key) => block(key, byCategory.get(key)!));
  if (hasUncategorized && visible(UNCATEGORIZED)) blocks.push(block(UNCATEGORIZED, uncategorized));

  // Totales: los issues de los bloques visibles, cada uno una vez.
  const inView = new Set<Issue>();
  for (const issue of categoriesOf.keys()) {
    const values = categoriesOf.get(issue)!;
    const keys = values.length ? values : [UNCATEGORIZED];
    if (keys.some(visible)) inView.add(issue);
  }
  const totals: Record<Lane, number> = { done: 0, doing: 0, todo: 0 };
  const waitingBy = new Map<string, Issue[]>();
  for (const issue of inView) {
    const lane = laneOf(issue)!;
    totals[lane]++;
    if (lane === 'done') continue;
    for (const person of valuesWith(issue, labelsById, WAITING_PREFIX)) {
      const list = waitingBy.get(person) ?? [];
      list.push(issue);
      waitingBy.set(person, list);
    }
  }
  const waiting = [...waitingBy.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([person, issues]) => ({ person, issues: sortLane('todo', issues) }));

  return { blocks, totals, waiting, categories, hasUncategorized };
}

/** `**Qué espera:** …`, con o sin `>` (cabecera de los docs de Round). */
const WAITING_NOTE = /^\s*(?:>\s*)?\*\*\s*qu[eé] espera\s*:\s*\*\*\s*(.*?)\s*$/i;

/**
 * Qué espera un issue (decisión de Victor, 2026-11-18, opción a): la
 * primera línea `**Qué espera:** …` de la descripción antes del primer
 * `## `. La descripción importada trae la cabecera del doc, así que no hace
 * falta cambiar el contrato ni el importador. Sin negritas ni comillas
 * invertidas; "" si no hay.
 */
export function waitingNote(description: string): string {
  for (const line of description.split(/\r?\n/)) {
    if (line.startsWith('## ')) break;
    const match = WAITING_NOTE.exec(line);
    if (match) return match[1].replace(/\*\*|`/g, '').trim();
  }
  return '';
}

/** Clave en localStorage del prefijo elegido en un proyecto (como la vista del tablero). */
export function prefixStorageKey(projectId: string): string {
  return `${environment.appName}.plan.prefijo.${projectId}`;
}
