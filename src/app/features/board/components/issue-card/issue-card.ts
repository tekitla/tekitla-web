import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue, Label, Status } from '@/app/api';
import { Icon } from '@/app/ui/components/icon/icon';
import { LABEL_TONE, issueKey, statusTone } from '../../data-access/board.logic';
import { KANBAN_PRIORITY, PRIORITY_LEVEL } from '../priority-badge/priority-badge';

/**
 * Pedido de mover una tarjeta. Desde el menú: a otro estado (conserva su
 * rank). Con el teclado: a la columna vecina (`column`) o un lugar arriba o
 * abajo en la suya (`row`); el tablero lo traduce a estado y posición.
 */
export type MoveRequest =
  | { number: number; via: 'menu'; statusId: string }
  | { number: number; via: 'keyboard'; axis: 'column' | 'row'; direction: -1 | 1 };

/**
 * Tarjeta de un issue en el tablero (`vrb-kanban-card`). Toda la tarjeta lleva
 * al detalle (el enlace se estira con un pseudo-elemento) y tiene un botón
 * «Mover» con menú: en pantallas táctiles es LA forma de mover (arrastrar ahí
 * es incómodo), y en desktop es la alternativa accesible al drag & drop. Con
 * el foco en la tarjeta, Shift+← / Shift+→ la pasa a la columna vecina y
 * Shift+↑ / Shift+↓ la sube o baja en la suya. «Descartar…» lleva al detalle
 * con el diálogo del motivo abierto (descartar pide un motivo).
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
  /** Estado actual de la tarjeta (su columna). */
  readonly statusId = input.required<string>();
  /** Todos los estados del proyecto, en orden: los destinos del menú. */
  readonly statuses = input.required<readonly Status[]>();
  readonly labelsById = input.required<ReadonlyMap<string, Label>>();
  readonly pending = input(false);

  readonly move = output<MoveRequest>();

  private readonly router = inject(Router);

  protected readonly tone = statusTone;
  protected readonly labelTone = LABEL_TONE;
  protected readonly key = computed(() => issueKey(this.projectKey(), this.issue().number));
  protected readonly level = computed(() => PRIORITY_LEVEL[this.issue().priority]);
  protected readonly kanbanPriority = computed(() => KANBAN_PRIORITY[this.level()]);
  /** Etiquetas del issue que existen en el proyecto (ordenadas por nombre, como llegan). */
  protected readonly labels = computed(() =>
    this.issue()
      .labelIds.map((id) => this.labelsById().get(id))
      .filter((l): l is Label => !!l),
  );
  /**
   * Destinos del menú: los otros estados, también los ocultos, salvo los de
   * descarte (descartar va con motivo, desde «Descartar…»).
   */
  protected readonly targets = computed(() =>
    this.statuses().filter(
      (s) => s.id !== this.statusId() && s.category !== 'ISSUE_STATE_CANCELED',
    ),
  );
  protected readonly link = computed(() => [
    '/proyectos',
    this.projectId(),
    'issues',
    this.issue().number,
  ]);

  protected discard(): void {
    void this.router.navigate(this.link(), { queryParams: { descartar: 1 } });
  }

  protected moveTo(statusId: string): void {
    this.move.emit({ number: this.issue().number, via: 'menu', statusId });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, ['column' | 'row', -1 | 1]> = {
      ArrowLeft: ['column', -1],
      ArrowRight: ['column', 1],
      ArrowUp: ['row', -1],
      ArrowDown: ['row', 1],
    };
    const key = keys[event.key];
    if (!key) return;
    event.preventDefault();
    if (this.pending()) return;
    const [axis, direction] = key;
    this.move.emit({ number: this.issue().number, via: 'keyboard', axis, direction });
  }
}
