import type {
  AgentSession,
  DurationStats,
  FlowEfficiency,
  FlowMetrics,
  FlowWeek,
  HiringVerdict,
  MetricConfidence,
  SignalWindow,
  WaitingReason,
} from '@/app/api';

/**
 * Lógica pura de las páginas «Métricas» y «Agentes» (issue 036): períodos,
 * formato de duraciones, series por semana y agrupado de sesiones. Sin
 * Angular ni HTTP: se prueba sola (`metrics.logic.spec.ts`).
 */

// ── Período ─────────────────────────────────────────────────────────────────

/** Presets del selector, en semanas. */
export const PERIOD_PRESETS = [4, 12, 26, 52] as const;
export type PeriodWeeks = (typeof PERIOD_PRESETS)[number];
export const DEFAULT_PERIOD: PeriodWeeks = 12;

export function isPeriodWeeks(value: unknown): value is PeriodWeeks {
  return PERIOD_PRESETS.includes(Number(value) as PeriodWeeks);
}

/**
 * Lunes 00:00 (hora local) de la semana de `now`, menos `weeks - 1` semanas:
 * así el período son `weeks` semanas completas de lunes a lunes, la última
 * en curso. Con la zona del navegador, que es la que se manda al servicio.
 */
export function periodStart(now: Date, weeks: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - back - 7 * (weeks - 1));
  return d;
}

/** Zona IANA del navegador; la del servicio si no se puede leer. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
  } catch {
    return 'America/Mexico_City';
  }
}

// ── Formato ─────────────────────────────────────────────────────────────────

const DAY = 86_400;
const HOUR = 3_600;

/** Una duración para leer: clave de i18n y su valor (un decimal). */
export interface DurationText {
  key: 'metrics.unit.days' | 'metrics.unit.hours' | 'metrics.unit.minutes';
  value: string;
}

/**
 * Días desde 1 día; si no, horas; debajo de una hora, minutos. Redondea antes
 * de elegir la unidad: 23 h 58 min es «1 d», no «24 h».
 */
export function durationText(seconds: number): DurationText {
  if (round1(seconds / DAY) >= 1)
    return { key: 'metrics.unit.days', value: oneDecimal(seconds / DAY) };
  if (round1(seconds / HOUR) >= 1)
    return { key: 'metrics.unit.hours', value: oneDecimal(seconds / HOUR) };
  return { key: 'metrics.unit.minutes', value: String(Math.round(seconds / 60)) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function oneDecimal(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Días con un decimal (para ejes y tablas). */
export function toDays(seconds: number | null): number | null {
  return seconds === null ? null : Math.round((seconds / DAY) * 10) / 10;
}

/** Etiqueta corta de una semana: el día del lunes, «17 nov». */
export function weekLabel(iso: string, locale = 'es-MX'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    .format(d)
    .replace('.', '');
}

/** Fecha corta con año: «18 jun 2026». */
export function dayLabel(iso: string, locale = 'es-MX'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(d)
    .replace('.', '');
}

/** Días enteros entre dos fechas ISO (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (DAY * 1000));
}

// ── Confianza ───────────────────────────────────────────────────────────────

export type ConfidenceKind = 'recorded' | 'approximate' | 'none';

export function confidenceKind(c: MetricConfidence): ConfidenceKind {
  switch (c) {
    case 'METRIC_CONFIDENCE_RECORDED':
      return 'recorded';
    case 'METRIC_CONFIDENCE_APPROXIMATE':
      return 'approximate';
    default:
      return 'none';
  }
}

// ── Vista de la página ──────────────────────────────────────────────────────

/** Un punto por semana de una serie con banda (mediana y p85). */
export interface BandPoint {
  label: string;
  /** En días; `null` = sin terminados esa semana (hueco, no cero). */
  median: number | null;
  p85: number | null;
}

/** Un punto por semana de columnas apiladas. */
export interface StackPoint {
  label: string;
  values: number[];
}

export interface Kpi {
  /** Valor principal ya formateado (o null: sin datos). */
  value: DurationText | null;
  p85: DurationText | null;
  count: number;
  spark: (number | null)[];
  confidence: ConfidenceKind;
}

export interface MetricsView {
  weeks: number;
  lead: Kpi;
  cycle: Kpi;
  closedValue: number;
  closedOther: number;
  /** Sin etiquetas de valor: todo cuenta como valor (una sola serie). */
  hasValueLabels: boolean;
  closedSpark: number[];
  wip: number;
  wipSpark: number[];
  confidence: ConfidenceKind;
  leadSeries: BandPoint[];
  cycleSeries: BandPoint[];
  closedSeries: StackPoint[];
  wipSeries: BandPoint[];
  startedSeries: StackPoint[];
  /** La primera y la última semana pueden venir recortadas. */
  partialFirst: boolean;
  partialLast: boolean;
  doneWithoutDates: number;
  issues: number;
}

function kpi(
  stats: DurationStats,
  weeks: FlowWeek[],
  pick: (w: FlowWeek) => DurationStats,
  c: MetricConfidence,
): Kpi {
  return {
    value: stats.median === null ? null : durationText(stats.median),
    p85: stats.p85 === null ? null : durationText(stats.p85),
    count: stats.count,
    spark: weeks.map((w) => toDays(pick(w).median)),
    confidence: confidenceKind(c),
  };
}

const FULL_WEEK = 6 * DAY + 23 * HOUR; // un cambio de horario quita una hora

function isPartial(w: FlowWeek | undefined): boolean {
  if (!w) return false;
  return (new Date(w.end).getTime() - new Date(w.start).getTime()) / 1000 < FULL_WEEK;
}

/** Arma la vista de «Métricas» a partir de la respuesta de `GetFlowMetrics`. */
export function metricsView(m: FlowMetrics, locale = 'es-MX'): MetricsView {
  const weeks = m.weeks;
  const s = m.summary;
  const band = (pick: (w: FlowWeek) => DurationStats) =>
    weeks.map((w) => ({
      label: weekLabel(w.start, locale),
      median: toDays(pick(w).median),
      p85: toDays(pick(w).p85),
    }));
  return {
    weeks: weeks.length,
    lead: kpi(s.leadTime, weeks, (w) => w.leadTime, s.source.confidence),
    cycle: kpi(s.cycleTime, weeks, (w) => w.cycleTime, s.source.confidence),
    closedValue: s.closedValue,
    closedOther: s.closedOther,
    hasValueLabels: m.valueLabelIds.length > 0,
    closedSpark: weeks.map((w) => w.closedValue + w.closedOther),
    wip: s.wip,
    wipSpark: weeks.map((w) => w.wip),
    confidence: confidenceKind(s.source.confidence),
    leadSeries: band((w) => w.leadTime),
    cycleSeries: band((w) => w.cycleTime),
    closedSeries: weeks.map((w) => ({
      label: weekLabel(w.start, locale),
      values:
        m.valueLabelIds.length > 0
          ? [w.closedValue, w.closedOther]
          : [w.closedValue + w.closedOther],
    })),
    wipSeries: weeks.map((w) => ({ label: weekLabel(w.start, locale), median: w.wip, p85: null })),
    startedSeries: weeks.map((w) => ({ label: weekLabel(w.start, locale), values: [w.started] })),
    partialFirst: isPartial(weeks[0]),
    partialLast: isPartial(weeks[weeks.length - 1]),
    doneWithoutDates: m.coverage.doneWithoutDates,
    issues: m.coverage.issues,
  };
}

// ── Agentes ─────────────────────────────────────────────────────────────────

/** Grupos de la vista «Agentes», en el orden en que se muestran. */
export type AgentGroup = 'person' | 'stalled' | 'working' | 'other' | 'idle';

export const AGENT_GROUPS: readonly AgentGroup[] = [
  'person',
  'stalled',
  'working',
  'other',
  'idle',
];

/**
 * A qué grupo va una sesión: primero lo que necesita a una persona (como
 * `IssueSessions.items`), después las colgadas.
 *  - `person`: espera a su persona, o esperando-ok sin token (pide permiso).
 *    «Sin token» llega como `WAITING_ON_NONE`: el servicio guarda NONE
 *    cuando el panel no trae espera (issue 026).
 *  - `other`: espera a otra sesión o a otra cosa (CI, merge).
 */
export function agentGroup(s: Pick<AgentSession, 'status' | 'waitingOn'>): AgentGroup {
  if (s.waitingOn === 'WAITING_ON_PERSON') return 'person';
  if (s.status === 'SESSION_STATUS_STALLED') return 'stalled';
  if (s.status === 'SESSION_STATUS_WORKING') return 'working';
  if (s.waitingOn === 'WAITING_ON_SESSION' || s.waitingOn === 'WAITING_ON_OTHER') return 'other';
  if (s.status === 'SESSION_STATUS_WAITING_OK') return 'person';
  return 'idle';
}

export interface AgentGroupView {
  group: AgentGroup;
  sessions: AgentSession[];
}

/**
 * Las sesiones activas por grupo (todos los grupos, aunque estén vacíos),
 * cada grupo de la que cambió de estado hace más a la que menos: la que más
 * espera, arriba.
 */
export function groupSessions(sessions: readonly AgentSession[]): AgentGroupView[] {
  const by = new Map<AgentGroup, AgentSession[]>(AGENT_GROUPS.map((g) => [g, []]));
  for (const s of sessions) {
    if (s.status === 'SESSION_STATUS_ENDED') continue;
    by.get(agentGroup(s))!.push(s);
  }
  return AGENT_GROUPS.map((group) => ({
    group,
    sessions: by.get(group)!.sort((a, b) => a.statusChangedAt.localeCompare(b.statusChangedAt)),
  }));
}

/** «hace 25 min»: clave de i18n y valor, desde `iso` hasta `now`. */
export function sinceText(iso: string, now: Date): DurationText | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return durationText(Math.max(0, (now.getTime() - t) / 1000));
}

// ── Dónde se va el tiempo (parte 3) ─────────────────────────────────────────

/** Las partes del tiempo medido, en el orden de la prioridad del contrato. */
export const TIME_PARTS = ['working', 'waitingHuman', 'blocked', 'inReview'] as const;
export type TimePart = (typeof TIME_PARTS)[number];

/** Color de cada parte: los 4 primeros de la paleta validada, en orden. */
export const TIME_PART_COLOR: Record<TimePart, string> = {
  working: 'var(--chart-1)',
  waitingHuman: 'var(--chart-2)',
  blocked: 'var(--chart-3)',
  inReview: 'var(--chart-4)',
};

export interface TimeShare {
  part: TimePart;
  hours: number;
  /** Parte del tiempo medido, en % con un decimal. */
  pct: number;
}

export interface ReasonShare {
  /** Sufijo de la clave de i18n del motivo (`metrics.reason.*`). */
  reason: string;
  hours: number;
  /** Parte de toda la espera a personas, 0 a 100. */
  pct: number;
}

export interface TimeView {
  since: string;
  efficiencyPct: number | null;
  parts: TimeShare[];
  idleHours: number;
  issues: number;
  pending: number;
  oldest: DurationText | null;
  response: { count: number; median: DurationText | null; p85: DurationText | null };
  reasons: ReasonShare[];
  /** Horas por semana, una serie por parte; solo las semanas con historia. */
  weekly: StackPoint[];
}

const hoursOf = (s: number) => Math.round((s / HOUR) * 10) / 10;

const REASON_KEY: Record<WaitingReason, string> = {
  WAITING_REASON_UNSPECIFIED: 'none',
  WAITING_REASON_REVIEW: 'review',
  WAITING_REASON_TESTING: 'testing',
  WAITING_REASON_DECISION: 'decision',
  WAITING_REASON_DEPLOY: 'deploy',
};

/** Sufijo de i18n de un motivo; uno nuevo del contrato, «sin motivo». */
export function reasonKey(r: WaitingReason): string {
  return REASON_KEY[r] ?? 'none';
}

function measuredOf(e: FlowEfficiency): number {
  return TIME_PARTS.reduce((sum, p) => sum + e[p], 0);
}

/**
 * Vista de «Dónde se va el tiempo». `null` si el proyecto no tiene historia
 * de sesiones o ninguna semana del período tiene datos.
 */
export function timeView(m: FlowMetrics, locale = 'es-MX'): TimeView | null {
  const e = m.summary.efficiency;
  if (!m.sessionsRecordedSince || !e) return null;
  const measured = measuredOf(e);
  const q = m.summary.humanQueue;
  const median = q?.responseTime.median ?? null;
  const p85 = q?.responseTime.p85 ?? null;
  return {
    since: dayLabel(m.sessionsRecordedSince, locale),
    efficiencyPct: e.efficiencyBp === null ? null : e.efficiencyBp / 100,
    parts: TIME_PARTS.map((part) => ({
      part,
      hours: hoursOf(e[part]),
      pct: measured ? Math.round((e[part] / measured) * 1000) / 10 : 0,
    })),
    idleHours: hoursOf(e.idle),
    issues: e.issues,
    pending: q?.pending ?? 0,
    oldest: q?.oldestPending ? durationText(q.oldestPending) : null,
    response: {
      count: q?.responseTime.count ?? 0,
      median: median === null ? null : durationText(median),
      p85: p85 === null ? null : durationText(p85),
    },
    reasons: e.waitingHumanByReason.map((r) => ({
      reason: reasonKey(r.reason),
      hours: hoursOf(r.duration),
      pct: e.waitingHuman ? Math.round((r.duration / e.waitingHuman) * 100) : 0,
    })),
    // Solo las semanas con historia: antes no hubo cero horas, no hubo medición.
    weekly: m.weeks.flatMap((w) =>
      w.efficiency
        ? [
            {
              label: weekLabel(w.start, locale),
              values: TIME_PARTS.map((p) => hoursOf(w.efficiency![p])),
            },
          ]
        : [],
    ),
  };
}

// ── Señal de contratación ───────────────────────────────────────────────────

export type SignalKind = 'insufficient' | 'none' | 'needsPeople' | 'reduceWip';

export interface SignalRow {
  /** Sufijo de la clave de i18n de la fila (`metrics.signal.row.*`). */
  key: 'waiting' | 'response' | 'wip' | 'closed';
  current: string;
  previous: string;
}

export interface SignalView {
  kind: SignalKind;
  liveWeeks: number;
  weeksNeeded: number;
  weeksNeededPreliminary: number;
  /** Semanas que faltan para la próxima lectura (preliminar o completa). */
  missing: number;
  preliminary: boolean;
  wipHigh: boolean;
  /** Dónde se junta la espera (sufijo del motivo y parte de 0 a 100). */
  profiles: { reason: string; pct: number }[];
  /** Los números de este mes contra el anterior; vacío sin datos. */
  rows: SignalRow[];
}

/** Duración corta para la tabla de la señal («5.2 h», «1.5 d»). */
function shortDuration(seconds: number): string {
  const d = durationText(seconds);
  const unit = d.key === 'metrics.unit.days' ? 'd' : d.key === 'metrics.unit.hours' ? 'h' : 'min';
  return `${d.value} ${unit}`;
}

function windowNumbers(w: SignalWindow | null): Record<SignalRow['key'], string> {
  if (!w) return { waiting: '—', response: '—', wip: '—', closed: '—' };
  const measured = measuredOf(w.efficiency);
  const pct = measured ? Math.round((w.efficiency.waitingHuman / measured) * 100) : 0;
  const median = w.humanResponse.median;
  return {
    waiting: `${pct} % · ${hoursOf(w.efficiency.waitingHuman)} h`,
    response: median === null ? '—' : shortDuration(median),
    wip: String(w.wipMedian),
    closed: String(w.closed),
  };
}

const VERDICT_KIND: Record<HiringVerdict, SignalKind> = {
  HIRING_VERDICT_UNSPECIFIED: 'insufficient',
  HIRING_VERDICT_INSUFFICIENT_DATA: 'insufficient',
  HIRING_VERDICT_NO_SIGNAL: 'none',
  HIRING_VERDICT_NEEDS_PEOPLE: 'needsPeople',
  HIRING_VERDICT_REDUCE_WIP: 'reduceWip',
};

/** Vista de la señal. Sin señal en la respuesta: datos insuficientes. */
export function signalView(m: FlowMetrics): SignalView {
  const s = m.hiringSignal;
  const live = s?.liveWeeks ?? 0;
  const needed = s?.weeksNeeded || 8;
  const prelim = s?.weeksNeededPreliminary || 4;
  const cur = windowNumbers(s?.current ?? null);
  const prev = windowNumbers(s?.previous ?? null);
  const keys = ['waiting', 'response', 'wip', 'closed'] as const;
  return {
    kind: s ? (VERDICT_KIND[s.verdict] ?? 'insufficient') : 'insufficient',
    liveWeeks: live,
    weeksNeeded: needed,
    weeksNeededPreliminary: prelim,
    missing: Math.max(0, (live < prelim ? prelim : needed) - live),
    preliminary: s?.preliminary ?? false,
    wipHigh: s?.wipHigh ?? false,
    profiles: (s?.profiles ?? []).map((p) => ({
      reason: reasonKey(p.reason),
      pct: Math.round(p.shareBp / 100),
    })),
    rows: s?.current ? keys.map((key) => ({ key, current: cur[key], previous: prev[key] })) : [],
  };
}
