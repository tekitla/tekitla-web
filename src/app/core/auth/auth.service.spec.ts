import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService, NO_ACCESS_PATH } from './auth.service';
import { FirebaseAuthGateway, type FirebaseUserInfo } from './firebase';
import { SessionStore } from './session.store';

const user: FirebaseUserInfo = {
  uid: 'u1',
  email: 'victor@example.com',
  displayName: 'Victor',
  photoURL: null,
};

describe('AuthService', () => {
  let firebase: Record<string, ReturnType<typeof vi.fn>>;
  let service: AuthService;
  let session: SessionStore;
  let router: Router;

  beforeEach(() => {
    firebase = {
      isConfigured: vi.fn(() => true),
      currentUser: vi.fn(async () => user),
      onUserChanged: vi.fn(async () => () => undefined),
      signInWithGoogle: vi.fn(async () => user),
      getIdToken: vi.fn(async () => 'tok'),
      signOut: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: FirebaseAuthGateway, useValue: firebase }],
    });
    service = TestBed.inject(AuthService);
    session = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('ready restaura el usuario una sola vez y lo publica en la sesión', async () => {
    expect(session.status()).toBe('unknown');

    expect(await service.ready()).toBe(true);
    expect(await service.ready()).toBe(true);

    expect(firebase['currentUser']).toHaveBeenCalledTimes(1);
    expect(session.user()?.email).toBe('victor@example.com');
    expect(session.isAuthenticated()).toBe(true);
  });

  it('ready sin usuario deja la sesión anónima', async () => {
    firebase['currentUser'].mockResolvedValue(null);
    expect(await service.ready()).toBe(false);
    expect(session.status()).toBe('anonymous');
  });

  it('ready no rompe si Firebase falla al iniciar', async () => {
    firebase['currentUser'].mockRejectedValue(new Error('config inválida'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await service.ready()).toBe(false);
  });

  it('ready refleja un login posterior a la carga (sin volver a restaurar)', async () => {
    firebase['currentUser'].mockResolvedValue(null);
    expect(await service.ready()).toBe(false);

    expect(await service.loginWithGoogle()).toBe(true);

    expect(await service.ready()).toBe(true);
    expect(firebase['currentUser']).toHaveBeenCalledTimes(1);
  });

  it('ready refleja un logout posterior a la carga', async () => {
    expect(await service.ready()).toBe(true);

    await service.logout();

    expect(await service.ready()).toBe(false);
  });

  it('loginWithGoogle cancelado no cambia la sesión', async () => {
    firebase['signInWithGoogle'].mockResolvedValue(null);
    expect(await service.loginWithGoogle()).toBe(false);
    expect(session.isAuthenticated()).toBe(false);
  });

  it('logout cierra Firebase, limpia la sesión y va al login', async () => {
    await service.ready();
    await service.logout();

    expect(firebase['signOut']).toHaveBeenCalled();
    expect(session.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('accessDenied navega a la pantalla sin acceso', () => {
    service.accessDenied();
    expect(router.navigateByUrl).toHaveBeenCalledWith(NO_ACCESS_PATH);
  });
});
