import { DefaultUrlSerializer } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { Issue, Status } from '@/app/api';
import type { BoardColumn } from './board.logic';
import {
  neighborInColumn,
  openedOverBoard,
  onlyPanelChanged,
  ownsKeyboard,
  parseIssueParam,
} from './issue-panel.logic';

describe('parseIssueParam', () => {
  it('lee la clave del proyecto, sin importar mayúsculas', () => {
    expect(parseIssueParam('RND-231', 'RND')).toBe(231);
    expect(parseIssueParam('rnd-7', 'RND')).toBe(7);
  });

  it('acepta solo el número', () => {
    expect(parseIssueParam('42', 'RND')).toBe(42);
  });

  it('no abre la clave de otro proyecto', () => {
    expect(parseIssueParam('TK-3', 'RND')).toBeNull();
  });

  it('mientras no se conoce la clave del proyecto, una clave no abre nada', () => {
    expect(parseIssueParam('TK-3', '')).toBeNull();
    expect(parseIssueParam('3', '')).toBe(3);
  });

  it('ignora lo vacío o inválido', () => {
    for (const value of [null, undefined, '', '  ', 'RND-', 'RND-0', '-3', 'abc', 'RND-1.5']) {
      expect(parseIssueParam(value, 'RND')).toBeNull();
    }
  });
});

describe('neighborInColumn', () => {
  const issue = (number: number) => ({ number }) as Issue;
  const column = (...numbers: number[]): BoardColumn => ({
    status: {} as Status,
    issues: numbers.map(issue),
  });
  const columns = [column(1, 2, 3), column(7, 8)];

  it('pasa al anterior y al siguiente de la misma columna', () => {
    expect(neighborInColumn(columns, 2, -1)).toBe(1);
    expect(neighborInColumn(columns, 2, 1)).toBe(3);
    expect(neighborInColumn(columns, 7, 1)).toBe(8);
  });

  it('no salta de columna en los bordes', () => {
    expect(neighborInColumn(columns, 1, -1)).toBeNull();
    expect(neighborInColumn(columns, 3, 1)).toBeNull();
  });

  it('sin el issue en el tablero (columna oculta) no hay vecino', () => {
    expect(neighborInColumn(columns, 99, 1)).toBeNull();
  });
});

describe('ownsKeyboard', () => {
  it('campos, selectores y diálogos usan el teclado por su cuenta', () => {
    const input = document.createElement('input');
    const select = document.createElement('select');
    const dialog = document.createElement('dialog');
    const inner = document.createElement('button');
    dialog.append(inner);
    for (const el of [input, select, inner]) expect(ownsKeyboard(el)).toBe(true);
  });

  it('un botón o un enlace no', () => {
    expect(ownsKeyboard(document.createElement('button'))).toBe(false);
    expect(ownsKeyboard(document.createElement('a'))).toBe(false);
    expect(ownsKeyboard(null)).toBe(false);
  });
});

describe('openedOverBoard', () => {
  it('solo con la marca del tablero', () => {
    expect(openedOverBoard({ tkPanel: true, navigationId: 3 })).toBe(true);
    expect(openedOverBoard({ tkPanel: false })).toBe(false);
    expect(openedOverBoard({ navigationId: 3 })).toBe(false);
    expect(openedOverBoard(null)).toBe(false);
  });
});

describe('onlyPanelChanged', () => {
  const serializer = new DefaultUrlSerializer();
  const url = (u: string) => serializer.parse(u);
  const onlyPanel = (a: string, b: string) =>
    onlyPanelChanged(url(a), url(b), (t) => serializer.serialize(t));

  it('abrir, cambiar o cerrar el panel', () => {
    expect(onlyPanel('/proyectos/p1', '/proyectos/p1?issue=RND-2')).toBe(true);
    expect(onlyPanel('/proyectos/p1?issue=RND-2', '/proyectos/p1?issue=RND-3')).toBe(true);
    expect(onlyPanel('/proyectos/p1?issue=RND-3&q=x', '/proyectos/p1?q=x')).toBe(true);
  });

  it('ir a otra página o cambiar otros filtros no', () => {
    expect(onlyPanel('/proyectos/p1', '/proyectos/p1/issues')).toBe(false);
    expect(onlyPanel('/proyectos/p1?issue=RND-2', '/proyectos/p1?q=x')).toBe(false);
  });
});
