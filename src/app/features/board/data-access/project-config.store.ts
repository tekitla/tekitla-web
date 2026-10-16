import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, filter, tap, throwError } from 'rxjs';

import {
  type BatchUpdateStatusesRequest,
  type CreateLabelRequest,
  IssuesClient,
  type Label,
  type Status,
  type UpdateLabelRequest,
  toDomainError,
} from '@/app/api';
import { isBoardStatus, sortStatuses } from './board.logic';

/**
 * Configuración de UN proyecto: sus estados (columnas) y etiquetas. Provisto
 * en la ruta `proyectos/:projectId` junto a `BoardStore`, que la carga con el
 * tablero (`set`): lo que se cambia en Ajustes se ve en el tablero sin recargar.
 * Si se cambia de proyecto con una escritura en vuelo, su respuesta no toca el
 * store y el Observable completa sin emitir.
 *
 * Las escrituras esperan al servidor (no son optimistas: las rechaza por
 * nombre repetido, máximos o último estado de su categoría) y
 * devuelven el Observable para que la página muestre el error junto al
 * formulario. Los errores llegan como `DomainError`.
 */
@Injectable()
export class ProjectConfigStore {
  private readonly client = inject(IssuesClient);

  private projectId: string | null = null;
  private writes = 0;

  /**
   * Cuántas escrituras confirmó el servidor. `BoardStore` lo compara antes y
   * después de un refresco: si cambió, lo que trajo el refresco es viejo.
   */
  get version(): number {
    return this.writes;
  }
  private readonly _statuses = signal<Status[]>([]);
  private readonly _labels = signal<Label[]>([]);

  /** En el orden de las columnas (incluye los descartados). */
  readonly statuses = this._statuses.asReadonly();
  /** Por nombre, como ListLabels. */
  readonly labels = this._labels.asReadonly();
  /** Las columnas del tablero: sin los ocultos. */
  readonly boardStatuses = computed(() => this._statuses().filter(isBoardStatus));
  readonly labelsById = computed(() => new Map(this._labels().map((l) => [l.id, l])));

  /** Vacía la configuración al cambiar de proyecto. */
  reset(projectId: string): void {
    this.set(projectId, [], []);
  }

  /** Lo llama `BoardStore.load`, que trae estados y etiquetas junto con el tablero. */
  set(projectId: string, statuses: Status[], labels: Label[]): void {
    this.projectId = projectId;
    this._statuses.set(sortStatuses(statuses));
    this._labels.set(sortLabels(labels));
  }

  // ── Estados ───────────────────────────────────────────────────────────────

  /**
   * Guarda la lista completa de estados en un solo request (todo o nada) y
   * queda con lo que devolvió el servidor. Si borró estados, sus issues
   * cambiaron de estado: el tablero tiene que recargar.
   */
  saveStatuses(req: BatchUpdateStatusesRequest): Observable<Status[]> {
    return this.write((id) => this.client.batchUpdateStatuses(id, req)).pipe(
      tap((statuses) => this._statuses.set(sortStatuses(statuses))),
    );
  }

  /** Vuelve a traer los estados (otro los cambió: `STALE_STATUSES`). */
  reloadStatuses(): Observable<Status[]> {
    const projectId = this.projectId;
    if (!projectId) {
      return throwError(() => toDomainError(new Error('ProjectConfigStore sin proyecto')));
    }
    return this.client.listStatuses(projectId).pipe(
      catchError((err: unknown) => throwError(() => toDomainError(err))),
      filter(() => this.projectId === projectId),
      tap((statuses) => this._statuses.set(sortStatuses(statuses))),
    );
  }

  // ── Etiquetas ─────────────────────────────────────────────────────────────

  createLabel(req: CreateLabelRequest): Observable<Label> {
    return this.write((id) => this.client.createLabel(id, req)).pipe(
      tap((label) => this._labels.update((list) => sortLabels([...list, label]))),
    );
  }

  updateLabel(labelId: string, req: UpdateLabelRequest): Observable<Label> {
    return this.write((id) => this.client.updateLabel(id, labelId, req)).pipe(
      tap((label) =>
        this._labels.update((list) => sortLabels(list.map((l) => (l.id === label.id ? label : l)))),
      ),
    );
  }

  /** Borra la etiqueta; el backend la quita de todos los issues. */
  deleteLabel(labelId: string): Observable<void> {
    return this.write((id) => this.client.deleteLabel(id, labelId)).pipe(
      tap(() => this._labels.update((list) => list.filter((l) => l.id !== labelId))),
    );
  }

  /**
   * Escribe contra el proyecto actual. Si cambió de proyecto mientras tanto,
   * la respuesta no toca el store (es de otro proyecto).
   */
  private write<T>(call: (projectId: string) => Observable<T>): Observable<T> {
    const projectId = this.projectId;
    if (!projectId) {
      return throwError(() => toDomainError(new Error('ProjectConfigStore sin proyecto')));
    }
    return call(projectId).pipe(
      catchError((err: unknown) => throwError(() => toDomainError(err))),
      filter(() => this.projectId === projectId),
      tap(() => this.writes++),
    );
  }
}

/** Mismo orden que ListLabels: por nombre, sin distinguir mayúsculas. */
function sortLabels(labels: readonly Label[]): Label[] {
  return [...labels].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}
