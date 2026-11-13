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
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  bot: 'M12 4V2M5 8h14a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1zM9 13h.01M15 13h.01M2 13h2M20 13h2',
  terminal: 'm4 17 6-5-6-5M12 19h8',
  code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  cloud: 'M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.6 12.3 3.5 3.5 0 0 0 6.5 19z',
  rows: 'M3 5h18M3 10h18M3 15h18M3 20h18',
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
