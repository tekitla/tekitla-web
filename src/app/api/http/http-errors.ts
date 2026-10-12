import { HttpErrorResponse } from '@angular/common/http';

/** Error normalizado del API (lo arma `errorInterceptor`). */
export interface ApiError {
  /** HTTP status (0 = sin respuesta: red caída, CORS, DNS). */
  status: number;
  /**
   * Código del gateway (`{"error": {"code": ...}}`): el nombre del código gRPC
   * (`FAILED_PRECONDITION`, `ALREADY_EXISTS`…) o `PAYLOAD_TOO_LARGE` /
   * `UNSUPPORTED_MEDIA_TYPE`. Vacío si la respuesta no lo trae.
   */
  code: string;
  /**
   * Clave estable del error de dominio (`STALE_ORDER`, `STATUS_NAME_TAKEN`…),
   * cuando el gateway la expone (`error.reason`, opcional: sólo en 4xx que
   * dicen algo más que el código). Vacío si no vino.
   */
  reason: string;
  message: string;
  details: unknown[];
  /**
   * Header `X-Trace-Id` o el `request_id` del gateway, para correlacionar con
   * los logs del backend.
   */
  traceId: string | null;
}

/**
 * Error tipado que reciben los `catchError` de stores y componentes. Clasifica
 * por HTTP status con helpers, así nadie compara números sueltos:
 *
 *   if (isDomainError(err) && err.isNotFound()) { ... }
 */
export class DomainError extends Error {
  readonly api: ApiError;

  constructor(api: ApiError) {
    super(api.message);
    this.name = 'DomainError';
    this.api = api;
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  get status(): number {
    return this.api.status;
  }

  isNetwork(): boolean {
    return this.api.status === 0;
  }

  isValidation(): boolean {
    return this.api.status === 400 || this.api.status === 422;
  }

  isUnauthorized(): boolean {
    return this.api.status === 401;
  }

  isForbidden(): boolean {
    return this.api.status === 403;
  }

  isNotFound(): boolean {
    return this.api.status === 404;
  }

  isConflict(): boolean {
    return this.api.status === 409;
  }

  isRateLimited(): boolean {
    return this.api.status === 429;
  }

  /**
   * El estado ya no permite la operación (gRPC `FAILED_PRECONDITION`, que el
   * gateway responde como 400): p. ej. mover con una vista vieja del tablero.
   */
  isFailedPrecondition(): boolean {
    return this.api.code === 'FAILED_PRECONDITION';
  }

  /**
   * El servidor rechazó un `:move` porque la vista del tablero está vieja.
   * Sin `reason` (gateway anterior), cualquier FAILED_PRECONDITION de `:move`
   * es eso: es la única precondición que tiene.
   */
  isStaleOrder(): boolean {
    return this.api.reason ? this.api.reason === 'STALE_ORDER' : this.isFailedPrecondition();
  }

  isServer(): boolean {
    return this.api.status >= 500;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

/** Convierte cualquier error en DomainError (idempotente). */
export function toDomainError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  if (err instanceof HttpErrorResponse) {
    const body = gatewayBody(err.error);
    return new DomainError({
      status: err.status,
      code: body.code ?? '',
      reason: body.reason ?? '',
      message: body.message ?? err.message ?? 'Error inesperado',
      details: body.details ?? [],
      traceId: err.headers?.get('X-Trace-Id') ?? body.requestId ?? null,
    });
  }
  return new DomainError({
    status: 0,
    code: '',
    reason: '',
    message: err instanceof Error ? err.message : 'Error inesperado',
    details: [],
    traceId: null,
  });
}

interface ErrorBody {
  code?: string;
  reason?: string;
  message?: string;
  details?: unknown[];
  requestId?: string;
}

/**
 * El gateway responde `{"error": {"code", "message", "reason"?, "request_id"}}`; se
 * acepta también el cuerpo plano (`{"message"}`) de otros backends.
 */
function gatewayBody(raw: unknown): ErrorBody {
  if (!raw || typeof raw !== 'object') return {};
  const nested = (raw as { error?: unknown }).error;
  const body = (nested && typeof nested === 'object' ? nested : raw) as Record<string, unknown>;
  return {
    code: typeof body['code'] === 'string' ? body['code'] : undefined,
    reason: typeof body['reason'] === 'string' ? body['reason'] : undefined,
    message: typeof body['message'] === 'string' ? body['message'] : undefined,
    details: Array.isArray(body['details']) ? body['details'] : undefined,
    requestId: typeof body['request_id'] === 'string' ? body['request_id'] : undefined,
  };
}
