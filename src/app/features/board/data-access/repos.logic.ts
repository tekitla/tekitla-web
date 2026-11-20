import type { CiStatus, IssueLink, PrState } from '@/app/api';

/**
 * Lógica pura de repos y ramas ligadas (issue 016): el resumen de la tarjeta
 * del tablero y la URL de instalación de la GitHub App.
 */

/** Resumen de las ramas de un issue para la tarjeta. */
export interface LinkSummary {
  /** Ramas ligadas (sin las borradas, salvo que estén todas borradas). */
  branches: number;
  /** El PR más relevante: abierto > borrador > fusionado > cerrado > ninguno. */
  pr: PrState;
  /** El peor CI de las ramas con PR abierto o sin PR. */
  ci: CiStatus;
  /** Alguna rama tiene una revisión pedida sin responder. */
  review: boolean;
}

const PR_WEIGHT: Record<PrState, number> = {
  PR_STATE_OPEN: 5,
  PR_STATE_DRAFT: 4,
  PR_STATE_MERGED: 3,
  PR_STATE_CLOSED: 2,
  PR_STATE_NONE: 1,
  PR_STATE_UNSPECIFIED: 0,
};

const CI_WEIGHT: Record<CiStatus, number> = {
  CI_STATUS_FAILED: 5,
  CI_STATUS_PENDING: 4,
  CI_STATUS_CANCELED: 3,
  CI_STATUS_SUCCESS: 2,
  CI_STATUS_NONE: 1,
  CI_STATUS_UNSPECIFIED: 0,
};

/** null si el issue no tiene ramas ligadas. */
export function summarizeLinks(links: readonly IssueLink[]): LinkSummary | null {
  const live = links.filter((l) => !l.branchDeleted);
  const all = live.length ? live : links;
  if (!all.length) return null;
  let pr: PrState = 'PR_STATE_UNSPECIFIED';
  let ci: CiStatus = 'CI_STATUS_UNSPECIFIED';
  let review = false;
  for (const l of all) {
    if (PR_WEIGHT[l.prState] > PR_WEIGHT[pr]) pr = l.prState;
    // El CI de un PR ya cerrado o fusionado no preocupa.
    const active = l.prState !== 'PR_STATE_MERGED' && l.prState !== 'PR_STATE_CLOSED';
    if (active && CI_WEIGHT[l.ciStatus] > CI_WEIGHT[ci]) ci = l.ciStatus;
    review ||= l.reviewRequested && l.prState === 'PR_STATE_OPEN';
  }
  return {
    branches: all.length,
    pr: pr === 'PR_STATE_UNSPECIFIED' ? 'PR_STATE_NONE' : pr,
    ci: ci === 'CI_STATUS_UNSPECIFIED' ? 'CI_STATUS_NONE' : ci,
    review,
  };
}

/** Agrupa los links del proyecto por número de issue. */
export function linksByIssue(links: readonly IssueLink[]): ReadonlyMap<number, IssueLink[]> {
  const out = new Map<number, IssueLink[]>();
  for (const l of links) {
    const list = out.get(l.issueNumber);
    if (list) list.push(l);
    else out.set(l.issueNumber, [l]);
  }
  return out;
}

/**
 * URL para instalar la GitHub App con el proyecto en `state`: GitHub lo
 * devuelve en la Setup URL (`/repositorios/github`). Solo una URL https de
 * github.com; si no, vacía.
 */
export function githubInstallUrl(base: string, projectId: string): string {
  if (!base.startsWith('https://github.com/') || !projectId) return '';
  const url = new URL(base);
  url.searchParams.set('state', projectId);
  return url.toString();
}

/** Lo que GitHub manda a la Setup URL. */
export type GithubSetup =
  /** Instalada (o reconfigurada): conectar o, si ya está, volver a Ajustes. */
  | { kind: 'install' | 'update'; installationId: string; projectId: string }
  /** Un miembro sin permisos pidió instalarla: falta que un admin la apruebe. */
  | { kind: 'request'; projectId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee la Setup URL de la App. null si falta algo o no tiene forma (no se
 * confía en estos valores: el servicio los valida igual).
 */
export function parseGithubSetup(params: { get(name: string): string | null }): GithubSetup | null {
  const installationId = params.get('installation_id') ?? '';
  const projectId = params.get('state') ?? '';
  const action = params.get('setup_action') ?? 'install';
  if (!UUID.test(projectId)) return null;
  if (action === 'request') return { kind: 'request', projectId };
  if (!/^[1-9][0-9]{0,18}$/.test(installationId)) return null;
  return { kind: action === 'update' ? 'update' : 'install', installationId, projectId };
}
