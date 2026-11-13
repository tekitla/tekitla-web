import { describe, expect, it } from 'vitest';

import type { Actor } from '@/app/api';
import { toActorViews } from './actors.logic';

const actor = (patch: Partial<Actor>): Actor => ({
  id: 'x',
  kind: 'ACTOR_KIND_PERSON',
  displayName: '',
  ownerActorId: '',
  tool: 'AGENT_TOOL_UNSPECIFIED',
  createdAt: '',
  revokedAt: '',
  userId: '',
  ...patch,
});

describe('toActorViews', () => {
  const user = { uid: 'uid-1', email: 'ana@example.com', displayName: 'Ana Torres' };

  it('la persona sin nombre toma el de la sesión, y su agente lo muestra como dueño', () => {
    const views = toActorViews(
      [
        actor({ id: 'p', userId: 'uid-1' }),
        actor({
          id: 'a',
          kind: 'ACTOR_KIND_AGENT',
          displayName: 'Codex PC-01',
          ownerActorId: 'p',
          tool: 'AGENT_TOOL_CODEX',
          revokedAt: '2026-11-01T00:00:00Z',
        }),
      ],
      user,
    );
    expect(views.get('p')).toMatchObject({ kind: 'person', name: 'Ana Torres', initials: 'AT' });
    expect(views.get('a')).toEqual({
      id: 'a',
      kind: 'agent',
      name: 'Codex PC-01',
      initials: 'CP',
      tool: 'AGENT_TOOL_CODEX',
      ownerName: 'Ana Torres',
      revoked: true,
    });
  });

  it('el nombre del servicio manda; sin nombre ni sesión queda vacío', () => {
    const views = toActorViews(
      [
        actor({ id: 'p', userId: 'uid-1', displayName: 'Victor' }),
        actor({ id: 'q', userId: 'otro' }),
      ],
      user,
    );
    expect(views.get('p')?.name).toBe('Victor');
    expect(views.get('q')).toMatchObject({ name: '', initials: '?' });
    expect(toActorViews([actor({ id: 'p', userId: 'uid-1' })], null).get('p')?.name).toBe('');
  });

  it('sin nombre de Firebase usa el correo', () => {
    const views = toActorViews([actor({ id: 'p', userId: 'uid-1' })], {
      ...user,
      displayName: null,
    });
    expect(views.get('p')).toMatchObject({ name: 'ana@example.com', initials: 'AN' });
  });

  it('iniciales como el avatar del shell, también con una @ en el nombre', () => {
    const views = toActorViews(
      [
        actor({ id: 'a', displayName: 'Ana @ QA' }),
        actor({ id: 'b', displayName: 'victor' }),
        actor({ id: 'c', kind: 'ACTOR_KIND_AGENT', displayName: 'Codex PC-01' }),
      ],
      null,
    );
    expect(views.get('a')?.initials).toBe('A@');
    expect(views.get('b')?.initials).toBe('VI');
    expect(views.get('c')?.initials).toBe('CP');
  });
});
