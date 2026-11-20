import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

/** Una serie del gráfico. `color`: un token (`var(--chart-1)`), nunca un hex. */
export interface ChartSeries {
  name: string;
  color: string;
  /** Un valor por semana; `null` = sin dato (hueco en la línea, no cero). */
  values: readonly (number | null)[];
  /** Solo en líneas: borde superior de la banda (p. ej. el p85). */
  band?: readonly (number | null)[];
  /** Nombre de la banda en el tooltip y la leyenda. */
  bandName?: string;
}

/** Geometría del gráfico (márgenes en px). */
const M = { top: 8, right: 8, bottom: 22, left: 36 };
const HEIGHT = 180;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;
const LABEL_MIN = 52;

/** Escala «linda» del eje y: 0 a un máximo redondo, con 3 o 4 marcas. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Tramos continuos de una serie (se corta en cada `null`). */
export function segments(values: readonly (number | null)[]): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) out.push(cur);
  return out;
}

interface Tip {
  index: number;
  x: number;
}

/**
 * Gráfico por semana, de líneas (con banda opcional) o de columnas apiladas
 * (skill dataviz): líneas de 2px, columnas de hasta 24px con la punta
 * redondeada y 2px de superficie entre segmentos, grilla de 1px recesiva, un
 * solo eje. Al pasar el mouse: en líneas, una mira vertical; en columnas,
 * cada columna es el blanco. Un tooltip con todas las series de esa semana.
 * La tabla equivalente la pone la página («Ver como tabla»).
 */
@Component({
  selector: 'ui-week-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'week-chart' },
  template: `
    @if (showLegend()) {
      <ul class="week-chart__legend">
        @for (s of series(); track s.name) {
          <li class="week-chart__key">
            <span
              class="week-chart__swatch"
              [class.week-chart__swatch--line]="kind() === 'line'"
              [style.background]="s.color"
            ></span>
            {{ s.name }}
          </li>
          @if (kind() === 'line' && s.band && s.bandName) {
            <li class="week-chart__key">
              <span class="week-chart__swatch week-chart__swatch--band"></span>{{ s.bandName }}
            </li>
          }
        }
      </ul>
    }
    <div class="week-chart__plot">
      <svg
        class="week-chart__svg"
        role="img"
        [attr.aria-label]="ariaLabel()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height"
        [attr.width]="width()"
        [attr.height]="height"
        (pointermove)="onMove($event)"
        (pointerleave)="tip.set(null)"
      >
        @for (t of ticks(); track t) {
          <line
            class="week-chart__grid"
            [class.week-chart__grid--base]="t === 0"
            [attr.x1]="m.left"
            [attr.x2]="width() - m.right"
            [attr.y1]="y(t)"
            [attr.y2]="y(t)"
          />
          <text class="week-chart__tick" [attr.x]="m.left - 6" [attr.y]="y(t) + 4">
            {{ format(t) }}
          </text>
        }
        @for (l of xLabels(); track l.i) {
          <text class="week-chart__label" [attr.x]="x(l.i)" [attr.y]="height - 6">
            {{ l.text }}
          </text>
        }

        @if (kind() === 'line') {
          @for (s of series(); track s.name) {
            @if (s.band) {
              @for (p of bandPaths(s); track $index) {
                <path class="week-chart__band" [attr.d]="p" />
              }
            }
            @for (p of linePaths(s); track $index) {
              <path class="week-chart__line" [attr.d]="p" [attr.stroke]="s.color" />
            }
            @for (d of dots(s); track d.i) {
              <circle
                class="week-chart__dot"
                [attr.cx]="x(d.i)"
                [attr.cy]="y(d.v)"
                r="4"
                [attr.fill]="s.color"
              />
            }
          }
          @if (tip(); as t) {
            <line
              class="week-chart__crosshair"
              [attr.x1]="x(t.index)"
              [attr.x2]="x(t.index)"
              [attr.y1]="m.top"
              [attr.y2]="height - m.bottom"
            />
          }
        } @else {
          @for (c of columns(); track c.i) {
            @for (r of c.rects; track $index) {
              <path class="week-chart__bar" [attr.d]="r.d" [attr.fill]="r.color" />
            }
          }
        }
      </svg>
      @if (tip(); as t) {
        <div
          class="week-chart__tip"
          role="status"
          [style.left.px]="t.x"
          [class.week-chart__tip--left]="t.x > width() / 2"
        >
          <strong class="week-chart__tip-title">{{ labels()[t.index] }}</strong>
          @for (s of series(); track s.name) {
            <span class="week-chart__tip-row">
              <span class="week-chart__tip-key" [style.background]="s.color"></span>
              <strong>{{ valueText(s.values[t.index]) }}</strong
              >&nbsp;{{ s.name }}
            </span>
            @if (s.band && s.bandName) {
              <span class="week-chart__tip-row">
                <span class="week-chart__tip-key week-chart__tip-key--band"></span>
                <strong>{{ valueText(s.band[t.index]) }}</strong
                >&nbsp;{{ s.bandName }}
              </span>
            }
          }
        </div>
      }
    </div>
  `,
  styleUrl: './week-chart.scss',
})
export class WeekChart {
  readonly kind = input<'line' | 'columns'>('line');
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  /** Sufijo de los valores en el eje y el tooltip (p. ej. « d»). */
  readonly unit = input('');
  /** Texto del tooltip para «sin dato». */
  readonly emptyText = input('—');
  readonly ariaLabel = input.required<string>();

  protected readonly m = M;
  protected readonly height = HEIGHT;
  protected readonly width = signal(320);
  protected readonly tip = signal<Tip | null>(null);

  protected readonly showLegend = computed(
    () => this.series().length > 1 || this.series().some((s) => s.band && s.bandName),
  );

  private readonly maxValue = computed(() => {
    let max = 0;
    const n = this.labels().length;
    for (let i = 0; i < n; i++) {
      if (this.kind() === 'columns') {
        max = Math.max(
          max,
          this.series().reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
        );
      } else {
        for (const s of this.series()) max = Math.max(max, s.values[i] ?? 0, s.band?.[i] ?? 0);
      }
    }
    return max;
  });

  protected readonly ticks = computed(() => niceTicks(this.maxValue()));
  private readonly top = computed(() => this.ticks()[this.ticks().length - 1] || 1);

  private readonly slot = computed(
    () => (this.width() - M.left - M.right) / Math.max(1, this.labels().length),
  );

  protected readonly xLabels = computed(() => {
    const n = this.labels().length;
    const every = Math.max(1, Math.ceil(LABEL_MIN / this.slot()));
    // Siempre la última (la semana en curso); hacia atrás de a `every`.
    const out: { i: number; text: string }[] = [];
    for (let i = n - 1; i >= 0; i -= every) out.unshift({ i, text: this.labels()[i] });
    return out;
  });

  protected readonly columns = computed(() => {
    const bw = Math.min(BAR_MAX, this.slot() * 0.6);
    const base = this.y(0);
    return this.labels().map((_, i) => {
      const cx = this.x(i);
      let acc = 0;
      const parts = this.series()
        .map((s) => ({ v: s.values[i] ?? 0, color: s.color }))
        .filter((p) => p.v > 0);
      const rects = parts.map((p, k) => {
        const y0 = this.y(acc);
        acc += p.v;
        const y1 = this.y(acc);
        // 2px de superficie entre segmentos; la punta (último) redondeada.
        const bottom = k === 0 ? base : y0 - GAP / 2;
        const topY = k === parts.length - 1 ? y1 : y1 + GAP / 2;
        return {
          d: barPath(cx - bw / 2, topY, bw, bottom - topY, k === parts.length - 1),
          color: p.color,
        };
      });
      return { i, rects };
    });
  });

  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const plot = el.querySelector('.week-chart__plot') ?? el;
      const measure = () => this.width.set(Math.max(240, Math.floor(plot.clientWidth)));
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(measure);
      ro.observe(plot);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  protected x(i: number): number {
    return M.left + this.slot() * (i + 0.5);
  }

  protected y(v: number): number {
    return HEIGHT - M.bottom - (v / this.top()) * (HEIGHT - M.top - M.bottom);
  }

  protected format(v: number): string {
    return `${Number.isInteger(v) ? v : v.toFixed(1)}${this.unit()}`;
  }

  protected valueText(v: number | null | undefined): string {
    return v === null || v === undefined ? this.emptyText() : this.format(v);
  }

  protected linePaths(s: ChartSeries): string[] {
    return segments(s.values)
      .filter((seg) => seg.length > 1)
      .map((seg) => seg.map((p, k) => `${k ? 'L' : 'M'}${this.x(p.i)},${this.y(p.v)}`).join(''));
  }

  /** Puntos sueltos (una semana entre huecos) y el último: con marcador. */
  protected dots(s: ChartSeries): { i: number; v: number }[] {
    const segs = segments(s.values);
    const out = segs.filter((seg) => seg.length === 1).map((seg) => seg[0]);
    const last = segs[segs.length - 1];
    if (last && last.length > 1) out.push(last[last.length - 1]);
    return out;
  }

  protected bandPaths(s: ChartSeries): string[] {
    const band = s.band ?? [];
    const both = s.values.map((v, i) =>
      v === null || band[i] === null || band[i] === undefined ? null : v,
    );
    return segments(both)
      .filter((seg) => seg.length > 1)
      .map((seg) => {
        const upper = seg.map(
          (p, k) => `${k ? 'L' : 'M'}${this.x(p.i)},${this.y(band[p.i] as number)}`,
        );
        const lower = [...seg].reverse().map((p) => `L${this.x(p.i)},${this.y(p.v)}`);
        return `${upper.join('')}${lower.join('')}Z`;
      });
  }

  protected onMove(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const n = this.labels().length;
    if (!n) return;
    const index = Math.min(n - 1, Math.max(0, Math.floor((px - M.left) / this.slot())));
    this.tip.set({ index, x: this.x(index) });
  }
}

/** Rectángulo con las esquinas de arriba redondeadas (si `round`). */
function barPath(x: number, y: number, w: number, h: number, round: boolean): string {
  if (h <= 0) return '';
  const r = round ? Math.min(RADIUS, w / 2, h) : 0;
  return (
    `M${x},${y + h}V${y + r}` +
    (r ? `Q${x},${y} ${x + r},${y}` : '') +
    `H${x + w - r}` +
    (r ? `Q${x + w},${y} ${x + w},${y + r}` : '') +
    `V${y + h}Z`
  );
}
