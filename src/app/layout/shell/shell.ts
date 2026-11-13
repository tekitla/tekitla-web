import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { AuthService } from '@/app/core/auth/auth.service';
import { SessionStore } from '@/app/core/auth/session.store';
import { Icon } from '@/app/ui/components/icon/icon';
import { initialsOf } from './initials';
import { ShellNav } from './shell-nav';

/**
 * Layout principal (`vrb-shell`): sidebar, header con migas de pan y el
 * <router-outlet>. Bajo 900px el sidebar se abre con el botón de menú y se
 * cierra al navegar, con Escape o tocando fuera.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, TranslatePipe],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class Shell {
  protected readonly session = inject(SessionStore);
  protected readonly nav = inject(ShellNav);
  private readonly auth = inject(AuthService);

  protected readonly menuOpen = signal(false);
  /** Iniciales para el avatar del pie: del nombre, o del correo. */
  protected readonly initials = computed(() => initialsOf(this.session.user()));

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMenu());
    inject(DestroyRef).onDestroy(() => this.nav.clear());
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected logout(): void {
    void this.auth.logout();
  }
}
