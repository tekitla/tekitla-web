import type * as pb from '@tekitla/tekitla-protos/issues/v1/issues_pb';

/**
 * Contratos del `IssueService` de Tekitla tal como los expone el gateway
 * (grpc-gateway) en JSON. Se derivan de los tipos de `@tekitla/tekitla-protos`
 * (solo tipos: nada de protobuf-es llega al bundle), así que si el proto suma,
 * quita o renombra un campo, `npm run typecheck` falla hasta actualizar los
 * mappers.
 *
 * Reglas del JSON de grpc-gateway:
 * - campos en lowerCamelCase; enums como string (`ISSUE_STATE_TODO`);
 * - timestamps en RFC 3339;
 * - los campos con valor por defecto pueden venir OMITIDOS. Por eso hay dos
 *   juegos de tipos: los `Raw*` (todo opcional, lo que llega por la red) y los
 *   normalizados (todo presente), que son los que usa la app. La conversión está
 *   en `issues.mappers.ts`.
 */

/** Campos de un mensaje de protobuf-es, sin los internos (`$typeName`, `$unknown`). */
type Fields<M> = Omit<M, '$typeName' | '$unknown'>;

/**
 * Forma JSON normalizada de un mensaje: todos sus campos presentes, con los que
 * cambian de tipo en JSON (enums, timestamps) reemplazados por `Over`. `Over`
 * solo acepta campos que existen en el mensaje.
 */
type Json<M, Over extends Partial<Record<keyof Fields<M>, unknown>> = object> = {
  [K in keyof Fields<M>]-?: K extends keyof Over ? Over[K] : Fields<M>[K];
};

/** Categoría del estado. CANCELED = descartado (cerrado sin hacerse). */
export type IssueState = `ISSUE_STATE_${keyof typeof pb.IssueState}`;

/**
 * Columnas del tablero (UNSPECIFIED es INVALID_ARGUMENT en MoveIssue; los
 * descartados no se muestran en el tablero).
 */
export type BoardState = Exclude<IssueState, 'ISSUE_STATE_UNSPECIFIED' | 'ISSUE_STATE_CANCELED'>;

export const BOARD_STATES: readonly BoardState[] = [
  'ISSUE_STATE_TODO',
  'ISSUE_STATE_IN_PROGRESS',
  'ISSUE_STATE_DONE',
];

export type Priority = `PRIORITY_${keyof typeof pb.Priority}`;

/** Prioridades elegibles al crear, de menor a mayor. */
export const PRIORITIES: readonly Exclude<Priority, 'PRIORITY_UNSPECIFIED'>[] = [
  'PRIORITY_LOW',
  'PRIORITY_MEDIUM',
  'PRIORITY_HIGH',
  'PRIORITY_URGENT',
];

/** Timestamps en RFC 3339; vacío si no vino. */
interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

/**
 * Proyecto. `key`: 2 a 10 mayúsculas/dígitos, empieza con letra (p. ej. `TK`).
 * `workspaceId`: espacio de trabajo dueño (hoy, el personal del usuario).
 */
export type Project = Json<pb.Project, Timestamps>;

/**
 * Issue. `number`: correlativo dentro del proyecto, desde 1 (`TK-42`).
 * `description`: Markdown. `rank`: posición en el orden manual, opaca (se
 * compara como string; vacío si no vino).
 */
export type Issue = Json<pb.Issue, Timestamps & { state: IssueState; priority: Priority }>;

/** Paginación por cursor opaco. `limit <= 0` usa el default del servicio. */
export type PageRequest = Partial<Json<pb.PageRequest>>;

export type PageResponse = Json<pb.PageResponse>;

// ── Requests ──────────────────────────────────────────────────────────────

/** POST /v1/projects. Sin `workspaceId`: el espacio personal del usuario. */
export type CreateProjectRequest = Pick<
  Json<pb.CreateProjectRequest>,
  'key' | 'name' | 'description'
>;

/** GET /v1/projects/{projectId}/issues */
export interface ListIssuesRequest {
  /** Sin estado (o UNSPECIFIED): todos. */
  state?: IssueState;
  page?: PageRequest;
}

/** POST /v1/projects/{projectId}/issues — se crea en ISSUE_STATE_TODO. */
export type CreateIssueRequest = Pick<
  Json<pb.CreateIssueRequest, { priority: Priority }>,
  'title' | 'description' | 'priority'
>;

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
