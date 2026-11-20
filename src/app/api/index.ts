// Superficie pública de la capa API. Las features importan desde '@/app/api'.
export { RestClient } from './clients/rest/rest.client';
export { joinApi } from './clients/rest/rest.endpoints';
export type { QueryParams, RestOptions } from './clients/rest/rest.contracts';
export type { ApiError } from './http/http-errors';
export { DomainError, isDomainError, toDomainError } from './http/http-errors';
export { SKIP_AUTH } from './http/tokens';

// IssueService de Tekitla (proyectos e issues), compartido por varias features.
export { IssuesClient, fetchPages } from './clients/issues/issues.client';
export type { Pages } from './clients/issues/issues.client';
export { LABEL_COLORS, PRIORITIES, STATUS_CATEGORIES } from './clients/issues/issues.contracts';
export type {
  Actor,
  ActorKind,
  AgentTool,
  BatchUpdateStatusesRequest,
  Comment,
  CreateIssueRequest,
  CreateLabelRequest,
  CreateProjectRequest,
  CreateStatusRequest,
  DiscardInfo,
  DiscardIssueRequest,
  Issue,
  IssueChange,
  IssueEvent,
  ListIssueEventsResponse,
  IssueOrder,
  IssueState,
  Label,
  ListIssuesRequest,
  ListIssuesResponse,
  LabelColor,
  MoveIssueRequest,
  Priority,
  Project,
  Status,
  StatusCategory,
  StatusDeletion,
  StatusSpec,
  UpdateIssueRequest,
  UpdateLabelRequest,
  UpdateStatusRequest,
} from './clients/issues/issues.contracts';

// Enlaces de solo lectura (issue 009): gestión con sesión y lectura pública.
export { ShareLinksClient, SharedClient } from './clients/issues/share.client';
export {
  SHARE_DURATIONS,
  SHARE_NOTE_MAX,
  SHARE_OWNER_NAME_MAX,
  SHARE_SCOPES,
} from './clients/issues/share.contracts';
export type {
  CreateShareLinkRequest,
  CreatedShareLink,
  ShareLink,
  ShareLinkDuration,
  ShareLinkScope,
  SharedActor,
  SharedIssue,
  SharedLabel,
  SharedProject,
  SharedProjectView,
  SharedStatus,
} from './clients/issues/share.contracts';

// Métricas de flujo (issue 036) y sesiones de agentes (issue 026).
export { MetricsClient } from './clients/issues/metrics.client';
export type {
  AgentSession,
  DurationStats,
  FlowMetrics,
  FlowMetricsRequest,
  FlowSummary,
  FlowWeek,
  ListAgentSessionsRequest,
  MetricConfidence,
  SessionStatus,
  StaleIssue,
  WaitingOn,
} from './clients/issues/metrics.contracts';
