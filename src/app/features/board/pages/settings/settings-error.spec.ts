import { describe, expect, it } from 'vitest';

import { DomainError } from '@/app/api';
import { settingsError } from './settings-error';

const error = (status: number, code = '', reason = '') =>
  new DomainError({ status, code, reason, message: 'del servidor', details: [], traceId: null });

describe('settingsError', () => {
  it('con reason, decide por el reason', () => {
    expect(settingsError(error(409, 'ALREADY_EXISTS', 'LABEL_NAME_TAKEN'), 'createLabel')).toEqual({
      key: 'settings.errors.nameTaken',
      message: 'del servidor',
    });
    expect(
      settingsError(error(400, 'FAILED_PRECONDITION', 'LAST_STATUS_OF_CATEGORY'), 'saveStatuses')
        .key,
    ).toBe('settings.errors.lastOfCategory');
    expect(
      settingsError(error(400, 'FAILED_PRECONDITION', 'STATUS_HAS_ISSUES'), 'saveStatuses').key,
    ).toBe('settings.errors.statusHasIssues');
    expect(
      settingsError(error(400, 'FAILED_PRECONDITION', 'STALE_STATUSES'), 'saveStatuses').key,
    ).toBe('settings.errors.staleStatuses');
  });

  it('sin reason (gateway viejo), por código y operación', () => {
    expect(settingsError(error(409, 'ALREADY_EXISTS'), 'saveStatuses').key).toBe(
      'settings.errors.nameTaken',
    );
    const precondition = error(400, 'FAILED_PRECONDITION');
    expect(settingsError(precondition, 'saveStatuses').key).toBe('settings.errors.statusRules');
    expect(settingsError(precondition, 'createLabel').key).toBe('settings.errors.labelLimit');
    expect(settingsError(precondition, 'updateLabel').key).toBe('settings.errors.generic');
  });

  it('un reason que no conoce cae al código', () => {
    expect(settingsError(error(409, 'ALREADY_EXISTS', 'ALGO_NUEVO'), 'saveStatuses').key).toBe(
      'settings.errors.nameTaken',
    );
  });

  it('no encontrado y el resto', () => {
    expect(settingsError(error(404, 'NOT_FOUND'), 'updateLabel').key).toBe(
      'settings.errors.notFound',
    );
    expect(settingsError(error(500, 'INTERNAL'), 'deleteLabel').key).toBe(
      'settings.errors.generic',
    );
  });
});
