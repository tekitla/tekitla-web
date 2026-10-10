import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

const state = (url: string) => ({ url }) as RouterStateSnapshot;
const route = {} as ActivatedRouteSnapshot;

describe('guards de auth', () => {
  let ready: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ready = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { ready } }],
    });
  });

  const runAuth = (url: string) =>
    TestBed.runInInjectionContext(() => authGuard(route, state(url))) as Promise<boolean | UrlTree>;
  const runGuest = () =>
    TestBed.runInInjectionContext(() => guestGuard(route, state('/login'))) as Promise<
      boolean | UrlTree
    >;

  it('authGuard deja pasar si Firebase restauró una sesión', async () => {
    ready.mockResolvedValue(true);
    expect(await runAuth('/proyectos')).toBe(true);
  });

  it('authGuard sin sesión manda al login con returnUrl', async () => {
    ready.mockResolvedValue(false);

    const result = await runAuth('/proyectos/p1');

    const router = TestBed.inject(Router);
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fproyectos%2Fp1');
  });

  it('authGuard espera a que termine la restauración antes de decidir', async () => {
    let resolve!: (v: boolean) => void;
    ready.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));

    const pending = runAuth('/proyectos');
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    resolve(true);
    expect(await pending).toBe(true);
  });

  it('guestGuard saca del login a quien ya tiene sesión', async () => {
    ready.mockResolvedValue(true);
    const result = await runGuest();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('guestGuard deja ver el login sin sesión', async () => {
    ready.mockResolvedValue(false);
    expect(await runGuest()).toBe(true);
  });
});
