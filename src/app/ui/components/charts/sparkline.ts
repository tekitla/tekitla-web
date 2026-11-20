import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { segments } from './week-chart';

const W = 96;
const H = 24;

/**
 * Tendencia chica de una tarjeta (skill dataviz: stat tile). Las semanas en
 * el gris de contexto y la última en el azul; un `null` corta la línea.
 * Decorativa: el número de la tarjeta y la tabla de la página dicen lo mismo.
 */
@Component({
  selector: 'ui-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="sparkline"
      aria-hidden="true"
      [attr.viewBox]="'0 0 ' + w + ' ' + h"
      [attr.width]="w"
      [attr.height]="h"
    >
      @for (p of paths(); track $index) {
        <path class="sparkline__line" [attr.d]="p" />
      }
      @if (last(); as l) {
        <circle class="sparkline__dot" [attr.cx]="l.x" [attr.cy]="l.y" r="3" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    .sparkline__line {
      fill: none;
      stroke: var(--chart-muted);
      stroke-width: 1.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .sparkline__dot {
      fill: var(--chart-1);
      stroke: var(--vrb-surface);
      stroke-width: 1.5;
    }
  `,
})
export class Sparkline {
  readonly values = input.required<readonly (number | null)[]>();

  protected readonly w = W;
  protected readonly h = H;

  private readonly scale = computed(() => {
    const vals = this.values().filter((v): v is number => v !== null);
    const max = Math.max(1, ...vals);
    const n = Math.max(1, this.values().length - 1);
    return {
      x: (i: number) => 2 + (i / n) * (W - 4),
      y: (v: number) => H - 3 - (v / max) * (H - 6),
    };
  });

  protected readonly paths = computed(() => {
    const { x, y } = this.scale();
    return segments(this.values())
      .filter((s) => s.length > 1)
      .map((s) => s.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(''));
  });

  protected readonly last = computed(() => {
    const vals = this.values();
    const i = vals.length - 1;
    const v = vals[i];
    if (v === null || v === undefined) return null;
    const { x, y } = this.scale();
    return { x: x(i), y: y(v) };
  });
}
