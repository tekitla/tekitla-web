import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { DomainError, toDomainError } from './http-errors';

describe('toDomainError', () => {
  it('lee el sobre del gateway: código, mensaje y request_id', () => {
    const error = toDomainError(
      new HttpErrorResponse({
        status: 400,
        error: {
          error: { code: 'FAILED_PRECONDITION', message: 'neighbors moved', request_id: 'r-1' },
        },
      }),
    );
    expect(error.status).toBe(400);
    expect(error.api.code).toBe('FAILED_PRECONDITION');
    expect(error.message).toBe('neighbors moved');
    expect(error.api.traceId).toBe('r-1');
    expect(error.isFailedPrecondition()).toBe(true);
    expect(error.isValidation()).toBe(true);
  });

  it('acepta el cuerpo plano y prefiere el header X-Trace-Id', () => {
    const error = toDomainError(
      new HttpErrorResponse({
        status: 409,
        error: { message: 'existe' },
        headers: new HttpHeaders({ 'X-Trace-Id': 't-9' }),
      }),
    );
    expect(error.message).toBe('existe');
    expect(error.api.code).toBe('');
    expect(error.api.traceId).toBe('t-9');
    expect(error.isFailedPrecondition()).toBe(false);
  });

  it('sin respuesta (red) = status 0; es idempotente', () => {
    const error = toDomainError(new Error('offline'));
    expect(error.isNetwork()).toBe(true);
    expect(toDomainError(error)).toBe(error);
    expect(error).toBeInstanceOf(DomainError);
  });
});
