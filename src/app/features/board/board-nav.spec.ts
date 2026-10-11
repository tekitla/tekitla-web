import { describe, expect, it } from 'vitest';

import type { Project } from '@/app/api';
import { boardNav } from './board-nav';

const project: Project = {
  id: 'p1',
  key: 'TK',
  name: 'Tekitla',
  description: '',
  createdAt: '',
  updatedAt: '',
  workspaceId: 'w1',
};

describe('boardNav', () => {
  it('en el tablero, el proyecto es la página actual', () => {
    expect(boardNav(project, 'p1')).toEqual({
      crumbs: [
        { label: 'shell.nav.projects', translate: true, link: ['/proyectos'] },
        { label: 'Tekitla', link: undefined },
      ],
      project: { id: 'p1', name: 'Tekitla' },
    });
  });

  it('en alta y detalle, el proyecto enlaza al tablero y la página va al final', () => {
    const { crumbs } = boardNav(project, 'p1', { label: 'TK-4' });
    expect(crumbs.slice(1)).toEqual([
      { label: 'Tekitla', link: ['/proyectos', 'p1'] },
      { label: 'TK-4' },
    ]);
  });

  it('sin proyecto cargado todavía usa «Tablero» y no agrega grupo al sidebar', () => {
    const nav = boardNav(null, 'p1', { label: 'TK-4' });
    expect(nav.crumbs[1]).toEqual({
      label: 'board.title',
      translate: true,
      link: ['/proyectos', 'p1'],
    });
    expect(nav.project).toBeNull();
  });
});
