import { Injectable, computed, signal } from '@angular/core';

import {
  type BoardView,
  DEFAULT_VIEW,
  parseStoredView,
  serializeStoredView,
  viewStorageKey,
} from './board-view';

/**
 * La vista del tablero de UN proyecto, recordada en localStorage
 * (`tk.tablero.vista.<CLAVE>`). Sin localStorage (modo privado estricto,
 * cuota llena) sigue funcionando, solo que no se recuerda. Provisto en la
 * ruta del proyecto (board.routes.ts).
 */
@Injectable()
export class BoardViewStore {
  private readonly _projectKey = signal('');
  private readonly _view = signal<BoardView>(DEFAULT_VIEW);

  readonly view = this._view.asReadonly();
  readonly density = computed(() => this._view().density);

  /** Carga lo recordado del proyecto (una vez por clave). */
  use(projectKey: string): void {
    if (!projectKey || projectKey === this._projectKey()) return;
    this._projectKey.set(projectKey);
    this._view.set(parseStoredView(read(viewStorageKey(projectKey))));
  }

  update(patch: Partial<Omit<BoardView, 'filters'>>): void {
    const view = { ...this._view(), ...patch };
    this._view.set(view);
    const key = this._projectKey();
    if (key) write(viewStorageKey(key), serializeStoredView(view));
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
    // Sin localStorage: la vista vale hasta recargar.
  }
}
