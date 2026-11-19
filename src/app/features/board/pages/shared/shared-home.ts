import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SharedStore } from '../../data-access/shared.store';
import { SharedBoard } from './shared-board';
import { SharedPlan } from './shared-plan';

/**
 * Entrada de un enlace (`compartido/:token`): con alcance panel, el tablero;
 * con alcance plan, la vista Plan (el tablero no se ofrece, CU-009-6).
 */
@Component({
  selector: 'app-shared-home',
  imports: [SharedBoard, SharedPlan],
  template: `
    @if (store.isPanel()) {
      <app-shared-board />
    } @else {
      <app-shared-plan />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedHome {
  protected readonly store = inject(SharedStore);
}
