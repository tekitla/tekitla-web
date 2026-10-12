import { describe, expect, it } from 'vitest';

import type { Status } from '@/app/api';
import { defaultDestination, isLastOfCategory, nameError } from './settings.logic';

const status = (id: string, category: Status['category']): Status => ({
  id,
  projectId: 'p1',
  name: id,
  category,
  rank: id,
});

const statuses = [
  status('todo', 'ISSUE_STATE_TODO'),
  status('doing', 'ISSUE_STATE_IN_PROGRESS'),
  status('review', 'ISSUE_STATE_IN_PROGRESS'),
  status('done', 'ISSUE_STATE_DONE'),
];

describe('settings.logic', () => {
  it('nameError: obligatorio, máximo 40 y único sin distinguir mayúsculas', () => {
    expect(nameError('  ', statuses)).toBe('required');
    expect(nameError('x'.repeat(41), statuses)).toBe('tooLong');
    expect(nameError('ñ'.repeat(40), statuses)).toBeNull();
    expect(nameError(' DOING ', statuses)).toBe('taken');
    expect(nameError('Doing', statuses, 'doing')).toBeNull(); // renombrar el mismo
    expect(nameError('Testing', statuses)).toBeNull();
  });

  it('isLastOfCategory', () => {
    expect(isLastOfCategory(statuses[0]!, statuses)).toBe(true);
    expect(isLastOfCategory(statuses[1]!, statuses)).toBe(false);
  });

  it('defaultDestination prefiere otro de la misma categoría', () => {
    expect(defaultDestination(statuses[2]!, statuses)).toBe('doing');
    expect(defaultDestination(statuses[3]!, statuses)).toBe('todo');
    expect(defaultDestination(statuses[0]!, [statuses[0]!])).toBe('');
  });
});
