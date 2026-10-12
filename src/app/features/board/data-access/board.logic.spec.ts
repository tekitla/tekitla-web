import { describe, expect, it } from 'vitest';

import type { Issue, Status } from '@/app/api';
import {
  buildColumns,
  countByStatus,
  issueKey,
  placementAt,
  rankBetween,
  statusOf,
  upsertIssue,
  withMove,
} from './board.logic';

const status = (id: string, category: Status['category'], rank: string, name = id): Status => ({
  id,
  projectId: 'p1',
  name,
  category,
  rank,
});

// Desordenados a propósito: las columnas salen por rank.
const statuses: Status[] = [
  status('done', 'ISSUE_STATE_DONE', 'c'),
  status('todo', 'ISSUE_STATE_TODO', 'a'),
  status('review', 'ISSUE_STATE_IN_PROGRESS', 'b5'),
  status('doing', 'ISSUE_STATE_IN_PROGRESS', 'b'),
  status('canceled', 'ISSUE_STATE_CANCELED', 'd'),
];

const issue = (number: number, patch: Partial<Issue> = {}): Issue => ({
  id: `i${number}`,
  projectId: 'p1',
  number,
  title: `Issue ${number}`,
  description: '',
  state: 'ISSUE_STATE_TODO',
  priority: 'PRIORITY_MEDIUM',
  createdAt: '',
  updatedAt: '',
  rank: `r${number}`,
  statusId: 'todo',
  labelIds: [],
  ...patch,
});

const numbers = (list: readonly Issue[]) => list.map((i) => i.number);

describe('board.logic', () => {
  describe('buildColumns', () => {
    it('una columna por estado en orden de rank, sin los de descarte', () => {
      const columns = buildColumns([], statuses);
      expect(columns.map((c) => c.status.id)).toEqual(['todo', 'doing', 'review', 'done']);
    });

    it('agrupa por statusId y ordena cada columna por rank', () => {
      const columns = buildColumns(
        [
          issue(1, { rank: 'm' }),
          issue(2, { statusId: 'review', state: 'ISSUE_STATE_IN_PROGRESS' }),
          issue(3, { rank: 'a' }),
          issue(4, { statusId: 'canceled', state: 'ISSUE_STATE_CANCELED' }),
        ],
        statuses,
      );
      expect(numbers(columns[0]!.issues)).toEqual([3, 1]);
      expect(numbers(columns[2]!.issues)).toEqual([2]);
      expect(columns.flatMap((c) => numbers(c.issues))).not.toContain(4);
    });

    it('un statusId desconocido cae en el primer estado de su categoría', () => {
      const columns = buildColumns(
        [issue(1, { statusId: 'borrado', state: 'ISSUE_STATE_IN_PROGRESS' })],
        statuses,
      );
      expect(numbers(columns.find((c) => c.status.id === 'doing')!.issues)).toEqual([1]);
    });

    it('ranks iguales: desempata el número', () => {
      const columns = buildColumns([issue(2, { rank: 'x' }), issue(1, { rank: 'x' })], statuses);
      expect(numbers(columns[0]!.issues)).toEqual([1, 2]);
    });
  });

  it('statusOf y countByStatus usan el estado concreto', () => {
    const list = [issue(1), issue(2), issue(3, { statusId: 'done', state: 'ISSUE_STATE_DONE' })];
    expect(statusOf(list[2]!, statuses)?.id).toBe('done');
    expect(countByStatus(list, statuses)).toEqual(
      new Map([
        ['todo', 2],
        ['done', 1],
      ]),
    );
  });

  describe('placementAt (semántica de currentIndex de CDK)', () => {
    const column = [issue(1), issue(2), issue(3)];

    it('desde otra columna: se inserta en el índice', () => {
      expect(placementAt(column, 9, 0)).toEqual({ afterNumber: 0, beforeNumber: 1 });
      expect(placementAt(column, 9, 1)).toEqual({ afterNumber: 1, beforeNumber: 2 });
      expect(placementAt(column, 9, 3)).toEqual({ afterNumber: 3, beforeNumber: 0 });
    });

    it('dentro de la misma columna: se saca y se vuelve a insertar', () => {
      // 1 al final: 2, 3, 1
      expect(placementAt(column, 1, 2)).toEqual({ afterNumber: 3, beforeNumber: 0 });
      // 3 arriba de todo: 3, 1, 2
      expect(placementAt(column, 3, 0)).toEqual({ afterNumber: 0, beforeNumber: 1 });
      // 1 un lugar abajo: 2, 1, 3
      expect(placementAt(column, 1, 1)).toEqual({ afterNumber: 2, beforeNumber: 3 });
    });

    it('columna vacía: sin vecinos; índice fuera de rango se acota', () => {
      expect(placementAt([], 1, 5)).toEqual({ afterNumber: 0, beforeNumber: 0 });
      expect(placementAt(column, 9, 99)).toEqual({ afterNumber: 3, beforeNumber: 0 });
    });
  });

  describe('rankBetween', () => {
    const between = (a: string | null, b: string | null) => {
      const r = rankBetween(a, b);
      expect(r).not.toBeNull();
      if (a !== null) expect(r! > a).toBe(true);
      if (b !== null) expect(r! < b).toBe(true);
      return r;
    };

    it('queda estrictamente entre los vecinos', () => {
      between('a', 'b');
      between('0|hzzzzz:', '0|i0000g:');
      between('abc', 'abd');
    });

    it('sin vecino de un lado', () => {
      between(null, 'm');
      between('m', null);
      between(null, null);
    });

    it('cuando el de abajo es prefijo del de arriba', () => {
      between('ab', 'abc');
      between(null, 'b');
    });

    it('null si no hay uno seguro', () => {
      expect(rankBetween('b', 'b')).toBeNull();
      expect(rankBetween('c', 'b')).toBeNull();
      expect(rankBetween('a', 'a\u0000')).toBeNull();
    });
  });

  it('withMove cambia estado, categoría y (si viene) rank', () => {
    const doing = statuses.find((s) => s.id === 'doing')!;
    const [moved] = withMove([issue(1)], 1, doing, 'nuevo');
    expect(moved).toMatchObject({
      statusId: 'doing',
      state: 'ISSUE_STATE_IN_PROGRESS',
      rank: 'nuevo',
    });
    expect(withMove([issue(1)], 1, doing)[0]!.rank).toBe('r1');
  });

  it('upsertIssue reemplaza por número o agrega al final', () => {
    const list = [issue(1), issue(2)];
    expect(upsertIssue(list, issue(2, { title: 'x' }))[1]!.title).toBe('x');
    expect(numbers(upsertIssue(list, issue(3)))).toEqual([1, 2, 3]);
  });

  it('issueKey arma TK-42 (o #42 sin clave)', () => {
    expect(issueKey('TK', 42)).toBe('TK-42');
    expect(issueKey('', 42)).toBe('#42');
  });
});
