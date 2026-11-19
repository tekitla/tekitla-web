import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShareLinksClient, toDomainError } from '@/app/api';
import type { ShareLink } from '@/app/api';
import { ShareLinksStore } from './share-links.store';

const link = (id: string, patch: Partial<ShareLink> = {}): ShareLink => ({
  id,
  projectId: 'p1',
  scope: 'SHARE_LINK_SCOPE_PLAN',
  note: 'jefe',
  createdAt: '2026-11-18T00:00:00Z',
  expiresAt: '',
  lastUsedAt: '',
  revokedAt: '',
  ownerDisplayName: 'Victor',
  ...patch,
});

describe('ShareLinksStore', () => {
  let client: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let store: ShareLinksStore;

  beforeEach(() => {
    client = { list: vi.fn(), create: vi.fn(), revoke: vi.fn() };
    TestBed.configureTestingModule({
      providers: [ShareLinksStore, { provide: ShareLinksClient, useValue: client }],
    });
    store = TestBed.inject(ShareLinksStore);
  });

  it('lista, crea arriba (el token sale una vez) y revoca en el lugar', async () => {
    client.list.mockReturnValue(of([link('s1')]));
    store.load('p1');
    expect(client.list).toHaveBeenCalledWith('p1');
    expect(store.links().map((l) => l.id)).toEqual(['s1']);

    client.create.mockReturnValue(
      of({ shareLink: link('s2', { note: 'compañero' }), token: 'tks_x' }),
    );
    const token = await firstValueFrom(
      store.create({
        scope: 'SHARE_LINK_SCOPE_PANEL',
        duration: 'SHARE_LINK_DURATION_NEVER',
        note: 'compañero',
        ownerDisplayName: '',
      }),
    );
    expect(token).toBe('tks_x');
    expect(client.create).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ note: 'compañero' }),
    );
    expect(store.links().map((l) => l.id)).toEqual(['s2', 's1']);
    expect(JSON.stringify(store.links())).not.toContain('tks_x');

    client.revoke.mockReturnValue(of(link('s1', { revokedAt: '2026-11-18T12:00:00Z' })));
    await firstValueFrom(store.revoke('s1'));
    expect(client.revoke).toHaveBeenCalledWith('p1', 's1');
    expect(store.links()[1].revokedAt).not.toBe('');
  });

  it('el tope de 20 vigentes se distingue de otro error', async () => {
    client.list.mockReturnValue(of([]));
    store.load('p1');
    const limit = toDomainError(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'FAILED_PRECONDITION', reason: 'SHARE_LINK_LIMIT' } },
      }),
    );
    client.create.mockReturnValue(throwError(() => limit));
    await expect(
      firstValueFrom(
        store.create({
          scope: 'SHARE_LINK_SCOPE_PLAN',
          duration: 'SHARE_LINK_DURATION_SEVEN_DAYS',
          note: 'x',
          ownerDisplayName: '',
        }),
      ),
    ).rejects.toBe(limit);
    expect(store.error()).toBe('limit');

    client.create.mockReturnValue(throwError(() => toDomainError(new Error('offline'))));
    await expect(
      firstValueFrom(
        store.create({
          scope: 'SHARE_LINK_SCOPE_PLAN',
          duration: 'SHARE_LINK_DURATION_SEVEN_DAYS',
          note: 'x',
          ownerDisplayName: '',
        }),
      ),
    ).rejects.toBeTruthy();
    expect(store.error()).toBe('create');
  });

  it('un error al cargar queda en error', () => {
    client.list.mockReturnValue(throwError(() => toDomainError(new Error('offline'))));
    store.load('p1');
    expect(store.loaded()).toBe(true);
    expect(store.error()).toBe('load');
  });

  it('otro FAILED_PRECONDITION (con otro reason) no se muestra como el tope', async () => {
    client.list.mockReturnValue(of([]));
    store.load('p1');
    const other = toDomainError(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'FAILED_PRECONDITION', reason: 'PROJECT_ARCHIVED' } },
      }),
    );
    client.create.mockReturnValue(throwError(() => other));
    await expect(
      firstValueFrom(
        store.create({
          scope: 'SHARE_LINK_SCOPE_PLAN',
          duration: 'SHARE_LINK_DURATION_SEVEN_DAYS',
          note: 'x',
          ownerDisplayName: '',
        }),
      ),
    ).rejects.toBe(other);
    expect(store.error()).toBe('create');
  });

  it('cargar el mismo proyecto dos veces seguidas descarta la respuesta vieja', () => {
    client.list.mockReturnValueOnce(of([link('viejo')])).mockReturnValueOnce(of([link('s1')]));
    store.load('p1');
    store.load('p1');
    expect(store.links().map((l) => l.id)).toEqual(['s1']);
  });
});
