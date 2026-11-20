import { describe, expect, it } from 'vitest';

import type { IssueLink } from '@/app/api';
import { toIssueLink } from '@/app/api/clients/issues/repos.mappers';
import { githubInstallUrl, linksByIssue, parseGithubSetup, summarizeLinks } from './repos.logic';

function link(over: Partial<IssueLink> = {}): IssueLink {
  return { ...toIssueLink({ id: 'l1', issueNumber: 9, branch: 'feat/tk-9-login' }), ...over };
}

describe('summarizeLinks', () => {
  it('sin ramas: null', () => {
    expect(summarizeLinks([])).toBeNull();
  });

  it('una rama sin PR', () => {
    expect(summarizeLinks([link()])).toEqual({
      branches: 1,
      pr: 'PR_STATE_NONE',
      ci: 'CI_STATUS_NONE',
      review: false,
    });
  });

  it('PR abierto con CI fallido gana a uno fusionado en verde (CU-016-4)', () => {
    const s = summarizeLinks([
      link({ prState: 'PR_STATE_MERGED', ciStatus: 'CI_STATUS_SUCCESS' }),
      link({
        id: 'l2',
        prState: 'PR_STATE_OPEN',
        ciStatus: 'CI_STATUS_FAILED',
        reviewRequested: true,
      }),
    ]);
    expect(s).toEqual({ branches: 2, pr: 'PR_STATE_OPEN', ci: 'CI_STATUS_FAILED', review: true });
  });

  it('el CI de un PR fusionado no cuenta', () => {
    const s = summarizeLinks([link({ prState: 'PR_STATE_MERGED', ciStatus: 'CI_STATUS_FAILED' })]);
    expect(s?.ci).toBe('CI_STATUS_NONE');
  });

  it('las ramas borradas no se cuentan si hay otras', () => {
    const s = summarizeLinks([link({ branchDeleted: true }), link({ id: 'l2' })]);
    expect(s?.branches).toBe(1);
  });
});

describe('linksByIssue', () => {
  it('agrupa por número', () => {
    const m = linksByIssue([link(), link({ id: 'l2', issueNumber: 3 }), link({ id: 'l3' })]);
    expect(m.get(9)?.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(m.get(3)?.length).toBe(1);
  });
});

describe('githubInstallUrl', () => {
  it('agrega el proyecto en state', () => {
    expect(
      githubInstallUrl(
        'https://github.com/apps/tekitla-qa/installations/new',
        '11111111-2222-4333-8444-555555555555',
      ),
    ).toBe(
      'https://github.com/apps/tekitla-qa/installations/new?state=11111111-2222-4333-8444-555555555555',
    );
  });

  it('otra URL o sin proyecto: vacía', () => {
    expect(githubInstallUrl('https://ejemplo.invalid/x', 'p')).toBe('');
    expect(githubInstallUrl('', 'p')).toBe('');
    expect(githubInstallUrl('https://github.com/apps/x/installations/new', '')).toBe('');
  });
});

describe('parseGithubSetup', () => {
  const params = (q: string) => new URLSearchParams(q);
  it('lee installation_id y state', () => {
    expect(
      parseGithubSetup(
        params(
          'installation_id=77&setup_action=install&state=11111111-2222-4333-8444-555555555555',
        ),
      ),
    ).toEqual({ installationId: '77', projectId: '11111111-2222-4333-8444-555555555555' });
  });

  it('valores sin forma: null', () => {
    expect(
      parseGithubSetup(params('installation_id=abc&state=11111111-2222-4333-8444-555555555555')),
    ).toBeNull();
    expect(parseGithubSetup(params('installation_id=77&state=../otro'))).toBeNull();
    expect(parseGithubSetup(params(''))).toBeNull();
  });
});
