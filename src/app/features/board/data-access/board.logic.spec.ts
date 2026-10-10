import { describe, expect, it } from 'vitest';

import type { Issue } from '@/app/api';
import { adjacentState, groupByState, issueKey, upsertIssue, withState } from './board.logic';

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
    expect(columns.ISSUE_STATE_TODO.map((i) => i.number)).toEqual([3, 1]);
    expect(columns.ISSUE_STATE_IN_PROGRESS.map((i) => i.number)).toEqual([2]);
    expect(columns.ISSUE_STATE_DONE.map((i) => i.number)).toEqual([4]);
  });

  it('ordena como el backend: prioridad desc y luego más reciente', () => {
    const columns = groupByState([
      issue(1, { priority: 'PRIORITY_LOW' }),
      issue(2, { priority: 'PRIORITY_URGENT' }),
      issue(3),
      issue(4),
    ]);
    expect(columns.ISSUE_STATE_TODO.map((i) => i.number)).toEqual([2, 4, 3, 1]);
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
