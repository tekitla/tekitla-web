import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { Priority } from '@/app/api';

type Level = 'low' | 'medium' | 'high' | 'urgent';

/** Flechas: ↓ baja, = media, ↑ alta, ⇈ urgente (viewBox 16×16, trazo). */
const ICON: Record<Level, string> = {
  low: 'M4 6l4 4 4-4',
  medium: 'M4 6h8M4 10h8',
  high: 'M4 10l4-4 4 4',
  urgent: 'M4 8l4-4 4 4M4 12l4-4 4 4',
};

const LEVEL: Record<Priority, Level> = {
  PRIORITY_LOW: 'low',
  PRIORITY_MEDIUM: 'medium',
  PRIORITY_UNSPECIFIED: 'medium', // el backend la guarda como MEDIUM
  PRIORITY_HIGH: 'high',
  PRIORITY_URGENT: 'urgent',
};

/**
 * Prioridad con ícono + texto + color: el color nunca es la única señal
 * (WCAG 1.4.1). `compact` oculta el texto a la vista pero no al lector.
 */
@Component({
  selector: 'app-priority-badge',
  imports: [TranslatePipe],
  template: `
    <span [class]="'priority-badge priority-badge--' + level()">
      <svg class="priority-badge__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path [attr.d]="icon()" />
      </svg>
      <span [class.u-visually-hidden]="compact()">
        <span class="u-visually-hidden">{{ 'issue.priorityLabel' | translate }}: </span>
        {{ 'issue.priority.' + level() | translate }}
      </span>
    </span>
  `,
  styleUrl: './priority-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityBadge {
  readonly priority = input.required<Priority>();
  readonly compact = input(false);

  protected readonly level = computed(() => LEVEL[this.priority()]);
  protected readonly icon = computed(() => ICON[this.level()]);
}
