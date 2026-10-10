import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protege rutas privadas. Espera a que Firebase restaure la sesión persistida
 * (si no, un F5 mandaría al login aunque haya sesión) y, sin usuario, redirige
 * al login recordando a dónde iba.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const loggedIn = await inject(AuthService).ready();
  if (loggedIn) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Para el login: si ya hay sesión, no tiene sentido mostrarlo. */
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const loggedIn = await inject(AuthService).ready();
  return loggedIn ? router.createUrlTree(['/']) : true;
};
