import { describe, expect, it } from 'vitest';

import type { Issue } from '@/app/api';
import {
  adjacentState,
  columnOf,
  groupByState,
  issueKey,
  upsertIssue,
  withState,
} from './board.logic';

const issue = (number: number, patch: Partial<Issue> = {}): Issue => ({
  id: `i${number}`,
  projectId: 'p1',
  number,
  title: `Issue ${number}`,
  description: '',
  state: 'ISSUE_STATE_TODO',
  priority: 'PRIORITY_MEDIUM',
  createdAt: `2026-10-0${number}T00:00:00Z`,
  updatedAt: '',
  rank: `0|a${number}`,
  ...patch,
});

describe('board.logic', () => {
  it('agrupa por estado y manda UNSPECIFIED a «Por hacer»', () => {
    const columns = groupByState([
      issue(1),
      issue(2, { state: 'ISSUE_STATE_IN_PROGRESS' }),
      issue(3, { state: 'ISSUE_STATE_UNSPECIFIED' }),
      issue(4, { state: 'ISSUE_STATE_DONE' }),
    ]);
    expect(columns.ISSUE_STATE_TODO.map((i) => i.number)).toEqual([1, 3]);
    expect(columns.ISSUE_STATE_IN_PROGRESS.map((i) => i.number)).toEqual([2]);
    expect(columns.ISSUE_STATE_DONE.map((i) => i.number)).toEqual([4]);
  });

  it('los descartados (CANCELED) no van en ninguna columna', () => {
    const columns = groupByState([issue(1), issue(2, { state: 'ISSUE_STATE_CANCELED' })]);
    expect(
      Object.values(columns)
        .flat()
        .map((i) => i.number),
    ).toEqual([1]);
    expect(columnOf(issue(2, { state: 'ISSUE_STATE_CANCELED' }))).toBeNull();
  });

  it('ordena como el backend: rank ascendente, sin mirar prioridad ni fecha', () => {
    const columns = groupByState([
      issue(1, { rank: '0|c', priority: 'PRIORITY_URGENT' }),
      issue(2, { rank: '0|a', priority: 'PRIORITY_LOW' }),
      issue(3, { rank: '0|b' }),
      issue(4, { rank: '0|B' }), // comparación por código, no por locale: 'B' < 'a'
    ]);
    expect(columns.ISSUE_STATE_TODO.map((i) => i.number)).toEqual([4, 2, 3, 1]);
  });

  it('con rank vacío o repetido desempata por número', () => {
    const columns = groupByState([issue(3, { rank: '' }), issue(1, { rank: '' })]);
    expect(columns.ISSUE_STATE_TODO.map((i) => i.number)).toEqual([1, 3]);
  });

  it('withState no muta la lista original', () => {
    const list = [issue(1), issue(2)];
    const moved = withState(list, 2, 'ISSUE_STATE_DONE');
    expect(moved[1]!.state).toBe('ISSUE_STATE_DONE');
    expect(list[1]!.state).toBe('ISSUE_STATE_TODO');
  });

  it('upsertIssue reemplaza por número o agrega', () => {
    const list = [issue(1)];
    expect(upsertIssue(list, issue(1, { title: 'Nuevo' }))[0]!.title).toBe('Nuevo');
    expect(upsertIssue(list, issue(2))).toHaveLength(2);
  });

  it('adjacentState respeta los bordes', () => {
    expect(adjacentState('ISSUE_STATE_TODO', 1)).toBe('ISSUE_STATE_IN_PROGRESS');
    expect(adjacentState('ISSUE_STATE_TODO', -1)).toBeNull();
    expect(adjacentState('ISSUE_STATE_DONE', 1)).toBeNull();
    expect(adjacentState('ISSUE_STATE_DONE', -1)).toBe('ISSUE_STATE_IN_PROGRESS');
  });

  it('issueKey arma TQ-42', () => {
    expect(issueKey('TQ', 42)).toBe('TQ-42');
    expect(issueKey('', 42)).toBe('#42');
  });
});
