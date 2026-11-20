import { describe, expect, it } from 'vitest';

import { toFlowMetrics } from '@/app/api/clients/issues/metrics.mappers';
import { signalView, timeView } from './metrics.logic';

// Parte 3 del 036 en el front: «Dónde se va el tiempo» y la señal de
// contratación. Datos inventados, tal como los manda el gateway.

const H = 3600;
const s = (seconds: number) => `${seconds}s`;

const efficiency = {
  working: s(3 * H),
  waitingHuman: s(5 * H),
  blocked: s(0),
  inReview: s(0),
  idle: s(H),
  efficiencyBp: 3750,
  issues: 1,
  waitingHumanByReason: [
    { reason: 'WAITING_REASON_REVIEW' as const, duration: s(4 * H) },
    { reason: 'WAITING_REASON_UNSPECIFIED' as const, duration: s(H) },
  ],
};

describe('timeView', () => {
  it('sin historia de sesiones no hay vista (la página dice desde cuándo se mide)', () => {
    expect(timeView(toFlowMetrics({ weeks: [] }))).toBeNull();
  });

  it('CU-036-6: 3 h trabajando y 5 h esperando dan 37.5 %, con el reparto y la cola', () => {
    const m = toFlowMetrics({
      sessionsRecordedSince: '2026-11-20T18:00:00Z',
      weeks: [
        { start: '2026-11-09T06:00:00Z', end: '2026-11-16T06:00:00Z' },
        { start: '2026-11-16T06:00:00Z', end: '2026-11-23T06:00:00Z', efficiency },
      ],
      summary: {
        efficiency,
        humanQueue: {
          pending: 1,
          oldestPending: s(90 * 60),
          responseTime: { count: 2, median: s(2 * H), p85: s(9 * H) },
        },
      },
    });
    const v = timeView(m)!;
    expect(v.efficiencyPct).toBe(37.5);
    expect(v.parts.map((p) => [p.part, p.hours, p.pct])).toEqual([
      ['working', 3, 37.5],
      ['waitingHuman', 5, 62.5],
      ['blocked', 0, 0],
      ['inReview', 0, 0],
    ]);
    expect(v.idleHours).toBe(1);
    expect(v.pending).toBe(1);
    expect(v.oldest).toEqual({ key: 'metrics.unit.hours', value: '1.5' });
    expect(v.response.median).toEqual({ key: 'metrics.unit.hours', value: '2' });
    expect(v.reasons).toEqual([
      { reason: 'review', hours: 4, pct: 80 },
      { reason: 'none', hours: 1, pct: 20 },
    ]);
    // La semana sin historia no se muestra (no es un cero); la otra, con sus horas.
    expect(v.weekly.map((w) => w.values)).toEqual([[3, 5, 0, 0]]);
  });
});

describe('signalView', () => {
  it('sin señal o con pocas semanas: cuántas faltan', () => {
    expect(signalView(toFlowMetrics({}))).toMatchObject({
      kind: 'insufficient',
      missing: 4,
      rows: [],
    });
    const v = signalView(
      toFlowMetrics({
        hiringSignal: {
          verdict: 'HIRING_VERDICT_INSUFFICIENT_DATA',
          liveWeeks: 1,
          weeksNeeded: 8,
          weeksNeededPreliminary: 4,
        },
      }),
    );
    expect(v).toMatchObject({ kind: 'insufficient', liveWeeks: 1, liveShown: 1, missing: 3 });
  });

  it('CU-036-7: falta gente, con el perfil y los números del mes contra el anterior', () => {
    const window = (wait: number, wip: number) => ({
      start: '2026-12-07T06:00:00Z',
      end: '2027-01-04T06:00:00Z',
      efficiency: { working: s(16 * H), waitingHuman: s(wait * H) },
      humanResponse: { count: 3, median: s(2 * H), p85: s(5 * H) },
      wipMedian: wip,
      closed: 12,
    });
    const v = signalView(
      toFlowMetrics({
        hiringSignal: {
          verdict: 'HIRING_VERDICT_NEEDS_PEOPLE',
          liveWeeks: 8,
          weeksNeeded: 8,
          weeksNeededPreliminary: 4,
          profiles: [{ reason: 'WAITING_REASON_REVIEW', shareBp: 10000 }],
          current: window(32, 3),
          previous: window(12, 3),
        },
      }),
    );
    expect(v.kind).toBe('needsPeople');
    expect(v.missing).toBe(0);
    expect(v.profiles).toEqual([{ reason: 'review', pct: 100 }]);
    expect(v.rows.find((r) => r.key === 'waiting')).toEqual({
      key: 'waiting',
      current: { key: 'metrics.signal.cell.waiting', params: { pct: 67, h: 32 } },
      previous: { key: 'metrics.signal.cell.waiting', params: { pct: 43, h: 12 } },
    });
    expect(v.rows.find((r) => r.key === 'response')?.current).toEqual({
      key: 'metrics.unit.hours',
      params: { n: '2' },
    });
  });

  it('CU-036-8: bajar el WIP; preliminar sin mes anterior', () => {
    const v = signalView(
      toFlowMetrics({
        hiringSignal: {
          verdict: 'HIRING_VERDICT_REDUCE_WIP',
          liveWeeks: 5,
          preliminary: true,
          wipHigh: true,
          current: { efficiency: { working: s(40 * H) }, wipMedian: 10, closed: 8 },
        },
      }),
    );
    expect(v).toMatchObject({ kind: 'reduceWip', preliminary: true, wipHigh: true, missing: 3 });
    expect(v.rows.find((r) => r.key === 'wip')).toEqual({
      key: 'wip',
      current: { key: 'metrics.signal.cell.count', params: { n: 10 } },
      previous: null,
    });
  });
});

describe('signalView: tope de semanas', () => {
  it('con más semanas que las necesarias, la barra y su texto no pasan de 8', () => {
    const v = signalView(
      toFlowMetrics({
        hiringSignal: { verdict: 'HIRING_VERDICT_NO_SIGNAL', liveWeeks: 12, weeksNeeded: 8 },
      }),
    );
    expect(v).toMatchObject({ kind: 'none', liveWeeks: 12, liveShown: 8, missing: 0 });
  });
});

describe('timeView: espera recién empezada', () => {
  it('«la más vieja» de 0 s se muestra (no es «sin dato»)', () => {
    const v = timeView(
      toFlowMetrics({
        sessionsRecordedSince: '2026-11-20T18:00:00Z',
        summary: {
          efficiency: { waitingHuman: '60s' },
          humanQueue: { pending: 1, oldestPending: '0s' },
        },
      }),
    )!;
    expect(v.oldest).toEqual({ key: 'metrics.unit.minutes', value: '0' });
  });
});
