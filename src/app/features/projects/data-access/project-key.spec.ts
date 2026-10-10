import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { isValidProjectKey, normalizeProjectKey, projectKeyValidator } from './project-key';

describe('key de proyecto', () => {
  it.each(['TQ', 'WEB2', 'A1', 'ABCDEFGHIJ'])('acepta %s', (key) => {
    expect(isValidProjectKey(key)).toBe(true);
  });

  it.each(['T', 'ABCDEFGHIJK', '1TQ', 'tq', 'T-Q', 'TQ ', ''])('rechaza %j', (key) => {
    expect(isValidProjectKey(key)).toBe(false);
  });

  it('normaliza a mayúsculas sin espacios', () => {
    expect(normalizeProjectKey(' tq 2 ')).toBe('TQ2');
  });

  it('el validador explica el motivo', () => {
    const check = (value: string) =>
      projectKeyValidator(new FormControl(value, { nonNullable: true }));
    expect(check('')).toBeNull();
    expect(check('TQ')).toBeNull();
    expect(check('2TQ')).toEqual({ projectKeyStart: true });
    expect(check('T-Q')).toEqual({ projectKeyChars: true });
    expect(check('T')).toEqual({ projectKeyLength: { min: 2, max: 10, actual: 1 } });
    expect(check('ABCDEFGHIJK')).toMatchObject({ projectKeyLength: { actual: 11 } });
  });
});
