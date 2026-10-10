import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '@/app/core/auth/auth.service';
import { SessionStore } from '@/app/core/auth/session.store';
import { Button } from '@/app/ui/components/button/button';

/**
 * Layout principal: header + navegación + <router-outlet>. Las páginas de las
 * features se renderizan adentro. Lo que es "marco" de la app vive en layout/,
 * no en las features.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Button, TranslatePipe],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly title = 'Tekitla';
  protected readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);

  protected logout(): void {
    void this.auth.logout();
  }
}
