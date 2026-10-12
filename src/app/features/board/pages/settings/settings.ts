import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';

/**
 * Ajustes del proyecto (`/proyectos/:projectId/ajustes`): pestañas Estados y
 * Etiquetas (rutas hijas). Usa los mismos stores que el tablero: lo que se
 * cambia acá se ve allá sin recargar.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button, TranslatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly store = inject(BoardStore);

  readonly projectId = input.required<string>();

  protected readonly tabs = [
    { path: 'estados', label: 'settings.tabs.statuses' },
    { path: 'etiquetas', label: 'settings.tabs.labels' },
  ] as const;

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.store.ensureLoaded(id));
    });

    const nav = inject(ShellNav);
    effect(() => {
      const { crumbs, project } = boardNav(this.store.project(), this.projectId(), {
        label: 'settings.title',
        translate: true,
      });
      nav.set(crumbs, project);
    });
  }
}
