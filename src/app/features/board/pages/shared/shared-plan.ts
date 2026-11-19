import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue } from '@/app/api';
import { PlanView } from '../../components/plan-view/plan-view';
import { PlanPrefixStore } from '../../data-access/plan-prefix.store';
import { waitingNote } from '../../data-access/plan.logic';
import { SharedStore } from '../../data-access/shared.store';
import { sharedLink } from '../../data-access/shared.logic';

/**
 * Vista Plan de un enlace de solo lectura (issue 009, CU-009-6): el mismo
 * cuerpo que la vista Plan del proyecto (`PlanView`), sin panel lateral ni
 * accesos a otras vistas. Con alcance plan las tarjetas no llevan a ningún
 * lado y «Qué espera» lo manda el servicio (sin descripciones); con alcance
 * panel llevan al detalle del enlace.
 */
@Component({
  selector: 'app-shared-plan',
  imports: [PlanView, TranslatePipe],
  templateUrl: './shared-plan.html',
  styleUrl: '../plan/plan.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedPlan {
  protected readonly store = inject(SharedStore);
  protected readonly prefixStore = inject(PlanPrefixStore);
  private readonly router = inject(Router);

  /** `?categoria=escuela`: solo ese bloque (como la vista Plan del proyecto). */
  readonly categoria = input<string>();

  protected readonly category = computed(() => (this.categoria() ?? '').trim().toLowerCase());

  protected readonly assigneeOf = (issue: Issue) => this.store.assignee(issue.assigneeActorId);
  protected readonly noteOf = (issue: Issue) =>
    this.store.isPanel() ? waitingNote(issue.description) : this.store.waitingNote(issue.number);
  protected readonly cardLink = (issue: Issue) =>
    this.store.isPanel() ? sharedLink(this.store.token(), 'issues', issue.number) : null;

  constructor() {
    // El prefijo se recuerda por proyecto, sin guardar el token.
    effect(() => {
      const key = this.store.projectKey();
      if (key) this.prefixStore.use(`compartido-${key}`);
    });
  }

  protected setCategory(value: string): void {
    void this.router.navigate([], {
      queryParams: { categoria: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setPrefix(value: string): void {
    this.prefixStore.set(value);
    if (this.categoria()) this.setCategory('');
  }
}
