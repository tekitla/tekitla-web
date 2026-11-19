import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { SharedStore } from '../../data-access/shared.store';
import { sharedLink } from '../../data-access/shared.logic';

/**
 * Marco de la vista de un enlace de solo lectura (issue 009,
 * `compartido/:token`): sin el shell ni la sesión de la app. Muestra el
 * proyecto, «Solo lectura» y, con alcance panel, la navegación entre tablero
 * y Plan. Un enlace que no existe, venció o se revocó muestra lo mismo en los
 * tres casos (el servicio tampoco lo distingue).
 *
 * La página no se indexa (`noindex`, también como cabecera en firebase.json).
 */
@Component({
  selector: 'app-shared-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './shared-shell.html',
  styleUrl: './shared-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedShell {
  protected readonly store = inject(SharedStore);

  /** Path `:token`. */
  readonly token = input.required<string>();

  protected readonly link = sharedLink;

  constructor() {
    effect(() => this.store.load(this.token()));
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    inject(DestroyRef).onDestroy(() => {
      meta.removeTag('name="robots"');
      meta.removeTag('name="referrer"');
    });
  }
}
