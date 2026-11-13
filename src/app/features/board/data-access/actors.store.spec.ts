import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Actor, IssuesClient } from '@/app/api';
import { SessionStore } from '@/app/core/auth/session.store';
import { UNKNOWN_ACTOR } from './actors.logic';
import { ActorsStore } from './actors.store';

const agent: Actor = {
  id: 'a1',
  kind: 'ACTOR_KIND_AGENT',
  displayName: 'Claude Code PC-01',
  ownerActorId: 'p1',
  tool: 'AGENT_TOOL_CLAUDE_CODE',
  createdAt: '',
  revokedAt: '',
  userId: '',
};

const person: Actor = {
  ...agent,
  id: 'p1',
  kind: 'ACTOR_KIND_PERSON',
  displayName: '',
  ownerActorId: '',
  tool: 'AGENT_TOOL_UNSPECIFIED',
  userId: 'uid-1',
};

describe('ActorsStore', () => {
  let listActors: ReturnType<typeof vi.fn>;
  let store: ActorsStore;

  beforeEach(() => {
    listActors = vi.fn();
    TestBed.configureTestingModule({
      providers: [ActorsStore, { provide: IssuesClient, useValue: { listActors } }],
    });
    store = TestBed.inject(ActorsStore);
  });

  it('pide los actores (con revocados) una sola vez', () => {
    const response = new Subject<Actor[]>();
    listActors.mockReturnValue(response);
    store.load();
    store.load();
    expect(listActors).toHaveBeenCalledTimes(1);
    expect(listActors).toHaveBeenCalledWith(true);
    // Mientras no llega, nadie es «desconocido».
    expect(store.view('a1')).toBeNull();
    expect(store.view('zz')).toBeNull();

    response.next([agent]);
    store.load();
    expect(listActors).toHaveBeenCalledTimes(1);
    expect(store.view('a1')).toMatchObject({ kind: 'agent', name: 'Claude Code PC-01' });
    expect(store.view('zz')).toBe(UNKNOWN_ACTOR);
    expect(store.view('')).toBeNull();
  });

  it('si falla, no muestra asignados y el próximo load reintenta', () => {
    listActors.mockReturnValueOnce(throwError(() => new Error('x')));
    store.load();
    expect(store.loaded()).toBe(false);
    expect(store.view('a1')).toBeNull();

    listActors.mockReturnValueOnce(of([agent]));
    store.load();
    expect(listActors).toHaveBeenCalledTimes(2);
    expect(store.view('a1')?.kind).toBe('agent');
  });

  it('el nombre de la persona sale de la sesión cuando el servicio no lo trae', () => {
    TestBed.inject(SessionStore).setUser({ uid: 'uid-1', email: null, displayName: 'Ana Torres' });
    listActors.mockReturnValue(of([person, agent]));
    store.load();
    expect(store.view('p1')).toMatchObject({ name: 'Ana Torres', initials: 'AT' });
    expect(store.view('a1')?.ownerName).toBe('Ana Torres');
  });
});
