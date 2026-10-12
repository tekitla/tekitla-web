import type { DomainError } from '@/app/api';

export type SettingsOperation =
  | 'createStatus'
  | 'renameStatus'
  | 'moveStatus'
  | 'deleteStatus'
  | 'createLabel'
  | 'updateLabel'
  | 'deleteLabel';

/** Error de Ajustes para mostrar: clave de traducción y el mensaje del servidor. */
export interface SettingsError {
  key: string;
  message: string;
}

/**
 * Traduce el error del backend a un texto de Ajustes. El gateway expone el
 * código gRPC pero todavía no el `reason`; por operación, el código alcanza:
 * ALREADY_EXISTS = nombre repetido; FAILED_PRECONDITION = máximo del proyecto
 * al crear, o último de su categoría / falta destino al borrar un estado.
 */
export function settingsError(err: DomainError, operation: SettingsOperation): SettingsError {
  const code = err.api.code;
  const message = err.message;
  if (code === 'ALREADY_EXISTS') return { key: 'settings.errors.nameTaken', message };
  if (code === 'FAILED_PRECONDITION') {
    if (operation === 'createStatus') return { key: 'settings.errors.statusLimit', message };
    if (operation === 'deleteStatus') return { key: 'settings.errors.cannotDelete', message };
    if (operation === 'createLabel') return { key: 'settings.errors.labelLimit', message };
  }
  if (err.isNotFound()) return { key: 'settings.errors.notFound', message };
  return { key: 'settings.errors.generic', message };
}
