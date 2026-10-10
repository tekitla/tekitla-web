import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@/app/core/auth/auth.service';
import { joinApi } from '../../clients/rest/rest.endpoints';
import { SKIP_AUTH } from '../tokens';
import { authInterceptor } from './auth.interceptor';

const URL = joinApi('/v1/projects');

/** Deja correr las promesas pendientes (el token sale de una Promise). */
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: {
    idToken: ReturnType<typeof vi.fn>;
    sessionExpired: ReturnType<typeof vi.fn>;
    accessDenied: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    auth = {
      idToken: vi.fn(async (force?: boolean) => (force ? 'token-nuevo' : 'token-1')),
      sessionExpired: vi.fn(),
      accessDenied: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('agrega el ID token de Firebase como Bearer', async () => {
    http.get(URL).subscribe();
    await flushMicrotasks();

    const req = httpMock.expectOne(URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(auth.idToken).toHaveBeenCalledWith(false);
    req.flush({});
  });

  it('sin usuario manda la request sin Authorization', async () => {
    auth.idToken.mockResolvedValue(null);

    http.get(URL).subscribe({ error: () => undefined });
    await flushMicrotasks();

    const req = httpMock.expectOne(URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('no toca las requests marcadas con SKIP_AUTH', () => {
    http.get(URL, { context: new HttpContext().set(SKIP_AUTH, true) }).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(auth.idToken).not.toHaveBeenCalled();
    req.flush({});
  });

  it('nunca manda el token a otros hosts', () => {
    http.get('https://otro-host.test/v1/projects').subscribe();

    const req = httpMock.expectOne('https://otro-host.test/v1/projects');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('ante un 401 pide un token nuevo y reintenta una vez', async () => {
    let body: unknown;
    http.get(URL).subscribe((res) => (body = res));
    await flushMicrotasks();

    httpMock.expectOne(URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flushMicrotasks();

    const retry = httpMock.expectOne(URL);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer token-nuevo');
    expect(auth.idToken).toHaveBeenLastCalledWith(true);
    retry.flush({ ok: true });

    expect(body).toEqual({ ok: true });
    expect(auth.sessionExpired).not.toHaveBeenCalled();
  });

  it('si el reintento vuelve a dar 401, cierra la sesión', async () => {
    let error: unknown;
    http.get(URL).subscribe({ error: (e: unknown) => (error = e) });
    await flushMicrotasks();

    httpMock.expectOne(URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await flushMicrotasks();
    httpMock.expectOne(URL).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.sessionExpired).toHaveBeenCalledTimes(1);
    expect(error).toBeDefined();
  });

  it('un 403 (fuera de la allowlist) lleva a «sin acceso» y propaga el error', async () => {
    let error: unknown;
    http.get(URL).subscribe({ error: (e: unknown) => (error = e) });
    await flushMicrotasks();

    httpMock
      .expectOne(URL)
      .flush({ code: 7, message: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(auth.accessDenied).toHaveBeenCalledTimes(1);
    expect(error).toBeDefined();
  });

  it('otros errores pasan sin efectos de sesión', async () => {
    http.get(URL).subscribe({ error: () => undefined });
    await flushMicrotasks();

    httpMock.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });

    expect(auth.sessionExpired).not.toHaveBeenCalled();
    expect(auth.accessDenied).not.toHaveBeenCalled();
    expect(auth.idToken).toHaveBeenCalledTimes(1);
  });
});
