import { Routes } from '@angular/router';

import { PlanPrefixStore } from './data-access/plan-prefix.store';
import { SharedStore } from './data-access/shared.store';

/**
 * Montado en `compartido/:token` (issue 009): la vista de un enlace de solo
 * lectura, sin sesión ni el shell de la app. Vive en la feature `board`
 * porque reutiliza sus tarjetas, su lógica y la vista Plan.
 *
 * - `''`: el tablero (alcance panel) o la vista Plan (alcance plan).
 * - `plan`: la vista Plan.
 * - `issues/:number`: el detalle (solo alcance panel).
 */
export const SHARED_ROUTES: Routes = [
  {
    path: '',
    providers: [SharedStore, PlanPrefixStore],
    loadComponent: () => import('./pages/shared/shared-shell').then((m) => m.SharedShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/shared/shared-home').then((m) => m.SharedHome),
      },
      {
        path: 'plan',
        loadComponent: () => import('./pages/shared/shared-plan').then((m) => m.SharedPlan),
      },
      {
        path: 'issues/:number',
        loadComponent: () => import('./pages/shared/shared-issue').then((m) => m.SharedIssue),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
