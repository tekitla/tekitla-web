import { describe, expect, it } from 'vitest';

import type { Issue, Label } from '@/app/api';
import {
  DEFAULT_PREFIX,
  UNCATEGORIZED,
  buildPlan,
  displayName,
  normalizePrefix,
  personName,
  prefixesOf,
  responsiblesOf,
  waitingNote,
} from './plan.logic';

const label = (id: string, name: string): Label => ({
  id,
  projectId: 'p1',
  name,
  color: 'LABEL_COLOR_INFO',
  countsAsValue: false,
});

const labels = [
  label('esc', 'perfil/escuela'),
  label('fam', 'perfil/familia'),
  label('age', 'perfil/agente'),
  label('web', 'web'),
  label('front', 'area/front'),
  label('ana', 'responsable/ana-perez'),
  label('wait', 'espera/victor'),
];
const labelsById = new Map(labels.map((l) => [l.id, l]));

const NOW = new Date('2026-11-18T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const issue = (number: number, patch: Partial<Issue> = {}): Issue => ({
  id: `i${number}`,
  projectId: 'p1',
  number,
  title: `Issue ${number}`,
  description: '',
  state: 'ISSUE_STATE_TODO',
  priority: 'PRIORITY_MEDIUM',
  createdAt: '',
  updatedAt: daysAgo(1),
  rank: `r${number}`,
  statusId: 'todo',
  labelIds: [],
  discard: null,
  assigneeActorId: '',
  sourceKey: '',
  ...patch,
});

const numbers = (list: readonly Issue[]) => list.map((i) => i.number);

const issues = [
  issue(1, { labelIds: ['esc'], state: 'ISSUE_STATE_DONE' }),
  issue(2, { labelIds: ['esc', 'age'], state: 'ISSUE_STATE_IN_PROGRESS' }),
  issue(3, { labelIds: ['fam'] }),
  issue(4, { labelIds: ['web'] }),
  issue(5, { labelIds: ['esc'], state: 'ISSUE_STATE_CANCELED' }),
  issue(6, { labelIds: ['esc'], state: 'ISSUE_STATE_DONE', updatedAt: daysAgo(40) }),
  issue(7, { labelIds: ['fam', 'wait'], state: 'ISSUE_STATE_IN_PROGRESS' }),
];

const plan = (patch: Partial<Parameters<typeof buildPlan>[0]> = {}) =>
  buildPlan({ issues, labelsById, prefix: DEFAULT_PREFIX, now: NOW, ...patch });

describe('plan.logic', () => {
  it('CU-039-1: un bloque por categoría, por nombre, con sus carriles; sin categoría al final', () => {
    const p = plan();
    expect(p.blocks.map((b) => b.key)).toEqual(['agente', 'escuela', 'familia', UNCATEGORIZED]);
    const escuela = p.blocks[1];
    expect(numbers(escuela.lanes.done)).toEqual([1]);
    expect(numbers(escuela.lanes.doing)).toEqual([2]);
    expect(escuela.lanes.todo).toEqual([]);
    expect(numbers(p.blocks[3].lanes.todo)).toEqual([4]);
    expect(p.categories).toEqual(['agente', 'escuela', 'familia']);
  });

  it('los descartados no aparecen', () => {
    const all = plan().blocks.flatMap((b) => [...b.lanes.done, ...b.lanes.doing, ...b.lanes.todo]);
    expect(numbers(all)).not.toContain(5);
  });

  it('CU-039-3: en dos bloques, pero los totales lo cuentan una vez', () => {
    const p = plan();
    expect(numbers(p.blocks[0].lanes.doing)).toEqual([2]);
    expect(numbers(p.blocks[1].lanes.doing)).toEqual([2]);
    // 1 y 6 hechos; 2 y 7 en curso; 3 y 4 por hacer.
    expect(p.totals).toEqual({ done: 2, doing: 2, todo: 2 });
  });

  it('CU-039-2: con una categoría, solo su bloque y sus totales', () => {
    const p = plan({ category: 'escuela' });
    expect(p.blocks.map((b) => b.key)).toEqual(['escuela']);
    expect(p.totals).toEqual({ done: 2, doing: 1, todo: 0 });
    // Las categorías del filtro siguen siendo todas.
    expect(p.categories).toEqual(['agente', 'escuela', 'familia']);
  });

  it('una categoría que no existe muestra todo; «sin categoría» se puede filtrar', () => {
    expect(plan({ category: 'nada' }).blocks).toHaveLength(4);
    const p = plan({ category: UNCATEGORIZED });
    expect(p.blocks.map((b) => b.key)).toEqual([UNCATEGORIZED]);
    expect(p.totals).toEqual({ done: 0, doing: 0, todo: 1 });
  });

  it('hechos: solo las últimas 4 semanas, salvo «ver todos»', () => {
    const escuela = plan().blocks[1];
    expect(numbers(escuela.lanes.done)).toEqual([1]);
    expect(escuela.counts.done).toBe(2);
    expect(escuela.olderDone).toBe(1);
    const all = plan({ allDone: new Set(['escuela']) }).blocks[1];
    expect(numbers(all.lanes.done)).toEqual([1, 6]);
    expect(all.olderDone).toBe(0);
  });

  it('por hacer y en curso, por prioridad y después por rank', () => {
    const p = buildPlan({
      issues: [
        issue(1, { labelIds: ['esc'], priority: 'PRIORITY_LOW' }),
        issue(2, { labelIds: ['esc'], priority: 'PRIORITY_URGENT' }),
        issue(3, { labelIds: ['esc'], priority: 'PRIORITY_LOW', rank: 'a' }),
      ],
      labelsById,
      prefix: DEFAULT_PREFIX,
      now: NOW,
    });
    expect(numbers(p.blocks[0].lanes.todo)).toEqual([2, 3, 1]);
  });

  it('CU-039-7: otro prefijo agrupa por esas etiquetas', () => {
    const p = plan({ prefix: 'area/' });
    expect(p.blocks.map((b) => b.key)).toEqual([UNCATEGORIZED]);
    const q = buildPlan({
      issues: [issue(9, { labelIds: ['front'] })],
      labelsById,
      prefix: 'area/',
      now: NOW,
    });
    expect(q.blocks.map((b) => b.key)).toEqual(['front']);
  });

  it('CU-039-8: espera/<persona> arma la caja, sin los hechos', () => {
    const p = plan();
    expect(p.waiting).toEqual([{ person: 'victor', issues: [issues[6]] }]);
    const done = plan({
      issues: [issue(8, { labelIds: ['wait'], state: 'ISSUE_STATE_DONE' })],
    });
    expect(done.waiting).toEqual([]);
  });

  it('CU-039-9: responsable sin cuenta desde responsable/<nombre>', () => {
    expect(responsiblesOf(issue(1, { labelIds: ['ana', 'esc'] }), labelsById)).toEqual([
      'ana-perez',
    ]);
    expect(personName('ana-perez')).toBe('Ana Perez');
    expect(personName('victor')).toBe('Victor');
    expect(displayName('admin-round')).toBe('Admin round');
    expect(displayName('escuela')).toBe('Escuela');
  });

  it('prefijos: los de las etiquetas, sin responsable/ ni espera/, más el actual', () => {
    expect(prefixesOf(labels, 'perfil/')).toEqual(['area/', 'perfil/']);
    expect(prefixesOf([], 'tema/')).toEqual(['tema/']);
    expect(normalizePrefix(' Area ')).toBe('area/');
    expect(normalizePrefix('area//')).toBe('area/');
    expect(normalizePrefix('')).toBe(DEFAULT_PREFIX);
    expect(normalizePrefix(null)).toBe(DEFAULT_PREFIX);
  });

  describe('waitingNote (CU-039-10)', () => {
    it('la primera línea «Qué espera» antes del primer ##, con o sin >', () => {
      const quoted = [
        '> **Estado:** `open`',
        '> **Espera:** victor',
        '> **Qué espera:** que apruebe el **texto** del `aviso`',
        '',
        '## Descripción',
        '',
        '> **Qué espera:** otra cosa',
      ].join('\n');
      expect(waitingNote(quoted)).toBe('que apruebe el texto del aviso');
      expect(waitingNote('**Estado:** open\r\n**Que espera:** el visto bueno\r\n')).toBe(
        'el visto bueno',
      );
    });

    it('vacía si no hay, o si solo está después del primer ##', () => {
      expect(waitingNote('')).toBe('');
      expect(waitingNote('> **Espera:** victor\n\n## Notas\n**Qué espera:** tarde')).toBe('');
      expect(waitingNote('> **Qué esperaba:** no')).toBe('');
    });
  });
});
