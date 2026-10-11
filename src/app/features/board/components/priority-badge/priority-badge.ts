import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { Priority } from '@/app/api';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

export const PRIORITY_LEVEL: Record<Priority, PriorityLevel> = {
  PRIORITY_LOW: 'low',
  PRIORITY_MEDIUM: 'medium',
  PRIORITY_UNSPECIFIED: 'medium', // el backend la guarda como MEDIUM
  PRIORITY_HIGH: 'high',
  PRIORITY_URGENT: 'urgent',
};

/** Valor de `data-priority` que entiende `.vrb-kanban-card`. */
export const KANBAN_PRIORITY: Record<PriorityLevel, string> = {
  low: 'baja',
  medium: 'media',
  high: 'alta',
  urgent: 'urgente',
};

const TONE: Record<PriorityLevel, string> = {
  low: 'vrb-badge--neutral',
  medium: 'vrb-badge--warning',
  high: 'vrb-badge--danger',
  urgent: 'vrb-badge--danger',
};

/** Prioridad como `vrb-badge`: color + texto (el color nunca es la única señal, WCAG 1.4.1). */
@Component({
  selector: 'app-priority-badge',
  imports: [TranslatePipe],
  template: `
    <span [class]="'vrb-badge ' + tone()">
      <span class="u-visually-hidden">{{ 'issue.priorityLabel' | translate }}: </span>
      {{ 'issue.priority.' + level() | translate }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityBadge {
  readonly priority = input.required<Priority>();

  protected readonly level = computed(() => PRIORITY_LEVEL[this.priority()]);
  protected readonly tone = computed(() => TONE[this.level()]);
}
