/**
 * Datos inventados para los bocetos del tablero v2 (issue 033). No son de
 * Round ni de ningún proyecto real: un proyecto de ejemplo, dos personas y
 * dos agentes. Hoy, para «vencido», es 2026-11-13.
 */

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'accent' | 'danger' | 'brand';
export type Priority = 'urgente' | 'alta' | 'media' | 'baja';
export type AgentTool = 'CLAUDE_CODE' | 'CODEX' | 'CLOUD' | 'OTHER';
export type CiState = 'ok' | 'fail' | 'running';

export interface SketchActor {
  readonly id: string;
  readonly kind: 'PERSON' | 'AGENT';
  readonly name: string;
  readonly initials: string;
  readonly tool?: AgentTool;
  /** Para agentes: la persona dueña. */
  readonly ownerId?: string;
}

export interface SketchStatus {
  readonly id: string;
  readonly name: string;
  readonly tone: Tone;
  readonly wipLimit?: number;
}

export interface SketchLabel {
  readonly name: string;
  readonly tone: Tone;
}

export interface SketchIssue {
  readonly number: number;
  readonly title: string;
  readonly statusId: string;
  readonly priority: Priority;
  readonly labels: readonly SketchLabel[];
  readonly assigneeId?: string;
  /** Sub-issues hechos / total (cuando exista el 032). */
  readonly sub?: readonly [number, number];
  /** Rama o MR con el estado del CI (cuando exista el 016). */
  readonly branch?: { readonly name: string; readonly mr?: number; readonly ci: CiState };
  /** Fecha límite ISO (cuando exista en el 034). */
  readonly due?: string;
  readonly description?: string;
}

export const TODAY = '2026-11-13';
export const PROJECT = {
  key: 'HUE',
  name: 'Huerto vecinal',
  description: 'App para turnos de riego y cosechas compartidas.',
};

export const TOOL_NAME: Record<AgentTool, string> = {
  CLAUDE_CODE: 'Claude Code',
  CODEX: 'Codex',
  CLOUD: 'Agente en la nube',
  OTHER: 'Otra herramienta',
};

export const ACTORS: readonly SketchActor[] = [
  { id: 'ana', kind: 'PERSON', name: 'Ana Torres', initials: 'AT' },
  { id: 'luis', kind: 'PERSON', name: 'Luis Méndez', initials: 'LM' },
  {
    id: 'pc01',
    kind: 'AGENT',
    name: 'Claude Code PC-01',
    initials: 'P1',
    tool: 'CLAUDE_CODE',
    ownerId: 'ana',
  },
  {
    id: 'codex',
    kind: 'AGENT',
    name: 'Codex nube',
    initials: 'CX',
    tool: 'CODEX',
    ownerId: 'luis',
  },
];

export const STATUSES: readonly SketchStatus[] = [
  { id: 'todo', name: 'Por hacer', tone: 'neutral' },
  { id: 'doing', name: 'En curso', tone: 'info', wipLimit: 4 },
  { id: 'review', name: 'En revisión', tone: 'warning', wipLimit: 3 },
  { id: 'done', name: 'Hecho', tone: 'success' },
];

const L = {
  app: { name: 'app', tone: 'info' },
  api: { name: 'api', tone: 'accent' },
  diseno: { name: 'diseño', tone: 'brand' },
  bug: { name: 'bug', tone: 'danger' },
  infra: { name: 'infra', tone: 'neutral' },
} as const satisfies Record<string, SketchLabel>;

export const ISSUES: readonly SketchIssue[] = [
  {
    number: 31,
    title: 'Recordatorio push un día antes del turno de riego',
    statusId: 'todo',
    priority: 'alta',
    labels: [L.app],
    assigneeId: 'ana',
    due: '2026-11-18',
    sub: [0, 3],
  },
  {
    number: 34,
    title: 'Exportar cosechas del mes a CSV',
    statusId: 'todo',
    priority: 'media',
    labels: [L.api],
    due: '2026-11-10',
  },
  {
    number: 35,
    title: 'Pantalla vacía de «Mis parcelas»',
    statusId: 'todo',
    priority: 'baja',
    labels: [L.diseno, L.app],
    assigneeId: 'luis',
  },
  {
    number: 37,
    title: 'Validar que dos vecinos no reserven la misma parcela',
    statusId: 'todo',
    priority: 'alta',
    labels: [L.api, L.bug],
    assigneeId: 'codex',
  },
  {
    number: 38,
    title: 'Mapa del huerto con parcelas libres',
    statusId: 'todo',
    priority: 'media',
    labels: [L.app, L.diseno],
  },
  {
    number: 22,
    title: 'Calendario compartido de turnos de riego',
    statusId: 'doing',
    priority: 'urgente',
    labels: [L.app, L.api],
    assigneeId: 'ana',
    sub: [2, 4],
    branch: { name: 'feat/hue-22-turnos', mr: 41, ci: 'running' },
    due: '2026-11-12',
    description:
      'Cada vecino ve los turnos de la semana y puede cambiar el suyo con otro. Los cambios se avisan a los dos.',
  },
  {
    number: 26,
    title: 'Fotos de la cosecha en la ficha de la parcela',
    statusId: 'doing',
    priority: 'media',
    labels: [L.app],
    assigneeId: 'pc01',
    sub: [1, 2],
    branch: { name: 'feat/hue-26-fotos', mr: 43, ci: 'ok' },
  },
  {
    number: 27,
    title: 'Migrar sensores de humedad al nuevo broker',
    statusId: 'doing',
    priority: 'alta',
    labels: [L.infra],
    assigneeId: 'codex',
    branch: { name: 'feat/hue-27-broker', ci: 'fail' },
    due: '2026-11-20',
  },
  {
    number: 29,
    title: 'Corregir hora de los turnos en horario de verano',
    statusId: 'doing',
    priority: 'alta',
    labels: [L.bug],
    assigneeId: 'luis',
    due: '2026-11-14',
  },
  {
    number: 19,
    title: 'Alta de vecinos con invitación por enlace',
    statusId: 'review',
    priority: 'alta',
    labels: [L.api],
    assigneeId: 'pc01',
    sub: [3, 3],
    branch: { name: 'feat/hue-19-invitaciones', mr: 38, ci: 'ok' },
  },
  {
    number: 24,
    title: 'Paleta y tipografía de la ficha imprimible',
    statusId: 'review',
    priority: 'baja',
    labels: [L.diseno],
    assigneeId: 'luis',
    branch: { name: 'feat/hue-24-ficha', mr: 40, ci: 'ok' },
  },
  {
    number: 12,
    title: 'Registro e inicio de sesión con Google',
    statusId: 'done',
    priority: 'alta',
    labels: [L.app, L.api],
    assigneeId: 'ana',
    sub: [4, 4],
  },
  {
    number: 15,
    title: 'Backups diarios de la base',
    statusId: 'done',
    priority: 'media',
    labels: [L.infra],
    assigneeId: 'codex',
  },
  {
    number: 17,
    title: 'Lista de parcelas con filtros',
    statusId: 'done',
    priority: 'media',
    labels: [L.app],
    assigneeId: 'pc01',
  },
];

export function actorById(id: string | undefined): SketchActor | undefined {
  return ACTORS.find((a) => a.id === id);
}

export function issueKey(n: number): string {
  return `${PROJECT.key}-${n}`;
}

export function isOverdue(issue: SketchIssue): boolean {
  return !!issue.due && issue.due < TODAY && issue.statusId !== 'done';
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
