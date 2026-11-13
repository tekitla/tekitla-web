import { Injectable, computed, signal, untracked } from '@angular/core';

import {
  type BoardView,
  DEFAULT_VIEW,
  parseStoredView,
  serializeStoredView,
  viewStorageKey,
} from './board-view';

/**
 * La vista del tablero de UN proyecto, recordada en localStorage (ver
 * `viewStorageKey`). Sin localStorage (modo privado estricto,
 * cuota llena) sigue funcionando, solo que no se recuerda. Provisto en la
 * ruta del proyecto (board.routes.ts).
 */
@Injectable()
export class BoardViewStore {
  private readonly _projectId = signal('');
  private readonly _view = signal<BoardView>(DEFAULT_VIEW);

  readonly view = this._view.asReadonly();
  readonly density = computed(() => this._view().density);

  /** Carga lo recordado del proyecto (una vez por proyecto). */
  use(projectId: string): void {
    // Sin leer `_projectId` como dependencia: `use` corre dentro de un effect.
    if (!projectId || projectId === untracked(this._projectId)) return;
    this._projectId.set(projectId);
    this._view.set(parseStoredView(read(viewStorageKey(projectId))));
  }

  update(patch: Partial<Omit<BoardView, 'filters'>>): void {
    const view = { ...this._view(), ...patch };
    this._view.set(view);
    const projectId = this._projectId();
    if (projectId) write(viewStorageKey(projectId), serializeStoredView(view));
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
