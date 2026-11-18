import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue } from '@/app/api';
import { Icon } from '@/app/ui/components/icon/icon';
import type { ActorView } from '../../data-access/actors.logic';
import { issueKey } from '../../data-access/board.logic';
import { ActorAvatar } from '../actor-avatar/actor-avatar';
import { KANBAN_PRIORITY, PRIORITY_LEVEL } from '../priority-badge/priority-badge';

/**
 * Tarjeta de un issue en la vista Plan (039): clave, título, prioridad y
 * quién lo atiende, a la vista. Usa el mismo `vrb-kanban-card` y el mismo
 * avatar que la tarjeta del tablero, sin «Mover» (la vista Plan no cambia
 * estados).
 *
 * Quién (CU-039-4 y CU-039-9): un agente con su nombre y el icono de su
 * herramienta; una persona con su nombre; un responsable sin cuenta
 * (etiqueta `responsable/<nombre>`) con su nombre y «responsable sin
 * cuenta», en otro estilo; si no hay nada, «Sin asignar».
 *
 * Toda la tarjeta abre el issue: en desktop, en el panel lateral de la vista
 * (`opened`); en móvil, la página del detalle.
 */
@Component({
  selector: 'app-plan-card',
  imports: [ActorAvatar, Icon, TranslatePipe],
  templateUrl: './plan-card.html',
  styleUrl: './plan-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanCard {
  readonly issue = input.required<Issue>();
  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  /** Asignado: `null` si no tiene o todavía no se sabe quién es. */
  readonly assignee = input<ActorView | null>(null);
  /** Nombres de los responsables sin cuenta, ya para mostrar. */
  readonly responsibles = input<readonly string[]>([]);
  /** Abre en el panel de la vista (desktop) en vez de ir a la página. */
  readonly openInPanel = input(false);
  /** Es el issue abierto en el panel. */
  readonly current = input(false);

  readonly opened = output<number>();

  private readonly router = inject(Router);

  protected readonly key = computed(() => issueKey(this.projectKey(), this.issue().number));
  protected readonly level = computed(() => PRIORITY_LEVEL[this.issue().priority]);
  protected readonly kanbanPriority = computed(() => KANBAN_PRIORITY[this.level()]);
  private readonly target = computed(() =>
    this.openInPanel()
      ? this.router.createUrlTree(['/proyectos', this.projectId(), 'plan'], {
          queryParams: { issue: this.key() },
          queryParamsHandling: 'merge',
        })
      : this.router.createUrlTree(['/proyectos', this.projectId(), 'issues', this.issue().number]),
  );
  protected readonly href = computed(() => this.router.serializeUrl(this.target()));

  /** Clic común: navega en la app. Con modificador o botón del medio, el navegador. */
  protected onClick(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (this.openInPanel()) this.opened.emit(this.issue().number);
    else void this.router.navigateByUrl(this.target());
  }
}
