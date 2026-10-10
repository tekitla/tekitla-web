import { Routes } from '@angular/router';

import { ProjectsStore } from './data-access/projects.store';

export const PROJECTS_ROUTES: Routes = [
  {
    path: '',
    providers: [ProjectsStore],
    loadComponent: () => import('./pages/project-list/project-list').then((m) => m.ProjectList),
  },
];
