import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Íconos que el boceto necesita y `ui-icon` todavía no tiene. Si la variante
 * elegida los usa, pasan a `ui/components/icon` en la parte que los necesite.
 */
const PATHS = {
  bot: 'M12 4V2M5 8h14a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1zM9 13h.01M15 13h.01M2 13h2M20 13h2',
  terminal: 'm4 17 6-5-6-5M12 19h8',
  cloud: 'M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.6 12.3 3.5 3.5 0 0 0 6.5 19z',
  branch:
    'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  subtasks: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  calendar:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
  density: 'M3 5h18M3 10h18M3 15h18M3 20h18',
  rows: 'M3 6h18M3 12h18M3 18h18',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  dot: 'M12 12h.01',
} as const;

export type SketchIconName = keyof typeof PATHS;

@Component({
  selector: 'app-sketch-icon',
  template: `<svg class="sketch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path [attr.d]="d()" />
  </svg>`,
  styles: `
    :host {
      display: contents;
    }
    .sketch-icon {
      width: var(--ui-icon-size, 14px);
      height: var(--ui-icon-size, 14px);
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
export class SketchIcon {
  readonly name = input.required<SketchIconName>();
  protected readonly d = computed(() => PATHS[this.name()]);
}
