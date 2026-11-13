import { describe, expect, it } from 'vitest';

import type { Issue, Status } from '@/app/api';
import type { BoardColumn } from './board.logic';
import {
  neighborInColumn,
  openedOverBoard,
  ownsKeyboard,
  panelHistoryState,
  withPanelMark,
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

  it('mientras no se conoce la clave del proyecto no abre nada, ni con número', () => {
    expect(parseIssueParam('TK-3', '')).toBeNull();
    expect(parseIssueParam('3', '')).toBeNull();
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
  it('solo con la marca de este documento', () => {
    expect(openedOverBoard({ ...panelHistoryState(), navigationId: 3 })).toBe(true);
    // Marca de antes de recargar (otro documento) o sin marca.
    expect(openedOverBoard({ tkPanel: 'otro-documento' })).toBe(false);
    expect(openedOverBoard({ tkPanel: true })).toBe(false);
    expect(openedOverBoard({ navigationId: 3 })).toBe(false);
    expect(openedOverBoard(null)).toBe(false);
  });
});

describe('withPanelMark', () => {
  it('pone la marca y conserva lo demás', () => {
    const state = withPanelMark({ otro: 1, navigationId: 4 }, true);
    expect(state).toMatchObject({ otro: 1, navigationId: 4 });
    expect(openedOverBoard(state)).toBe(true);
  });

  it('quita la marca y conserva lo demás', () => {
    expect(withPanelMark({ otro: 1, ...panelHistoryState() }, false)).toEqual({ otro: 1 });
    expect(withPanelMark(null, false)).toEqual({});
  });
});
