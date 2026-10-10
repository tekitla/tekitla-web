import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** < 768px = móvil. Mantener en sync con `$tablet-min` de `src/styles/_mixins.scss`. */
export const MOBILE_QUERY = '(max-width: 767.98px)';

/** Tamaño de pantalla como signal, para lo que el CSS solo no resuelve (p. ej. drag & drop). */
@Injectable({ providedIn: 'root' })
export class Viewport {
  private readonly observer = inject(BreakpointObserver);

  readonly isMobile = toSignal(
    this.observer.observe(MOBILE_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.observer.isMatched(MOBILE_QUERY) },
  );
}
