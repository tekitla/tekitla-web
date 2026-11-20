import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Una parte del total. `color`: un token (`var(--chart-1)`), nunca un hex. */
export interface BarPart {
  name: string;
  color: string;
  /** Valor absoluto (p. ej. horas); las partes en 0 no se dibujan. */
  value: number;
  /** Texto del valor para la leyenda y el título (p. ej. «3 h»). */
  valueText: string;
}

/** Ancho mínimo (en %) para imprimir el porcentaje dentro del bloque. */
const LABEL_MIN_PCT = 9;

/**
 * Barra segmentada alta (skill dataviz): un total partido en hasta 6 partes,
 * cada una su bloque con 4px de radio y 2px de superficie entre bloques, el
 * porcentaje impreso si entra y una leyenda con nombre y valor (la identidad
 * nunca va solo en el color). Sin eje ni línea base.
 */
@Component({
  selector: 'ui-segmented-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="segbar" role="img" [attr.aria-label]="ariaLabel()">
      @for (p of shown(); track p.name) {
        <span
          class="segbar__part"
          [style.flex-grow]="p.value"
          [style.background]="p.color"
          [title]="p.name + ': ' + p.valueText + ' (' + p.pct + ' %)'"
        >
          @if (p.pct >= labelMin) {
            <span class="segbar__pct" [class.segbar__pct--dark]="p.darkText">{{ p.pct }} %</span>
          }
        </span>
      }
    </div>
    <ul class="segbar__legend">
      @for (p of withPct(); track p.name) {
        <li class="segbar__key">
          <span class="segbar__swatch" [style.background]="p.color"></span>
          {{ p.name }} · <strong>{{ p.valueText }}</strong>
          <span class="segbar__muted">({{ p.pct }} %)</span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .segbar {
      display: flex;
      gap: 2px;
      height: 28px;
      overflow: hidden;
      border-radius: 4px;
      background: var(--vrb-fill);
    }
    .segbar__part {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      border-radius: 4px;
    }
    .segbar__pct {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      font-variant-numeric: tabular-nums;

      &--dark {
        color: #0b0b0b;
      }
    }
    .segbar__legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-4);
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
      font-size: 13px;
    }
    .segbar__key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .segbar__swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }
    .segbar__muted {
      color: var(--vrb-muted-fg);
    }
  `,
})
export class SegmentedBar {
  readonly parts = input.required<readonly BarPart[]>();
  readonly ariaLabel = input.required<string>();

  protected readonly labelMin = LABEL_MIN_PCT;

  protected readonly withPct = computed(() => {
    const total = this.parts().reduce((sum, p) => sum + p.value, 0);
    return this.parts().map((p) => ({
      ...p,
      pct: total ? Math.round((p.value / total) * 100) : 0,
      // En el amarillo (slot 4) el texto va oscuro (skill dataviz).
      darkText: p.color.includes('--chart-4'),
    }));
  });

  protected readonly shown = computed(() => this.withPct().filter((p) => p.value > 0));
}
