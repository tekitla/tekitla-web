import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '@/app/core/auth/auth.service';
import { Button } from '@/app/ui/components/button/button';

/** Login con Google (Firebase Auth). Sin formulario: Google es el único proveedor. */
@Component({
  selector: 'app-login',
  imports: [Button, TranslatePipe],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly configured = this.auth.isConfigured();
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected async signIn(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const loggedIn = await this.auth.loginWithGoogle();
      if (!loggedIn) return;
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (err) {
      console.error('[AUTH] login con Google falló', err);
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

/** Sólo rutas internas: evita usar el login como redirector abierto. */
function safeReturnUrl(url: string | null): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}
