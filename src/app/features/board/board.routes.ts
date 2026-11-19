import { Routes } from '@angular/router';

import { ActorsStore } from './data-access/actors.store';
import { BoardStore } from './data-access/board.store';
import { BoardViewStore } from './data-access/board-view.store';
import { PlanPrefixStore } from './data-access/plan-prefix.store';
import { ProjectConfigStore } from './data-access/project-config.store';
import { ShareLinksStore } from './data-access/share-links.store';

/** Montado en `proyectos/:projectId`. */
export const BOARD_ROUTES: Routes = [
  {
    path: '',
    // Lo comparten tablero, lista, alta, detalle y ajustes: ir y volver no recarga en
    // blanco, y lo que cambia en Ajustes se ve en el tablero.
    providers: [
      ProjectConfigStore,
      BoardStore,
      ActorsStore,
      BoardViewStore,
      PlanPrefixStore,
      ShareLinksStore,
    ],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/board/board').then((m) => m.Board),
      },
      {
        // Vista Plan (039): por categoría y quién atiende.
        path: 'plan',
        title: 'titles.plan',
        loadComponent: () => import('./pages/plan/plan').then((m) => m.Plan),
      },
      {
        path: 'issues',
        title: 'titles.issues',
        loadComponent: () => import('./pages/issue-list/issue-list').then((m) => m.IssueList),
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
          {
            // Enlaces de solo lectura (009): solo el dueño (lo verifica el servicio).
            path: 'compartir',
            loadComponent: () =>
              import('./pages/settings/share-settings/share-settings').then((m) => m.ShareSettings),
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
