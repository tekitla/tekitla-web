import { Routes } from '@angular/router';

import { BoardStore } from './data-access/board.store';

/** Montado en `proyectos/:projectId`. */
export const BOARD_ROUTES: Routes = [
  {
    path: '',
    // Lo comparten tablero, alta y detalle: ir y volver no recarga en blanco.
    providers: [BoardStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/board/board').then((m) => m.Board),
      },
      {
        path: 'issues/nuevo',
        loadComponent: () => import('./pages/issue-new/issue-new').then((m) => m.IssueNew),
      },
      {
        path: 'issues/:number',
        loadComponent: () => import('./pages/issue-detail/issue-detail').then((m) => m.IssueDetail),
      },
    ],
  },
];
