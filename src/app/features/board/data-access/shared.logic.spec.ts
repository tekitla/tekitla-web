import { describe, expect, it } from 'vitest';

import type { ShareLink, SharedIssue, SharedProjectView } from '@/app/api';
import { buildColumns } from './board.logic';
import {
  isPanelScope,
  shareLinkState,
  shareUrl,
  sharedActorKey,
  sharedActorViews,
  sharedLink,
  sharedWaitingNotes,
  toBoardIssues,
  toBoardLabels,
  toBoardStatuses,
} from './shared.logic';

const issue = (number: number, patch: Partial<SharedIssue> = {}): SharedIssue => ({
  number,
  title: `Issue ${number}`,
  description: '',
  waitingNote: '',
  state: 'ISSUE_STATE_TODO',
  priority: 'PRIORITY_MEDIUM',
  statusId: 'todo',
  labelIds: [],
  assignee: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
  ...patch,
});

const view: SharedProjectView = {
  project: { key: 'DEMO', name: 'Demo', description: '' },
  scope: 'SHARE_LINK_SCOPE_PANEL',
  statuses: [
    {
      id: 'todo',
      name: 'Por hacer',
      category: 'ISSUE_STATE_TODO',
      color: 'LABEL_COLOR_NEUTRAL',
      wipLimit: 0,
      hidden: false,
    },
    {
      id: 'doing',
      name: 'En curso',
      category: 'ISSUE_STATE_IN_PROGRESS',
      color: 'LABEL_COLOR_INFO',
      wipLimit: 3,
      hidden: false,
    },
    {
      id: 'hold',
      name: 'En pausa',
      category: 'ISSUE_STATE_TODO',
      color: 'LABEL_COLOR_WARNING',
      wipLimit: 0,
      hidden: true,
    },
  ],
  labels: [{ id: 'l1', name: 'perfil/escuela', color: 'LABEL_COLOR_INFO' }],
};

describe('shared.logic', () => {
  it('rutas del enlace y alcance', () => {
    expect(sharedLink('tks_x', 'issues', 4)).toEqual(['/compartido', 'tks_x', 'issues', 4]);
    expect(isPanelScope('SHARE_LINK_SCOPE_PANEL')).toBe(true);
    expect(isPanelScope('SHARE_LINK_SCOPE_PLAN')).toBe(false);
    expect(isPanelScope('SHARE_LINK_SCOPE_UNSPECIFIED')).toBe(false);
  });

  it('convierte los issues al tablero conservando el orden en que llegaron', () => {
    const agent = {
      kind: 'ACTOR_KIND_AGENT' as const,
      displayName: 'Codex PC-01',
      tool: 'AGENT_TOOL_CODEX' as const,
    };
    const issues = toBoardIssues([issue(9, { assignee: agent }), issue(2), issue(5)]);
    expect(issues.map((i) => i.number)).toEqual([9, 2, 5]);
    expect(issues.map((i) => i.rank)).toEqual([...issues.map((i) => i.rank)].sort());
    expect(issues[0]).toMatchObject({
      id: 'shared-9',
      discard: null,
      sourceKey: '',
      projectId: '',
    });
    expect(issues[0].assigneeActorId).toBe(sharedActorKey(agent));
    expect(issues[1].assigneeActorId).toBe('');
    // Con buildColumns quedan en ese mismo orden.
    const columns = buildColumns(issues, toBoardStatuses(view));
    expect(columns.map((c) => c.status.id)).toEqual(['todo', 'doing']);
    expect(columns[0].issues.map((i) => i.number)).toEqual([9, 2, 5]);
  });

  it('asignados: agente con su herramienta, persona con su nombre o «?»', () => {
    const views = sharedActorViews([
      issue(1, {
        assignee: {
          kind: 'ACTOR_KIND_AGENT',
          displayName: 'Codex PC-01',
          tool: 'AGENT_TOOL_CODEX',
        },
      }),
      issue(2, {
        assignee: {
          kind: 'ACTOR_KIND_PERSON',
          displayName: 'Ana Pérez',
          tool: 'AGENT_TOOL_UNSPECIFIED',
        },
      }),
      issue(3, {
        assignee: { kind: 'ACTOR_KIND_PERSON', displayName: '', tool: 'AGENT_TOOL_UNSPECIFIED' },
      }),
    ]);
    const [agent, person, nameless] = [...views.values()];
    expect(agent).toMatchObject({
      kind: 'agent',
      name: 'Codex PC-01',
      tool: 'AGENT_TOOL_CODEX',
      revoked: false,
    });
    expect(person).toMatchObject({ kind: 'person', name: 'Ana Pérez', initials: 'AP' });
    expect(nameless).toMatchObject({ kind: 'person', name: '', initials: '?' });
  });

  it('«Qué espera» por número, solo los que lo traen', () => {
    const notes = sharedWaitingNotes([issue(1, { waitingNote: 'la firma' }), issue(2)]);
    expect(notes.get(1)).toBe('la firma');
    expect(notes.has(2)).toBe(false);
  });

  it('estados y etiquetas con los tipos del tablero', () => {
    expect(toBoardStatuses(view).map((s) => s.rank)).toEqual(['000000', '000001', '000002']);
    expect(toBoardLabels(view)).toEqual([
      {
        id: 'l1',
        projectId: '',
        name: 'perfil/escuela',
        color: 'LABEL_COLOR_INFO',
        countsAsValue: false,
      },
    ]);
  });

  it('URL del enlace y estado en la lista', () => {
    expect(shareUrl('https://tekitla.victorrb1015.com/', 'tks_a-b_c')).toBe(
      'https://tekitla.victorrb1015.com/compartido/tks_a-b_c',
    );
    const now = new Date('2026-11-18T12:00:00Z');
    const link: ShareLink = {
      id: 's1',
      projectId: 'p1',
      scope: 'SHARE_LINK_SCOPE_PLAN',
      note: 'jefe',
      createdAt: '2026-11-01T00:00:00Z',
      expiresAt: '',
      lastUsedAt: '',
      revokedAt: '',
      ownerDisplayName: '',
    };
    expect(shareLinkState(link, now)).toBe('active');
    expect(shareLinkState({ ...link, expiresAt: '2026-12-01T00:00:00Z' }, now)).toBe('active');
    expect(shareLinkState({ ...link, expiresAt: '2026-11-18T12:00:00Z' }, now)).toBe('expired');
    expect(shareLinkState({ ...link, revokedAt: '2026-11-10T00:00:00Z' }, now)).toBe('revoked');
  });
});
