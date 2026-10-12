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
 * - un `oneof` llega como el campo del caso que vino (`{"titleChanged": {...}}`);
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

/**
 * Categoría de un estado (fija, la entienden todos los clientes). CANCELED =
 * descartado (cerrado sin hacerse). Cada proyecto define sus estados concretos
 * (`Status`, las columnas del tablero) y cada uno pertenece a una categoría.
 */
export type IssueState = `ISSUE_STATE_${keyof typeof pb.IssueState}`;

/** Categorías elegibles para un estado (UNSPECIFIED es INVALID_ARGUMENT). */
export type StatusCategory = Exclude<IssueState, 'ISSUE_STATE_UNSPECIFIED'>;

export const STATUS_CATEGORIES: readonly StatusCategory[] = [
  'ISSUE_STATE_TODO',
  'ISSUE_STATE_IN_PROGRESS',
  'ISSUE_STATE_DONE',
  'ISSUE_STATE_CANCELED',
];

export type Priority = `PRIORITY_${keyof typeof pb.Priority}`;

/** Prioridades elegibles al crear o editar, de menor a mayor. */
export const PRIORITIES: readonly Exclude<Priority, 'PRIORITY_UNSPECIFIED'>[] = [
  'PRIORITY_LOW',
  'PRIORITY_MEDIUM',
  'PRIORITY_HIGH',
  'PRIORITY_URGENT',
];

/** Color de una etiqueta: un tono del design system, no un valor libre. */
export type LabelColor = `LABEL_COLOR_${keyof typeof pb.LabelColor}`;

/** Colores elegibles (UNSPECIFIED se guarda como NEUTRAL). */
export const LABEL_COLORS: readonly Exclude<LabelColor, 'LABEL_COLOR_UNSPECIFIED'>[] = [
  'LABEL_COLOR_NEUTRAL',
  'LABEL_COLOR_INFO',
  'LABEL_COLOR_SUCCESS',
  'LABEL_COLOR_WARNING',
  'LABEL_COLOR_DANGER',
  'LABEL_COLOR_ACCENT',
  'LABEL_COLOR_BRAND',
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
 * compara como string; vacío si no vino). `statusId`: su estado (columna);
 * `state` es la categoría de ese estado. `labelIds`: ordenadas por nombre.
 */
export type Issue = Json<pb.Issue, Timestamps & { state: IssueState; priority: Priority }>;

/**
 * Estado concreto del proyecto: una columna del tablero. `name`: único en el
 * proyecto, 1 a 40 caracteres. `rank`: orden de las columnas, opaco (como el
 * de los issues). La categoría no cambia después de crearlo.
 */
export type Status = Json<pb.Status, { category: IssueState }>;

/** Etiqueta del proyecto. `name`: única en el proyecto, 1 a 40 caracteres. */
export type Label = Json<pb.Label, { color: LabelColor }>;

/** Comentario (Markdown, 1 a 10 000 caracteres). `authorId`: uid del autor. */
export type Comment = Json<pb.Comment, { createdAt: string }>;

/**
 * Qué cambió en un evento del historial (el `oneof change` del proto). Los
 * nombres de estados y etiquetas son los del momento del cambio.
 */
export type IssueChange =
  | { kind: 'created' }
  | ({ kind: 'statusChanged' } & Json<
      pb.StatusChanged,
      { fromState: IssueState; toState: IssueState }
    >)
  | ({ kind: 'titleChanged' } & Json<pb.TitleChanged>)
  | { kind: 'descriptionChanged' }
  | ({ kind: 'priorityChanged' } & Json<pb.PriorityChanged, { from: Priority; to: Priority }>)
  | ({ kind: 'labelsChanged' } & Json<pb.LabelsChanged>)
  | { kind: 'commented'; comment: Comment }
  /** Un cambio que esta versión del panel todavía no conoce. */
  | { kind: 'unknown' };

/** Evento del historial de un issue. `actorId`: uid de quien hizo el cambio. */
export type IssueEvent = Omit<Json<pb.IssueEvent, { createdAt: string }>, 'change'> & {
  change: IssueChange;
};

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

/**
 * POST /v1/projects/{projectId}/issues/{number}:move. `statusId`: estado
 * destino. Lugar en la columna destino tal como la ve el cliente: debajo de
 * `afterNumber` y arriba de `beforeNumber` (0 o ausente = sin vecino de ese
 * lado; los dos ausentes conservan el rank). Vecinos que ya no cuadran →
 * FAILED_PRECONDITION (vista vieja: recargar).
 */
export type MoveIssueRequest = Pick<Json<pb.MoveIssueRequest>, 'statusId'> &
  Partial<Pick<Json<pb.MoveIssueRequest>, 'afterNumber' | 'beforeNumber'>>;

/**
 * PATCH /v1/projects/{projectId}/issues/{number}. Solo cambia lo que viene;
 * `labelIds` reemplaza las etiquetas del issue.
 */
export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  priority?: Exclude<Priority, 'PRIORITY_UNSPECIFIED'>;
  labelIds?: string[];
}

/** POST /v1/projects/{projectId}/statuses. Sin `afterStatusId`: al final. */
export interface CreateStatusRequest {
  name: string;
  category: StatusCategory;
  afterStatusId?: string;
}

/**
 * PATCH /v1/projects/{projectId}/statuses/{statusId}. Solo cambia lo que
 * viene. `afterStatusId` lo reubica después de ese estado; `''`, al principio.
 */
export interface UpdateStatusRequest {
  name?: string;
  afterStatusId?: string;
}

/** POST /v1/projects/{projectId}/labels */
export type CreateLabelRequest = Pick<Label, 'name' | 'color'>;

/** PATCH /v1/projects/{projectId}/labels/{labelId}. Solo cambia lo que viene. */
export type UpdateLabelRequest = Partial<CreateLabelRequest>;

// ── Respuestas normalizadas ───────────────────────────────────────────────

export interface ListProjectsResponse {
  projects: Project[];
  page: PageResponse;
}

export interface ListIssuesResponse {
  issues: Issue[];
  page: PageResponse;
}

export interface ListIssueEventsResponse {
  events: IssueEvent[];
  page: PageResponse;
}

// ── JSON crudo (campos con default pueden faltar) ─────────────────────────

/** Campos de un caso del `oneof change`, sin `kind` y todos opcionales. */
type RawChange<K extends IssueChange['kind']> = Partial<
  Omit<Extract<IssueChange, { kind: K }>, 'kind'>
>;

export type RawProject = Partial<Project>;
export type RawIssue = Partial<Omit<Issue, 'number'>> & { number?: number | string };
export type RawPageResponse = Partial<PageResponse>;
export type RawStatus = Partial<Status>;
export type RawLabel = Partial<Label>;
export type RawComment = Partial<Comment>;

/** Evento crudo: del `oneof change` viene a lo sumo uno de estos campos. */
export interface RawIssueEvent {
  id?: string;
  issueId?: string;
  actorId?: string;
  createdAt?: string;
  created?: object;
  statusChanged?: RawChange<'statusChanged'>;
  titleChanged?: RawChange<'titleChanged'>;
  descriptionChanged?: object;
  priorityChanged?: RawChange<'priorityChanged'>;
  labelsChanged?: RawChange<'labelsChanged'>;
  commented?: RawComment;
}

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

export interface RawListStatusesResponse {
  statuses?: RawStatus[];
}

export interface RawStatusEnvelope {
  status?: RawStatus;
}

export interface RawListLabelsResponse {
  labels?: RawLabel[];
}

export interface RawLabelEnvelope {
  label?: RawLabel;
}

export interface RawCommentEnvelope {
  comment?: RawComment;
}

export interface RawListIssueEventsResponse {
  events?: RawIssueEvent[];
  page?: RawPageResponse;
}
