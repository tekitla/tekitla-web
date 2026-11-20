import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReposClient, toDomainError } from '@/app/api';
import type { Connection, IssueLink } from '@/app/api';
import { toConnection, toIssueLink, toRepository } from '@/app/api/clients/issues/repos.mappers';
import { ReposStore } from './repos.store';

// Datos inventados: org acme, repo api.
const conn = (over: Partial<Connection> = {}): Connection => ({
  ...toConnection({
    id: 'c1',
    projectId: 'p1',
    provider: 'REPO_PROVIDER_GITHUB',
    host: 'github.com',
    owner: 'acme',
    scope: 'CONNECTION_SCOPE_TOPIC',
    topic: 'tekitla',
    repositoryCount: 1,
  }),
  ...over,
});
const repo = toRepository({ id: 'r1', connectionId: 'c1', owner: 'acme', name: 'api' });
const link = (over: Partial<IssueLink> = {}): IssueLink => ({
  ...toIssueLink({ id: 'l1', issueNumber: 9, branch: 'feat/tk-9-login', repo }),
  ...over,
});

describe('ReposStore', () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let store: ReposStore;

  beforeEach(() => {
    client = {
      listConnections: vi.fn(),
      listRepositories: vi.fn().mockReturnValue(of([repo])),
      listIssueLinks: vi.fn().mockReturnValue(of([])),
      connectGithub: vi.fn(),
      updateConnection: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      linkIssue: vi.fn(),
      unlinkIssue: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [ReposStore, { provide: ReposClient, useValue: client }],
    });
    store = TestBed.inject(ReposStore);
  });

  it('carga conexiones, repos y la URL de instalación', () => {
    client['listConnections'].mockReturnValue(
      of({
        connections: [conn()],
        githubInstallUrl: 'https://github.com/apps/x/installations/new',
        gitlabEnabled: false,
      }),
    );
    store.load('p1');
    expect(store.connections().map((c) => c.owner)).toEqual(['acme']);
    expect(store.repositories().map((r) => r.name)).toEqual(['api']);
    expect(store.installUrl()).toContain('github.com/apps/x');
    expect(store.loaded()).toBe(true);
  });

  it('conecta GitHub con el installation id y el alcance', async () => {
    client['listConnections'].mockReturnValue(
      of({ connections: [], githubInstallUrl: '', gitlabEnabled: false }),
    );
    store.load('p1');
    client['connectGithub'].mockReturnValue(of({ connection: conn(), repositories: [repo] }));
    const c = await firstValueFrom(
      store.connectGithub('77', { scope: 'CONNECTION_SCOPE_TOPIC', topic: 'tekitla' }),
    );
    expect(c.owner).toBe('acme');
    expect(client['connectGithub']).toHaveBeenCalledWith('p1', {
      installationId: '77',
      scope: 'CONNECTION_SCOPE_TOPIC',
      topic: 'tekitla',
    });
    expect(store.connections().length).toBe(1);
  });

  it('traduce los motivos de error al conectar', async () => {
    client['listConnections'].mockReturnValue(
      of({ connections: [], githubInstallUrl: '', gitlabEnabled: false }),
    );
    store.load('p1');
    const cases: [string, string][] = [
      ['GITHUB_INSTALLATION_NOT_FOUND', 'installation'],
      ['CONNECTION_EXISTS', 'exists'],
      ['GITHUB_NOT_ENABLED', 'disabled'],
    ];
    for (const [reason, want] of cases) {
      client['connectGithub'].mockReturnValue(
        throwError(() =>
          toDomainError(
            new HttpErrorResponse({
              status: 400,
              error: { error: { code: 'FAILED_PRECONDITION', reason } },
            }),
          ),
        ),
      );
      await expect(
        firstValueFrom(store.connectGithub('77', { scope: 'CONNECTION_SCOPE_ALL' })),
      ).rejects.toBeTruthy();
      expect(store.error()).toBe(want);
    }
  });

  it('links del proyecto por issue, ligar y quitar', async () => {
    client['listIssueLinks'].mockReturnValue(of([link(), link({ id: 'l2', issueNumber: 3 })]));
    store.loadLinks('p1');
    expect(store.linksByIssue().get(9)?.length).toBe(1);

    client['linkIssue'].mockReturnValue(of(link({ id: 'l3', branch: 'spike/x' })));
    await firstValueFrom(store.link(9, 'r1', 'spike/x'));
    expect(client['linkIssue']).toHaveBeenCalledWith('p1', 9, {
      repositoryId: 'r1',
      branch: 'spike/x',
    });
    expect(
      store
        .linksByIssue()
        .get(9)
        ?.map((l) => l.id),
    ).toEqual(['l1', 'l3']);

    client['unlinkIssue'].mockReturnValue(of(undefined));
    await firstValueFrom(store.unlink(9, 'l1'));
    expect(
      store
        .linksByIssue()
        .get(9)
        ?.map((l) => l.id),
    ).toEqual(['l3']);
  });

  it('los links de un issue reemplazan solo los de ese issue', () => {
    client['listIssueLinks'].mockReturnValueOnce(of([link(), link({ id: 'l2', issueNumber: 3 })]));
    store.loadLinks('p1');
    client['listIssueLinks'].mockReturnValueOnce(
      of([link({ id: 'l9', ciStatus: 'CI_STATUS_FAILED' })]),
    );
    store.loadIssueLinks('p1', 9);
    expect(client['listIssueLinks']).toHaveBeenLastCalledWith('p1', 9);
    expect(
      store
        .linksByIssue()
        .get(9)
        ?.map((l) => l.id),
    ).toEqual(['l9']);
    expect(store.linksByIssue().get(3)?.length).toBe(1);
  });

  it('desconectar saca la conexión y sus repos', async () => {
    client['listConnections'].mockReturnValue(
      of({ connections: [conn()], githubInstallUrl: '', gitlabEnabled: false }),
    );
    store.load('p1');
    client['disconnect'].mockReturnValue(of(undefined));
    await firstValueFrom(store.disconnect('c1'));
    expect(store.connections()).toEqual([]);
    expect(store.repositories()).toEqual([]);
  });

  it('un error al cargar queda en error y loaded', () => {
    client['listConnections'].mockReturnValue(
      throwError(() => toDomainError(new Error('offline'))),
    );
    store.load('p1');
    expect(store.error()).toBe('load');
    expect(store.loaded()).toBe(true);
  });
});
