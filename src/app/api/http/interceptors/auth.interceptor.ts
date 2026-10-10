import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, from, switchMap, throwError } from 'rxjs';

import { AuthService } from '@/app/core/auth/auth.service';
import { API_BASE_URL } from '../../clients/rest/rest.endpoints';
import { SKIP_AUTH } from '../tokens';

/**
 * Agrega `Authorization: Bearer <ID token de Firebase>` a las requests al API.
 * El gateway valida ese token directamente; Firebase lo renueva solo, así que
 * acá no hay lógica de refresh propia.
 *
 * - 401: el token pudo haber sido revocado/rotado → se pide uno NUEVO a Firebase
 *   (`getIdToken(true)`) y se reintenta UNA vez. Si vuelve a dar 401, la sesión
 *   no sirve: logout.
 * - 403: la cuenta no está en la allowlist → pantalla «sin acceso».
 *
 * Sólo toca requests al API propio (nunca manda el token a otros hosts) y no
 * las marcadas con SKIP_AUTH.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH) || !isApiRequest(req.url)) return next(req);

  const auth = inject(AuthService);
  const send = (force: boolean) =>
    defer(() => from(auth.idToken(force))).pipe(switchMap((token) => next(withBearer(req, token))));

  return send(false).pipe(
    catchError((err: unknown) =>
      statusOf(err) === 401
        ? send(true).pipe(
            catchError((retryErr: unknown) => {
              if (statusOf(retryErr) === 401) auth.sessionExpired();
              return throwError(() => retryErr);
            }),
          )
        : throwError(() => err),
    ),
    catchError((err: unknown) => {
      if (statusOf(err) === 403) auth.accessDenied();
      return throwError(() => err);
    }),
  );
};

function isApiRequest(url: string): boolean {
  return url.startsWith(`${API_BASE_URL.replace(/\/+$/, '')}/`);
}

function statusOf(err: unknown): number | null {
  return err instanceof HttpErrorResponse ? err.status : null;
}

function withBearer<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}
