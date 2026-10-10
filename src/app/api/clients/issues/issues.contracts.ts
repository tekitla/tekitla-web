/**
 * Contratos del `IssueService` de Tequio tal como los expone el gateway
 * (grpc-gateway) en JSON. Copiados de `tequio-protos/proto/issues/v1/issues.proto`:
 * si el proto cambia, se actualiza acá (y nunca se inventan campos).
 *
 * Reglas del JSON de grpc-gateway:
 * - campos en lowerCamelCase; enums como string (`ISSUE_STATE_TODO`);
 * - timestamps en RFC 3339;
 * - los campos con valor por defecto pueden venir OMITIDOS. Por eso hay dos
 *   juegos de tipos: los `Raw*` (todo opcional, lo que llega por la red) y los
 *   normalizados (todo presente), que son los que usa la app. La conversión está
 *   en `issues.mappers.ts`.
 */

/** Columnas del tablero. */
export type IssueState =
  'ISSUE_STATE_UNSPECIFIED' | 'ISSUE_STATE_TODO' | 'ISSUE_STATE_IN_PROGRESS' | 'ISSUE_STATE_DONE';

/** Estados que se pueden asignar (UNSPECIFIED es INVALID_ARGUMENT en MoveIssue). */
export type BoardState = Exclude<IssueState, 'ISSUE_STATE_UNSPECIFIED'>;

export const BOARD_STATES: readonly BoardState[] = [
  'ISSUE_STATE_TODO',
  'ISSUE_STATE_IN_PROGRESS',
  'ISSUE_STATE_DONE',
];

export type Priority =
  'PRIORITY_UNSPECIFIED' | 'PRIORITY_LOW' | 'PRIORITY_MEDIUM' | 'PRIORITY_HIGH' | 'PRIORITY_URGENT';

/** Prioridades elegibles al crear, de menor a mayor. */
export const PRIORITIES: readonly Exclude<Priority, 'PRIORITY_UNSPECIFIED'>[] = [
  'PRIORITY_LOW',
  'PRIORITY_MEDIUM',
  'PRIORITY_HIGH',
  'PRIORITY_URGENT',
];

export interface Project {
  id: string;
  /** 2 a 10 mayúsculas/dígitos, empieza con letra (p. ej. `TQ`). */
  key: string;
  name: string;
  description: string;
  /** RFC 3339; vacío si no vino. */
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  /** Correlativo dentro del proyecto, desde 1 (`TQ-42`). */
  number: number;
  title: string;
  /** Markdown. */
  description: string;
  state: IssueState;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

/** Paginación por cursor opaco. `limit <= 0` usa el default del servicio. */
export interface PageRequest {
  cursor?: string;
  limit?: number;
}

export interface PageResponse {
  nextCursor: string;
  hasNext: boolean;
}

// ── Requests ──────────────────────────────────────────────────────────────

/** POST /v1/projects */
export interface CreateProjectRequest {
  key: string;
  name: string;
  description: string;
}

/** GET /v1/projects/{projectId}/issues */
export interface ListIssuesRequest {
  /** Sin estado (o UNSPECIFIED): todos. */
  state?: IssueState;
  page?: PageRequest;
}

/** POST /v1/projects/{projectId}/issues — se crea en ISSUE_STATE_TODO. */
export interface CreateIssueRequest {
  title: string;
  description: string;
  /** UNSPECIFIED se guarda como MEDIUM. */
  priority: Priority;
}

// ── Respuestas normalizadas ───────────────────────────────────────────────

export interface ListProjectsResponse {
  projects: Project[];
  page: PageResponse;
}

export interface ListIssuesResponse {
  issues: Issue[];
  page: PageResponse;
}

// ── JSON crudo (campos con default pueden faltar) ─────────────────────────

export type RawProject = Partial<Project>;
export type RawIssue = Partial<Omit<Issue, 'number'>> & { number?: number | string };
export type RawPageResponse = Partial<PageResponse>;

export interface RawListProjectsResponse {
  projects?: RawProject[];
  page?: RawPageResponse;
}

export interface RawListIssuesResponse {
  issues?: RawIssue[];
  page?: RawPageResponse;
}

export interface RawProjectEnvelope {
  project?: RawProject;
}

export interface RawIssueEnvelope {
  issue?: RawIssue;
}
