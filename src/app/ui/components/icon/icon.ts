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
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
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
