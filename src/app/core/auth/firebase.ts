import { Injectable } from '@angular/core';
import type { Auth, User } from 'firebase/auth';

import { environment } from '@/environments/environment';

/** Lo que la app necesita saber del usuario de Firebase. */
export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Errores de Firebase que significan "el usuario cerró/canceló": no son fallas. */
const CANCELLED_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);
/** El navegador no deja abrir el popup (bloqueador, webview, PWA): se cae a redirect. */
const POPUP_UNAVAILABLE_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-environment',
]);

/**
 * Envoltorio fino del SDK de Firebase Auth. El gateway de Tekitla valida
 * directamente el ID token de Firebase (`Authorization: Bearer <idToken>`):
 * no hay JWT propio ni refresh token de la app. Firebase persiste la sesión
 * (IndexedDB) y renueva el ID token solo; `getIdToken()` siempre devuelve uno
 * vigente.
 *
 * El SDK se importa dinámicamente: queda fuera del bundle inicial. Existe como
 * servicio para poder reemplazarlo en los tests.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseAuthGateway {
  private authPromise: Promise<Auth> | null = null;

  /** `false` mientras los environments tengan los placeholders de la config web. */
  isConfigured(): boolean {
    const { apiKey, appId } = environment.firebase;
    return !isPlaceholder(apiKey) && !isPlaceholder(appId);
  }

  /**
   * Espera a que Firebase restaure la sesión persistida (y complete un login por
   * redirect pendiente) y devuelve el usuario, o `null`.
   */
  async currentUser(): Promise<FirebaseUserInfo | null> {
    const auth = await this.auth();
    await auth.authStateReady();
    return auth.currentUser ? toInfo(auth.currentUser) : null;
  }

  /** Avisa cada cambio de usuario (login, logout, sesión revocada). Devuelve el unsubscribe. */
  async onUserChanged(cb: (user: FirebaseUserInfo | null) => void): Promise<() => void> {
    const auth = await this.auth();
    const { onAuthStateChanged } = await import('firebase/auth');
    return onAuthStateChanged(auth, (user) => cb(user ? toInfo(user) : null));
  }

  /**
   * Login con Google. Popup primero (también en el celular: se abre como pestaña
   * y no depende del storage de terceros, que Safari/Chrome bloquean en el flujo
   * de redirect cuando `authDomain` es otro dominio). Si el popup no está
   * disponible, redirect: la página se va y el resultado lo procesa Firebase al
   * volver (ver `currentUser`).
   *
   * Devuelve el usuario, o `null` si el usuario canceló o se fue por redirect.
   */
  async signInWithGoogle(): Promise<FirebaseUserInfo | null> {
    const auth = await this.auth();
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } =
      await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const credential = await signInWithPopup(auth, provider);
      return toInfo(credential.user);
    } catch (err) {
      const code = errorCode(err);
      if (CANCELLED_CODES.has(code)) return null;
      if (POPUP_UNAVAILABLE_CODES.has(code)) {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw err;
    }
  }

  /** ID token vigente (Firebase lo renueva si está por vencer), o `null` sin sesión. */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    const auth = await this.auth();
    await auth.authStateReady();
    return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
  }

  async signOut(): Promise<void> {
    const auth = await this.auth();
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  }

  private auth(): Promise<Auth> {
    this.authPromise ??= (async () => {
      const { getApps, initializeApp } = await import('firebase/app');
      const { getAuth } = await import('firebase/auth');
      const app = getApps()[0] ?? initializeApp(environment.firebase);
      const auth = getAuth(app);
      auth.languageCode = 'es';
      return auth;
    })();
    return this.authPromise;
  }
}

export function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
}

function isPlaceholder(value: string): boolean {
  return value === '' || value.startsWith('REEMPLAZAR');
}

function toInfo(user: User): FirebaseUserInfo {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}
