import { Routes } from '@angular/router';

import { BoardStore } from './data-access/board.store';
import { ProjectConfigStore } from './data-access/project-config.store';

/** Montado en `proyectos/:projectId`. */
export const BOARD_ROUTES: Routes = [
  {
    path: '',
    // Lo comparten tablero, alta, detalle y ajustes: ir y volver no recarga en
    // blanco, y lo que cambia en Ajustes se ve en el tablero.
    providers: [ProjectConfigStore, BoardStore],
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
        path: 'ajustes',
        title: 'titles.settings',
        loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'estados' },
          {
            path: 'estados',
            loadComponent: () =>
              import('./pages/settings/status-settings/status-settings').then(
                (m) => m.StatusSettings,
              ),
          },
          {
            path: 'etiquetas',
            loadComponent: () =>
              import('./pages/settings/label-settings/label-settings').then((m) => m.LabelSettings),
          },
        ],
      },
      {
        path: 'issues/:number',
        loadComponent: () => import('./pages/issue-detail/issue-detail').then((m) => m.IssueDetail),
      },
    ],
  },
];
