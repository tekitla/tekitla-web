import type { DomainError } from '@/app/api';

export type SettingsOperation =
  | 'saveStatuses'
  | 'createLabel'
  | 'updateLabel'
  | 'deleteLabel';

/** Error de Ajustes para mostrar: clave de traducción y el mensaje del servidor. */
export interface SettingsError {
  key: string;
  message: string;
}

/** Textos por `reason` del gateway (`error.reason`). */
const BY_REASON: Record<string, string> = {
  STATUS_NAME_TAKEN: 'settings.errors.nameTaken',
  LABEL_NAME_TAKEN: 'settings.errors.nameTaken',
  LAST_STATUS_OF_CATEGORY: 'settings.errors.lastOfCategory',
  STATUS_HAS_ISSUES: 'settings.errors.statusHasIssues',
  STALE_STATUSES: 'settings.errors.staleStatuses',
};

/**
 * Traduce el error del backend a un texto de Ajustes. Primero por `reason`
 * (si el gateway lo expone); si no vino, por código y operación:
 * ALREADY_EXISTS = nombre repetido; FAILED_PRECONDITION = máximo del proyecto
 * al crear una etiqueta o, al guardar los estados, alguna de sus reglas
 * (máximo, último de su categoría, destino o vista vieja).
 */
export function settingsError(err: DomainError, operation: SettingsOperation): SettingsError {
  const message = err.message;
  const byReason = BY_REASON[err.api.reason];
  if (byReason) return { key: byReason, message };
  const code = err.api.code;
  if (code === 'ALREADY_EXISTS') return { key: 'settings.errors.nameTaken', message };
  if (code === 'FAILED_PRECONDITION') {
    if (operation === 'saveStatuses') return { key: 'settings.errors.statusRules', message };
    if (operation === 'createLabel') return { key: 'settings.errors.labelLimit', message };
  }
  if (err.isNotFound()) return { key: 'settings.errors.notFound', message };
  return { key: 'settings.errors.generic', message };
}
