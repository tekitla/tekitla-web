import { describe, expect, it } from 'vitest';

import type { AgentSession, FlowMetrics, FlowWeek } from '@/app/api';
import { toFlowMetrics, toSeconds } from '@/app/api/clients/issues/metrics.mappers';
import {
  agentGroup,
  durationText,
  groupSessions,
  isPeriodWeeks,
  metricsView,
  periodStart,
  sinceText,
  toDays,
} from './metrics.logic';

// Datos inventados: ningún número sale de un proyecto real.

const DAY = 86_400;

function week(start: string, end: string, patch: Partial<FlowWeek> = {}): FlowWeek {
  return {
    start,
    end,
    leadTime: { count: 0, median: null, p85: null },
    cycleTime: { count: 0, median: null, p85: null },
    closedValue: 0,
    closedOther: 0,
    canceled: 0,
    started: 0,
    wip: 0,
    source: {
      confidence: 'METRIC_CONFIDENCE_NO_DATA',
      live: 0,
      importHistory: 0,
      importFile: 0,
      importSync: 0,
    },
    efficiency: null,
    humanQueue: null,
    ...patch,
  };
}

function metrics(weeks: FlowWeek[], valueLabelIds: string[] = []): FlowMetrics {
  return {
    from: weeks[0].start,
    to: weeks[weeks.length - 1].end,
    timeZone: 'America/Mexico_City',
    weeks,
    summary: {
      leadTime: { count: 3, median: 3 * DAY, p85: 9 * DAY },
      cycleTime: { count: 0, median: null, p85: null },
      closedValue: 4,
      closedOther: 1,
      canceled: 0,
      started: 2,
      wip: 7,
      source: {
        confidence: 'METRIC_CONFIDENCE_APPROXIMATE',
        live: 1,
        importHistory: 4,
        importFile: 0,
        importSync: 0,
      },
      efficiency: null,
      humanQueue: null,
    },
    stale: [],
    staleTotal: 0,
    valueLabelIds,
    coverage: { issues: 12, doneWithoutDates: 2 },
    sessionsRecordedSince: '',
    hiringSignal: null,
  };
}

describe('periodStart', () => {
  it('empieza el lunes de hace N-1 semanas a las 00:00 locales', () => {
    // Miércoles 2026-11-18 15:00 local.
    const start = periodStart(new Date(2026, 10, 18, 15, 0), 4);
    expect(start.getDay()).toBe(1);
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([
      2026, 9, 26, 0,
    ]);
  });
  it('un domingo cuenta en la semana que empezó el lunes anterior', () => {
    const start = periodStart(new Date(2026, 10, 22, 10, 0), 1);
    expect(start.getDate()).toBe(16);
  });
  it('acepta solo los presets', () => {
    expect(isPeriodWeeks('12')).toBe(true);
    expect(isPeriodWeeks(5)).toBe(false);
  });
});

describe('durationText', () => {
  it('días desde un día, horas y minutos debajo', () => {
    expect(durationText(3 * DAY)).toEqual({ key: 'metrics.unit.days', value: '3' });
    expect(durationText(1.25 * DAY)).toEqual({ key: 'metrics.unit.days', value: '1.3' });
    expect(durationText(5.5 * 3600)).toEqual({ key: 'metrics.unit.hours', value: '5.5' });
    expect(durationText(600)).toEqual({ key: 'metrics.unit.minutes', value: '10' });
    // Redondea antes de elegir la unidad.
    expect(durationText(3590)).toEqual({ key: 'metrics.unit.hours', value: '1' });
    expect(durationText(86_000)).toEqual({ key: 'metrics.unit.days', value: '1' });
    expect(toDays(null)).toBeNull();
    expect(toDays(36 * 3600)).toBe(1.5);
  });
});

describe('toSeconds', () => {
  it('lee las duraciones de grpc-gateway', () => {
    expect(toSeconds('3600s')).toBe(3600);
    expect(toSeconds('1.5s')).toBe(1.5);
    expect(toSeconds(undefined)).toBeNull();
    expect(toSeconds('abc')).toBeNull();
  });
  it('normaliza la respuesta: duraciones a segundos y nada ausente', () => {
    const m = toFlowMetrics({
      weeks: [
        {
          start: '2026-11-09T06:00:00Z',
          end: '2026-11-16T06:00:00Z',
          leadTime: { count: 2, median: '86400s', p85: '172800s' },
        },
      ],
      summary: { wip: 3 },
    });
    expect(m.weeks[0].leadTime).toEqual({ count: 2, median: DAY, p85: 2 * DAY });
    expect(m.weeks[0].cycleTime).toEqual({ count: 0, median: null, p85: null });
    expect(m.summary.wip).toBe(3);
    expect(m.valueLabelIds).toEqual([]);
    expect(m.coverage).toEqual({ issues: 0, doneWithoutDates: 0 });
  });
});

describe('metricsView', () => {
  const weeks = [
    // Recortada: empieza un miércoles.
    week('2026-11-04T06:00:00Z', '2026-11-09T06:00:00Z', { wip: 5 }),
    week('2026-11-09T06:00:00Z', '2026-11-16T06:00:00Z', {
      leadTime: { count: 2, median: 2 * DAY, p85: 4 * DAY },
      closedValue: 2,
      closedOther: 1,
      wip: 7,
      started: 1,
    }),
  ];

  it('una semana sin terminados es un hueco, no un cero', () => {
    const v = metricsView(metrics(weeks));
    expect(v.leadSeries.map((p) => p.median)).toEqual([null, 2]);
    expect(v.lead.value).toEqual({ key: 'metrics.unit.days', value: '3' });
    expect(v.cycle.value).toBeNull();
    expect(v.partialFirst).toBe(true);
    expect(v.partialLast).toBe(false);
  });

  it('sin etiquetas de valor, una sola serie de cerrados', () => {
    const v = metricsView(metrics(weeks));
    expect(v.hasValueLabels).toBe(false);
    expect(v.closedSeries[1].values).toEqual([3]);
    const withValue = metricsView(metrics(weeks, ['l1']));
    expect(withValue.closedSeries[1].values).toEqual([2, 1]);
  });

  it('dice de dónde salen los números', () => {
    const v = metricsView(metrics(weeks));
    expect(v.confidence).toBe('approximate');
    expect(v.wip).toBe(7);
    expect(v.wipSpark).toEqual([5, 7]);
    expect(v.doneWithoutDates).toBe(2);
  });
});

function session(patch: Partial<AgentSession>): AgentSession {
  return {
    id: 's',
    source: 'SESSION_SOURCE_HERDR',
    externalId: 'e',
    agentActorId: 'a',
    agentDisplayName: 'Claude Code PC-01',
    tool: 'AGENT_TOOL_CLAUDE_CODE',
    machine: 'PC-01',
    cwdRel: '',
    sessionName: '',
    workspaceLabel: '',
    projectId: 'p1',
    issueNumber: 1,
    link: 'SESSION_LINK_CWD',
    status: 'SESSION_STATUS_IDLE',
    statusChangedAt: '2026-11-19T10:00:00Z',
    lastSeenAt: '2026-11-19T10:00:00Z',
    startedAt: '2026-11-19T09:00:00Z',
    endedAt: '',
    waitingOn: 'WAITING_ON_NONE',
    waitingTarget: '',
    waitingText: '',
    waitingReason: 'WAITING_REASON_UNSPECIFIED',
    ...patch,
  };
}

describe('agentes', () => {
  it('agrupa: primero lo que espera a una persona, después las colgadas', () => {
    expect(agentGroup(session({ waitingOn: 'WAITING_ON_PERSON' }))).toBe('person');
    expect(agentGroup(session({ status: 'SESSION_STATUS_WAITING_OK' }))).toBe('person');
    expect(
      agentGroup(session({ status: 'SESSION_STATUS_WAITING_OK', waitingOn: 'WAITING_ON_SESSION' })),
    ).toBe('other');
    expect(agentGroup(session({ status: 'SESSION_STATUS_STALLED' }))).toBe('stalled');
    expect(agentGroup(session({ status: 'SESSION_STATUS_WORKING' }))).toBe('working');
    expect(agentGroup(session({}))).toBe('idle');
  });

  it('ordena cada grupo por quien espera hace más y descarta las terminadas', () => {
    const groups = groupSessions([
      session({
        id: 'nueva',
        waitingOn: 'WAITING_ON_PERSON',
        statusChangedAt: '2026-11-19T11:00:00Z',
      }),
      session({
        id: 'vieja',
        waitingOn: 'WAITING_ON_PERSON',
        statusChangedAt: '2026-11-19T08:00:00Z',
      }),
      session({ id: 'fin', status: 'SESSION_STATUS_ENDED' }),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['person', 'stalled', 'working', 'other', 'idle']);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['vieja', 'nueva']);
    expect(groups.flatMap((g) => g.sessions).some((s) => s.id === 'fin')).toBe(false);
  });

  it('desde cuándo', () => {
    expect(sinceText('2026-11-19T10:00:00Z', new Date('2026-11-19T10:25:00Z'))).toEqual({
      key: 'metrics.unit.minutes',
      value: '25',
    });
    expect(sinceText('nope', new Date())).toBeNull();
  });
});
