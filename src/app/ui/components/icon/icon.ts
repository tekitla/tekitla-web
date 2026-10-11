import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Trazos de 24×24 (los mismos del diseño). */
const PATHS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  projects: 'm12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  board: 'M6 5v11M12 5v6M18 5v14',
  move: 'M4 9h13M14 5l4 4-4 4M20 15H7M10 11l-4 4 4 4',
  filter: 'M3 4h18l-7 8v6l-4 2v-8L3 4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
} as const;

export type IconName = keyof typeof PATHS;

/**
 * Ícono de trazo, decorativo: siempre `aria-hidden`. El texto accesible lo
 * pone quien lo usa (botón con `aria-label` o texto al lado).
 */
@Component({
  selector: 'ui-icon',
  template: `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path [attr.d]="d()" />
  </svg>`,
  styles: `
    :host {
      display: contents;
    }
    .ui-icon {
      width: var(--ui-icon-size, 16px);
      height: var(--ui-icon-size, 16px);
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly d = computed(() => PATHS[this.name()]);
}
