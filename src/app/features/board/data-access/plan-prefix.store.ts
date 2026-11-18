import { Injectable, signal, untracked } from '@angular/core';

import { DEFAULT_PREFIX, normalizePrefix, prefixStorageKey } from './plan.logic';

/**
 * El prefijo de categoría de la vista Plan de UN proyecto (039, CU-039-7),
 * recordado en localStorage como la vista del tablero del 033. Guardarlo en
 * el servidor queda para las vistas guardadas del 034. Sin localStorage
 * sigue funcionando, solo que no se recuerda.
 */
@Injectable()
export class PlanPrefixStore {
  private readonly _projectId = signal('');
  private readonly _prefix = signal(DEFAULT_PREFIX);

  readonly prefix = this._prefix.asReadonly();

  /** Carga lo recordado del proyecto (una vez por proyecto). */
  use(projectId: string): void {
    if (!projectId || projectId === untracked(this._projectId)) return;
    this._projectId.set(projectId);
    this._prefix.set(normalizePrefix(read(prefixStorageKey(projectId))));
  }

  set(raw: string): void {
    const prefix = normalizePrefix(raw);
    this._prefix.set(prefix);
    const projectId = this._projectId();
    if (projectId) write(prefixStorageKey(projectId), prefix);
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin localStorage: vale hasta recargar.
  }
}
