import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { FirebaseAuthGateway, type FirebaseUserInfo } from './firebase';
import { type AuthUser, SessionStore } from './session.store';

/** Ruta pública a la que se manda a quien no está en la allowlist del gateway. */
export const NO_ACCESS_PATH = '/sin-acceso';

/**
 * Orquesta la sesión: login con Google (Firebase), ID token para el API,
 * logout y las reacciones a 401/403 del gateway. Es lo único que escribe en
 * SessionStore.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = inject(SessionStore);
  private readonly firebase = inject(FirebaseAuthGateway);
  private readonly router = inject(Router);

  private initPromise: Promise<void> | null = null;

  /** `false` si faltan los valores de la config web de Firebase en los environments. */
  isConfigured(): boolean {
    return this.firebase.isConfigured();
  }

  /**
   * Resuelve cuando Firebase restauró la sesión (eso, una sola vez por carga) y
   * devuelve si hay usuario AHORA: después de un login o logout el resultado
   * cambia. Además deja escuchando cambios posteriores (p. ej. sesión revocada
   * en otra pestaña).
   */
  async ready(): Promise<boolean> {
    this.initPromise ??= (async () => {
      try {
        const user = await this.firebase.currentUser();
        this.session.setUser(user && toAuthUser(user));
        void this.firebase
          .onUserChanged((u) => this.session.setUser(u && toAuthUser(u)))
          .catch(() => undefined);
      } catch (err) {
        console.error('[AUTH] no se pudo inicializar Firebase', err);
        this.session.clear();
      }
    })();
    await this.initPromise;
    return this.session.isAuthenticated();
  }

  /** `true` si quedó logueado; `false` si canceló o se fue por redirect. */
  async loginWithGoogle(): Promise<boolean> {
    const user = await this.firebase.signInWithGoogle();
    if (!user) return false;
    this.session.setUser(toAuthUser(user));
    return true;
  }

  /** ID token para `Authorization: Bearer`. Firebase lo renueva solo; `force` lo pide nuevo. */
  idToken(force = false): Promise<string | null> {
    return this.firebase.getIdToken(force);
  }

  async logout(): Promise<void> {
    await this.firebase.signOut().catch(() => undefined);
    this.session.clear();
    await this.router.navigate(['/login']);
  }

  /** El gateway rechazó el token aun renovado (401): la sesión no sirve más. */
  sessionExpired(): void {
    void this.logout();
  }

  /** El gateway respondió 403: la cuenta no está en la allowlist. */
  accessDenied(): void {
    if (this.router.url.startsWith(NO_ACCESS_PATH)) return;
    void this.router.navigateByUrl(NO_ACCESS_PATH);
  }
}

function toAuthUser(user: FirebaseUserInfo): AuthUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}
