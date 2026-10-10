import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell/shell';

export const routes: Routes = [
  // Pública
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Privada: todo lo que va dentro del layout principal.
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'items' },
      {
        path: 'items',
        loadChildren: () => import('./features/items/items.routes').then((m) => m.ITEMS_ROUTES),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
