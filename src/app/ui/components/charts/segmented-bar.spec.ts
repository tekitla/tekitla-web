import { describe, expect, it } from 'vitest';

import { barShares } from './segmented-bar';

describe('segmented-bar', () => {
  it('porcentaje entero de cada parte y texto oscuro sobre el amarillo', () => {
    const shares = barShares([
      { name: 'a', color: 'var(--chart-1)', value: 3, valueText: '3 h' },
      { name: 'b', color: 'var(--chart-4)', value: 5, valueText: '5 h' },
      { name: 'c', color: 'var(--chart-2)', value: 0, valueText: '0 h' },
    ]);
    expect(shares.map((s) => [s.pct, s.darkText])).toEqual([
      [38, false],
      [63, true],
      [0, false],
    ]);
  });

  it('total cero: todo en 0 %, sin dividir por cero', () => {
    expect(
      barShares([{ name: 'a', color: 'var(--chart-1)', value: 0, valueText: '0 h' }])[0].pct,
    ).toBe(0);
  });
});
