import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell/shell';

// `title` es una clave de i18n (ver core/i18n/translated-title.strategy.ts).
export const routes: Routes = [
  // Públicas (sin el layout principal).
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'titles.login',
    loadComponent: () => import('./features/auth/pages/login/login').then((m) => m.Login),
  },
  {
    // El gateway respondió 403: logueado pero fuera de la allowlist.
    path: 'sin-acceso',
    canActivate: [authGuard],
    title: 'titles.noAccess',
    loadComponent: () =>
      import('./features/auth/pages/no-access/no-access').then((m) => m.NoAccess),
  },

  // Privadas: todo lo que va dentro del layout principal.
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'proyectos' },
      {
        path: 'proyectos',
        title: 'titles.projects',
        loadChildren: () =>
          import('./features/projects/projects.routes').then((m) => m.PROJECTS_ROUTES),
      },
      {
        path: 'proyectos/:projectId',
        title: 'titles.board',
        loadChildren: () => import('./features/board/board.routes').then((m) => m.BOARD_ROUTES),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
