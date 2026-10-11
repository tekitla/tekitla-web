import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { BOARD_STATES, type BoardState, type Issue } from '@/app/api';
import { Icon } from '@/app/ui/components/icon/icon';
import { adjacentState, columnOf, issueKey } from '../../data-access/board.logic';
import { KANBAN_PRIORITY, PRIORITY_LEVEL } from '../priority-badge/priority-badge';

/** Pedido de mover una tarjeta, con el origen (para devolver el foco). */
export interface MoveRequest {
  number: number;
  to: BoardState;
  via: 'menu' | 'keyboard';
}

/**
 * Tarjeta de un issue en el tablero (`vrb-kanban-card`). Toda la tarjeta lleva al detalle (el enlace
 * se estira con un pseudo-elemento) y tiene un botón «Mover» con menú: en
 * pantallas táctiles es LA forma de mover (arrastrar ahí es incómodo), y en
 * desktop es la alternativa accesible al drag & drop. Con el foco en la tarjeta,
 * Shift+← / Shift+→ la mueve a la columna vecina.
 */
@Component({
  selector: 'app-issue-card',
  imports: [RouterLink, CdkMenuTrigger, CdkMenu, CdkMenuItem, Icon, TranslatePipe],
  templateUrl: './issue-card.html',
  styleUrl: './issue-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueCard {
  readonly issue = input.required<Issue>();
  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  readonly pending = input(false);

  readonly move = output<MoveRequest>();

  protected readonly key = computed(() => issueKey(this.projectKey(), this.issue().number));
  protected readonly column = computed(() => columnOf(this.issue()));
  protected readonly level = computed(() => PRIORITY_LEVEL[this.issue().priority]);
  protected readonly kanbanPriority = computed(() => KANBAN_PRIORITY[this.level()]);
  /** Destinos del menú: las otras dos columnas. */
  protected readonly targets = computed(() => BOARD_STATES.filter((s) => s !== this.column()));
  protected readonly link = computed(() => [
    '/proyectos',
    this.projectId(),
    'issues',
    this.issue().number,
  ]);

  protected moveTo(to: BoardState): void {
    this.move.emit({ number: this.issue().number, to, via: 'menu' });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const column = this.column();
    const to = column && adjacentState(column, direction);
    if (to && !this.pending()) this.move.emit({ number: this.issue().number, to, via: 'keyboard' });
  }
}
