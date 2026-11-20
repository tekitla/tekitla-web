import { describe, expect, it } from 'vitest';

import { niceTicks, segments } from './week-chart';

describe('week-chart', () => {
  it('niceTicks: de 0 a un máximo redondo que cubre el dato', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7)).toEqual([0, 2.5, 5, 7.5]);
    expect(niceTicks(44)).toEqual([0, 20, 40, 60]);
    const t = niceTicks(143.5);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(143.5);
    expect(t.length).toBeLessThanOrEqual(5);
  });

  it('segments: un null corta la línea (hueco, no cero)', () => {
    expect(segments([1, 2, null, 3, null, null, 4, 5])).toEqual([
      [
        { i: 0, v: 1 },
        { i: 1, v: 2 },
      ],
      [{ i: 3, v: 3 }],
      [
        { i: 6, v: 4 },
        { i: 7, v: 5 },
      ],
    ]);
    expect(segments([null, null])).toEqual([]);
  });
});
