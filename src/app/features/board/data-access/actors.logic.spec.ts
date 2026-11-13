import { describe, expect, it } from 'vitest';

import type { Actor } from '@/app/api';
import { initialsOf, toActorViews } from './actors.logic';

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

describe('initialsOf', () => {
  it('dos palabras, una, correo, vacío', () => {
    expect(initialsOf('Ana Torres')).toBe('AT');
    expect(initialsOf('  luis   m. pérez ')).toBe('LM');
    expect(initialsOf('Codex PC-01')).toBe('CP');
    expect(initialsOf('victor')).toBe('VI');
    expect(initialsOf('ana.torres@example.com')).toBe('AT');
    expect(initialsOf('')).toBe('?');
  });

  it('respeta letras fuera de ASCII', () => {
    expect(initialsOf('óscar ñúñez')).toBe('ÓÑ');
  });
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
});
