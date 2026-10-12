// Superficie pública de la capa API. Las features importan desde '@/app/api'.
export { RestClient } from './clients/rest/rest.client';
export { joinApi } from './clients/rest/rest.endpoints';
export type { QueryParams, RestOptions } from './clients/rest/rest.contracts';
export type { ApiError } from './http/http-errors';
export { DomainError, isDomainError, toDomainError } from './http/http-errors';
export { SKIP_AUTH } from './http/tokens';

// IssueService de Tekitla (proyectos e issues), compartido por varias features.
export { IssuesClient, MAX_PAGES } from './clients/issues/issues.client';
export { LABEL_COLORS, PRIORITIES, STATUS_CATEGORIES } from './clients/issues/issues.contracts';
export type {
  Comment,
  CreateIssueRequest,
  CreateLabelRequest,
  CreateProjectRequest,
  CreateStatusRequest,
  Issue,
  IssueChange,
  IssueEvent,
  IssueState,
  Label,
  LabelColor,
  MoveIssueRequest,
  Priority,
  Project,
  Status,
  StatusCategory,
  UpdateIssueRequest,
  UpdateLabelRequest,
  UpdateStatusRequest,
} from './clients/issues/issues.contracts';
