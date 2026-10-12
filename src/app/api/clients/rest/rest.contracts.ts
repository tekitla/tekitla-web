import type { HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';

type QueryValue = string | number | boolean;

/**
 * Query params aceptados por RestClient. `null`/`undefined` se omiten; una
 * lista repite el parámetro (`states=A&states=B`, como lee grpc-gateway los
 * campos `repeated`).
 */
export type QueryParams =
  HttpParams | Record<string, QueryValue | readonly QueryValue[] | null | undefined>;

export interface RestOptions {
  params?: QueryParams;
  headers?: HttpHeaders | Record<string, string>;
  /** Para marcar requests con tokens de contexto, p. ej. `SKIP_AUTH`. */
  context?: HttpContext;
}
