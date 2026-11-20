import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CONNECTION_SCOPES, DEFAULT_TOPIC, type Connection, type ScopeSpec } from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { ReposStore } from '../../../data-access/repos.store';
import { githubInstallUrl } from '../../../data-access/repos.logic';

type Scope = ScopeSpec['scope'];

/**
 * Ajustes › Repositorios (issue 016): conectar la organización de GitHub
 * (con la App ya instalada), ver sus repos, sincronizar y desconectar. Solo
 * el dueño (lo verifica el servicio).
 *
 * Conectar es en dos pasos: «Conectar GitHub» lleva a instalar la App con el
 * proyecto en `state`; GitHub vuelve a `/repositorios/github`, que trae acá
 * con `?installation_id=`. Ahí se elige el alcance y se termina la conexión.
 * GitLab espera la decisión sobre el GitLab de Round (plan §3.2).
 */
@Component({
  selector: 'app-repo-settings',
  imports: [Button, DatePipe, TranslatePipe],
  templateUrl: './repo-settings.html',
  styleUrls: ['../settings-table.scss', './repo-settings.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoSettings {
  protected readonly store = inject(ReposStore);
  private readonly router = inject(Router);

  /** Path `:projectId` de la ruta del proyecto. */
  readonly projectId = input.required<string>();
  /** Query `installation_id`: viene de la Setup URL de la GitHub App. */
  readonly installationId = input('', { alias: 'installation_id' });

  protected readonly scopes = CONNECTION_SCOPES;
  protected readonly scope = signal<Scope>('CONNECTION_SCOPE_TOPIC');
  protected readonly topic = signal(DEFAULT_TOPIC);
  protected readonly selected = signal('');
  protected readonly connecting = signal(false);

  protected readonly confirming = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly installHref = computed(() =>
    githubInstallUrl(this.store.installUrl(), this.projectId()),
  );
  protected readonly pendingInstall = computed(() =>
    /^[1-9][0-9]{0,18}$/.test(this.installationId()),
  );

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.store.load(id));
    });
  }

  private scopeSpec(): ScopeSpec {
    switch (this.scope()) {
      case 'CONNECTION_SCOPE_TOPIC':
        return { scope: 'CONNECTION_SCOPE_TOPIC', topic: this.topic().trim().toLowerCase() };
      case 'CONNECTION_SCOPE_SELECTED':
        return {
          scope: 'CONNECTION_SCOPE_SELECTED',
          selected: this.selected()
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        };
      default:
        return { scope: 'CONNECTION_SCOPE_ALL' };
    }
  }

  protected connect(): void {
    if (this.connecting() || !this.pendingInstall()) return;
    this.connecting.set(true);
    this.store.connectGithub(this.installationId(), this.scopeSpec()).subscribe({
      next: () => {
        this.connecting.set(false);
        void this.dropInstallation();
      },
      error: () => this.connecting.set(false),
    });
  }

  /** Saca `installation_id` de la URL (cancelar o después de conectar). */
  protected dropInstallation(): Promise<boolean> {
    return this.router.navigate([], {
      queryParams: { installation_id: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected sync(c: Connection): void {
    if (this.busy()) return;
    this.busy.set(c.id);
    this.store.sync(c.id).subscribe({
      next: () => this.busy.set(null),
      error: () => this.busy.set(null),
    });
  }

  protected disconnect(c: Connection): void {
    if (this.busy()) return;
    this.busy.set(c.id);
    this.store.disconnect(c.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.confirming.set(null);
      },
      error: () => this.busy.set(null),
    });
  }
}
