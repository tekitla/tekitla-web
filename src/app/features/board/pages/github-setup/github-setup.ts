import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { parseGithubSetup } from '../../data-access/repos.logic';

/**
 * Setup URL de la GitHub App (`/repositorios/github`, issue 016). GitHub
 * vuelve acá después de instalar la App, con `installation_id` y el proyecto
 * en `state`. Lleva a Ajustes › Repositorios de ese proyecto, donde se elige
 * el alcance. Ningún valor se confía: el servicio valida la instalación y
 * el proyecto.
 */
@Component({
  selector: 'app-github-setup',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (invalid()) {
      <div class="vrb-stack">
        <p class="vrb-alert vrb-alert--warning" role="alert">
          {{ 'repos.setup.invalid' | translate }}
        </p>
        <a class="vrb-button vrb-button--outline" routerLink="/proyectos">{{
          'repos.setup.back' | translate
        }}</a>
      </div>
    } @else {
      <span
        class="vrb-skeleton"
        role="status"
        [attr.aria-label]="'repos.setup.loading' | translate"
      ></span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GithubSetup {
  protected readonly invalid = signal(false);

  constructor() {
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    const setup = parseGithubSetup(route.snapshot.queryParamMap);
    if (!setup) {
      this.invalid.set(true);
      return;
    }
    void router.navigate(['/proyectos', setup.projectId, 'ajustes', 'repositorios'], {
      queryParams: { installation_id: setup.installationId },
      replaceUrl: true,
    });
  }
}
