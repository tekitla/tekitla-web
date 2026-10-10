import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '@/app/core/auth/auth.service';
import { SessionStore } from '@/app/core/auth/session.store';
import { Button } from '@/app/ui/components/button/button';

/**
 * El gateway respondió 403: la cuenta de Google es válida pero no está en la
 * allowlist. Se ofrece cerrar sesión para entrar con otra.
 */
@Component({
  selector: 'app-no-access',
  imports: [Button, TranslatePipe],
  templateUrl: './no-access.html',
  styleUrl: './no-access.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoAccess {
  protected readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);

  protected switchAccount(): void {
    void this.auth.logout();
  }
}
