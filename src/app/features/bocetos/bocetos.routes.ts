import type { Routes } from '@angular/router';

/**
 * Bocetos del tablero v2 (issue 033): sin login y con datos inventados. En QA
 * y prod este archivo se reemplaza por `bocetos.routes.prod.ts` (angular.json),
 * así el boceto ni siquiera llega al bundle. Se borra al empezar la parte 1.
 */
export const BOCETOS_ROUTES: Routes = [
  {
    path: 'bocetos/tablero',
    loadComponent: () => import('./bocetos').then((m) => m.Bocetos),
  },
];
