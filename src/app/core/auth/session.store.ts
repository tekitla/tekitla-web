import { Injectable, computed, signal } from '@angular/core';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/** `unknown` hasta que Firebase termina de restaurar la sesión persistida. */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Estado de la sesión, con signals. La sesión real la persiste y renueva
 * Firebase (ver `FirebaseAuthGateway`); este store sólo refleja quién está
 * logueado para la UI y el guard. No guarda tokens ni toca localStorage, y no
 * hace HTTP: lo escribe únicamente `AuthService`.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _user = signal<AuthUser | null>(null);
  private readonly _status = signal<SessionStatus>('unknown');

  readonly user = this._user.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  setUser(user: AuthUser | null): void {
    this._user.set(user);
    this._status.set(user ? 'authenticated' : 'anonymous');
  }

  clear(): void {
    this.setUser(null);
  }
}
