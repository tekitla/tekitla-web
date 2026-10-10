import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { isValidProjectKey, normalizeProjectKey, projectKeyValidator } from './project-key';

describe('key de proyecto', () => {
  it.each(['TK', 'WEB2', 'A1', 'ABCDEFGHIJ'])('acepta %s', (key) => {
    expect(isValidProjectKey(key)).toBe(true);
  });

  it.each(['T', 'ABCDEFGHIJK', '1TK', 'tk', 'T-K', 'TK ', ''])('rechaza %j', (key) => {
    expect(isValidProjectKey(key)).toBe(false);
  });

  it('normaliza a mayúsculas sin espacios', () => {
    expect(normalizeProjectKey(' tk 2 ')).toBe('TK2');
  });

  it('el validador explica el motivo', () => {
    const check = (value: string) =>
      projectKeyValidator(new FormControl(value, { nonNullable: true }));
    expect(check('')).toBeNull();
    expect(check('TK')).toBeNull();
    expect(check('2TK')).toEqual({ projectKeyStart: true });
    expect(check('T-K')).toEqual({ projectKeyChars: true });
    expect(check('T')).toEqual({ projectKeyLength: { min: 2, max: 10, actual: 1 } });
    expect(check('ABCDEFGHIJK')).toMatchObject({ projectKeyLength: { actual: 11 } });
  });
});
