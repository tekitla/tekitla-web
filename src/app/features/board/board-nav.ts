import type { Project } from '@/app/api';
import type { Crumb, ShellProject } from '@/app/layout/shell/shell-nav';

/**
 * Migas de pan y proyecto del sidebar para las páginas del tablero:
 * `Proyectos › <proyecto>` y, en alta y detalle, la página actual al final
 * (con el proyecto enlazado a su tablero).
 */
export function boardNav(
  project: Project | null,
  projectId: string,
  current?: Crumb,
): { crumbs: Crumb[]; project: ShellProject | null } {
  const link = current ? ['/proyectos', projectId] : undefined;
  const crumbs: Crumb[] = [
    { label: 'shell.nav.projects', translate: true, link: ['/proyectos'] },
    project ? { label: project.name, link } : { label: 'board.title', translate: true, link },
  ];
  if (current) crumbs.push(current);
  return { crumbs, project: project && { id: project.id, name: project.name } };
}
