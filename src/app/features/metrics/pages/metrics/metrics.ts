import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ShellNav } from '@/app/layout/shell/shell-nav';
import type { ChartSeries } from '@/app/ui/components/charts/week-chart';
import { Sparkline } from '@/app/ui/components/charts/sparkline';
import { WeekChart } from '@/app/ui/components/charts/week-chart';
import { Icon } from '@/app/ui/components/icon/icon';
import { boardNav } from '@/app/features/board/board-nav';
import { BoardStore } from '@/app/features/board/data-access/board.store';
import { issueKey } from '@/app/features/board/data-access/board.logic';
import {
  DEFAULT_PERIOD,
  PERIOD_PRESETS,
  dayLabel,
  daysBetween,
  isPeriodWeeks,
  type BandPoint,
  type StackPoint,
} from '../../data-access/metrics.logic';
import { MetricsStore } from '../../data-access/metrics.store';

/** Qué gráfico se ve como tabla. */
type TableKey = 'time' | 'closed' | 'wip';

/**
 * Página «Métricas» de un proyecto (issue 036, `proyectos/:projectId/metricas`):
 * cuánto tarda el trabajo en llegar y dónde espera. Mide el sistema, no a las
 * personas: no hay rankings ni vistas por persona (CU-036-9).
 *
 * - Período (`?semanas=12`) y etiqueta (`?etiqueta=<id>`) en la URL, en una
 *   fila arriba: filtran todo lo de abajo.
 * - Tarjetas del período, tendencias por semana (cada una con «Ver como
 *   tabla») y estancados.
 * - «Dónde se va el tiempo» y la señal de contratación dicen desde cuándo se
 *   miden: la eficiencia sale de la historia de sesiones de agentes (parte 3),
 *   que todavía no está en el contrato publicado.
 *
 * Usa el proyecto, las etiquetas y los estados del `BoardStore` (los comparte
 * con el tablero) y las métricas del `MetricsStore`.
 */
@Component({
  selector: 'app-metrics',
  imports: [RouterLink, TranslatePipe, Icon, WeekChart, Sparkline],
  templateUrl: './metrics.html',
  styleUrl: './metrics.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Metrics {
  protected readonly board = inject(BoardStore);
  protected readonly store = inject(MetricsStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);

  /** Path `:projectId`. */
  readonly projectId = input.required<string>();
  /** `?semanas=4|12|26|52`. */
  readonly semanas = input<string>();
  /** `?etiqueta=<id>`: solo issues con esa etiqueta (p. ej. un área). */
  readonly etiqueta = input<string>();

  protected readonly presets = PERIOD_PRESETS;
  protected readonly weeks = computed(() => {
    const w = Number(this.semanas());
    return isPeriodWeeks(w) ? w : DEFAULT_PERIOD;
  });
  /**
   * La etiqueta de la URL va tal cual: la valida el servicio (una de otro
   * proyecto es UNKNOWN_LABEL y se ve el error). Así un enlace con etiqueta
   * no pide primero sin filtro mientras cargan las etiquetas.
   */
  protected readonly labelId = computed(() => (this.etiqueta() ?? '').trim());

  protected readonly view = this.store.view;
  protected readonly tables = signal<ReadonlySet<TableKey>>(new Set());
  protected readonly timeMetric = signal<'lead' | 'cycle'>('lead');

  /**
   * Textos que van dentro de los gráficos (leyenda, tooltip, eje). Con
   * `stream`, se actualizan cuando llega el es.json aunque las métricas hayan
   * llegado antes.
   */
  private readonly texts = toSignal(
    this.i18n.stream([
      'metrics.chart.median',
      'metrics.chart.p85',
      'metrics.closed.all',
      'metrics.closed.value',
      'metrics.closed.other',
      'metrics.wip.series',
      'metrics.started.series',
      'metrics.unit.daysShort',
    ]),
    { initialValue: {} },
  );

  protected readonly unitDays = computed(() => ` ${this.t('metrics.unit.daysShort')}`);

  protected readonly timeSeries = computed<ChartSeries[]>(() => {
    const v = this.view();
    if (!v) return [];
    const points = this.timeMetric() === 'lead' ? v.leadSeries : v.cycleSeries;
    return [
      {
        name: this.t('metrics.chart.median'),
        color: 'var(--chart-1)',
        values: points.map((p) => p.median),
        band: points.map((p) => p.p85),
        bandName: this.t('metrics.chart.p85'),
      },
    ];
  });

  protected readonly closedSeries = computed<ChartSeries[]>(() => {
    const v = this.view();
    if (!v) return [];
    if (!v.hasValueLabels)
      return [
        {
          name: this.t('metrics.closed.all'),
          color: 'var(--chart-1)',
          values: column(v.closedSeries, 0),
        },
      ];
    return [
      {
        name: this.t('metrics.closed.value'),
        color: 'var(--chart-1)',
        values: column(v.closedSeries, 0),
      },
      {
        name: this.t('metrics.closed.other'),
        color: 'var(--chart-muted)',
        values: column(v.closedSeries, 1),
      },
    ];
  });

  protected readonly wipSeries = computed<ChartSeries[]>(() => {
    const v = this.view();
    return v
      ? [
          {
            name: this.t('metrics.wip.series'),
            color: 'var(--chart-1)',
            values: v.wipSeries.map((p) => p.median),
          },
        ]
      : [];
  });

  protected readonly startedSeries = computed<ChartSeries[]>(() => {
    const v = this.view();
    return v
      ? [
          {
            name: this.t('metrics.started.series'),
            color: 'var(--chart-1)',
            values: column(v.startedSeries, 0),
          },
        ]
      : [];
  });

  protected readonly labelsOf = (points: readonly (BandPoint | StackPoint)[]) =>
    points.map((p) => p.label);

  protected readonly stale = computed(() => {
    const m = this.store.metrics();
    if (!m) return [];
    const statuses = new Map(this.board.statuses().map((s) => [s.id, s.name]));
    return m.stale.map((s) => ({
      ...s,
      key: issueKey(this.board.projectKey(), s.number),
      status: statuses.get(s.statusId) ?? '',
      since: dayLabel(s.inProgressSince),
      idleDays: daysBetween(s.lastActivityAt || s.inProgressSince, m.to),
    }));
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.board.ensureLoaded(id));
    });
    effect(() => {
      const query = {
        projectId: this.projectId(),
        weeks: this.weeks(),
        labelIds: this.labelId() ? [this.labelId()] : [],
      };
      untracked(() => this.store.load(query));
    });

    const nav = inject(ShellNav);
    effect(() => {
      const { crumbs, project } = boardNav(this.board.project(), this.projectId(), {
        label: 'metrics.title',
        translate: true,
      });
      nav.set(crumbs, project);
    });
  }

  protected setWeeks(weeks: number): void {
    void this.router.navigate([], {
      queryParams: { semanas: weeks === DEFAULT_PERIOD ? null : weeks },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setLabel(id: string): void {
    void this.router.navigate([], {
      queryParams: { etiqueta: id || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected toggleTable(key: TableKey): void {
    this.tables.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected days(v: number | null): string {
    return v === null ? '—' : `${v}`;
  }

  private t(key: string): string {
    return ((this.texts() as Record<string, string>)[key] ?? key) as string;
  }
}

function column(points: readonly StackPoint[], k: number): number[] {
  return points.map((p) => p.values[k] ?? 0);
}
