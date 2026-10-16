import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, concatMap, from, map, of } from 'rxjs';

import {
  type DiscardIssueRequest,
  type DomainError,
  type Issue,
  IssuesClient,
  toDomainError,
} from '@/app/api';
import { BoardStore } from './board.store';
import { issueKey } from './board.logic';
import { type IssueFilters, matchesFilters, sameFilters, toListRequest } from './issue-list.logic';

/** Issues por página de la lista («Cargar más» pide la siguiente). */
export const LIST_PAGE_SIZE = 50;

export type BulkAction = 'move' | 'discard' | 'restore';

/** Resultado de una acción en lote: cuántos salieron y cuáles fallaron (y por qué). */
export interface BulkResult {
  action: BulkAction;
  ok: number;
  failed: { key: string; message: string }[];
}

/**
 * Store de la lista de issues de UN proyecto (pantalla Issues), provisto en su
 * ruta. Pide `ListIssues` con búsqueda, filtros y orden, de a una página;
 * protege contra respuestas viejas con un requestId (cambiar los filtros
 * mientras carga descarta lo que estaba en vuelo).
 *
 * Un cursor solo sirve con los mismos filtros y orden: si el backend lo
 * rechaza (INVALID_ARGUMENT), se vuelve a la primera página.
 *
 * Selección múltiple: mover, descartar o restaurar issue por issue con los
 * RPC de siempre (no hay RPC en lote), en serie para no gastar el rate limit,
 * y reportar cuáles fallaron. Las escrituras pasan por `BoardStore`, así el
 * tablero también las ve.
 */
@Injectable()
export class IssueListStore {
  private readonly client = inject(IssuesClient);
  private readonly board = inject(BoardStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _items = signal<Issue[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadingMore = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _moreError = signal<string | null>(null);
  private readonly _hasNext = signal(false);
  private readonly _selected = signal<ReadonlySet<number>>(new Set());
  private readonly _bulk = signal<{ action: BulkAction; done: number; total: number } | null>(null);
  private readonly _bulkResult = signal<BulkResult | null>(null);

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadingMore = this._loadingMore.asReadonly();
  readonly error = this._error.asReadonly();
  readonly moreError = this._moreError.asReadonly();
  readonly hasNext = this._hasNext.asReadonly();
  readonly selected = this._selected.asReadonly();
  /** Acción en lote en curso, con su avance. */
  readonly bulk = this._bulk.asReadonly();
  readonly bulkResult = this._bulkResult.asReadonly();
  readonly selectedIssues = computed(() =>
    this._items().filter((i) => this._selected().has(i.number)),
  );
  readonly allSelected = computed(
    () => this._items().length > 0 && this._items().every((i) => this._selected().has(i.number)),
  );

  private projectId: string | null = null;
  private filters: IssueFilters | null = null;
  private cursor = '';
  private requestId = 0;

  /**
   * Primera página con estos filtros. Con los mismos filtros y proyecto que
   * ya están cargados no vuelve a pedir (salvo `force`).
   */
  load(projectId: string, filters: IssueFilters, force = false): void {
    const same =
      this.projectId === projectId && this.filters !== null && sameFilters(this.filters, filters);
    if (same && !force && (this._loading() || !this._error())) return;
    this.projectId = projectId;
    this.filters = filters;
    this.cursor = '';
    const requestId = ++this.requestId;
    if (!same) {
      this._items.set([]);
      this._selected.set(new Set());
    }
    this._loading.set(true);
    this._loadingMore.set(false);
    this._error.set(null);
    this._moreError.set(null);

    this.page(projectId, filters, '').subscribe({
      next: (res) => {
        if (requestId !== this.requestId) return;
        this._items.set(res.issues);
        this.cursor = res.page.nextCursor;
        this._hasNext.set(res.page.hasNext && res.page.nextCursor !== '');
        // Lo seleccionado que ya no está en la lista se suelta.
        const numbers = new Set(res.issues.map((i) => i.number));
        this._selected.update((set) => new Set([...set].filter((n) => numbers.has(n))));
        this._loading.set(false);
      },
      error: (err: unknown) => {
        if (requestId !== this.requestId) return;
        this._error.set(toDomainError(err).message);
        this._loading.set(false);
      },
    });
  }

  /** Vuelve a pedir la primera página con los mismos filtros. */
  reload(): void {
    if (this.projectId && this.filters) this.load(this.projectId, this.filters, true);
  }

  /** Página siguiente. Un cursor que el backend ya no acepta vuelve a la primera. */
  loadMore(): void {
    const { projectId, filters, cursor } = this;
    if (!projectId || !filters || !cursor || this._loading() || this._loadingMore()) return;
    const requestId = this.requestId;
    this._loadingMore.set(true);
    this._moreError.set(null);

    this.page(projectId, filters, cursor).subscribe({
      next: (res) => {
        if (requestId !== this.requestId) return;
        const seen = new Set(this._items().map((i) => i.number));
        this._items.update((list) => [...list, ...res.issues.filter((i) => !seen.has(i.number))]);
        this.cursor = res.page.nextCursor;
        this._hasNext.set(res.page.hasNext && res.page.nextCursor !== '');
        this._loadingMore.set(false);
      },
      error: (err: unknown) => {
        if (requestId !== this.requestId) return;
        this._loadingMore.set(false);
        const error = toDomainError(err);
        // Un cursor que no sirve con estos filtros: de vuelta a la primera página.
        if (error.api.code === 'INVALID_ARGUMENT') {
          this.load(projectId, filters, true);
          return;
        }
        this._moreError.set(error.message);
      },
    });
  }

  /** Reemplaza un issue de la lista (después de una escritura). */
  replace(issue: Issue): void {
    this._items.update((list) => list.map((i) => (i.number === issue.number ? issue : i)));
  }

  // ── Selección ─────────────────────────────────────────────────────────────

  toggle(number: number): void {
    this._selected.update((set) => {
      const next = new Set(set);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  toggleAll(): void {
    const all = this.allSelected();
    this._selected.set(new Set(all ? [] : this._items().map((i) => i.number)));
  }

  clearSelection(): void {
    this._selected.set(new Set());
  }

  dismissBulkResult(): void {
    this._bulkResult.set(null);
  }

  // ── Acciones en lote ──────────────────────────────────────────────────────

  moveSelected(statusId: string): void {
    this.runBulk('move', this.selectedIssues(), (n) => this.board.moveTo(n, statusId));
  }

  /** Solo los seleccionados que se pueden descartar (`open`: no están descartados). */
  discardSelected(req: DiscardIssueRequest, open: (issue: Issue) => boolean): void {
    this.runBulk('discard', this.selectedIssues().filter(open), (n) => this.board.discard(n, req));
  }

  /** Restaura uno (el botón de su fila), sin tocar la selección. */
  restoreIssue(issue: Issue): void {
    this.runBulk('restore', [issue], (n) => this.board.restore(n));
  }

  /** Solo los seleccionados que están descartados (`discarded`: según su estado). */
  restoreSelected(discarded: (issue: Issue) => boolean): void {
    this.runBulk('restore', this.selectedIssues().filter(discarded), (n) => this.board.restore(n));
  }

  /**
   * Corre la acción issue por issue, en serie. Los que salen se reemplazan en
   * la lista y se sueltan de la selección; los que fallan quedan seleccionados
   * para reintentar.
   */
  private runBulk(
    action: BulkAction,
    issues: readonly Issue[],
    call: (number: number) => Observable<Issue>,
  ): void {
    if (this._bulk() || !issues.length) return;
    const projectKey = this.board.projectKey();
    const result: BulkResult = { action, ok: 0, failed: [] };
    this._bulk.set({ action, done: 0, total: issues.length });
    this._bulkResult.set(null);

    from(issues)
      .pipe(
        concatMap((issue) =>
          call(issue.number).pipe(
            map((updated) => ({ issue, updated, error: null as DomainError | null })),
            catchError((err: unknown) => of({ issue, updated: null, error: toDomainError(err) })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ issue, updated, error }) => {
          if (updated) {
            result.ok++;
            this.replace(updated);
            // Ya no es de esta pestaña o filtro (p. ej. descartado desde Activos): sale.
            if (this.filters && !matchesFilters(updated, this.filters)) {
              this._items.update((list) => list.filter((i) => i.number !== updated.number));
            }
            this._selected.update((set) => {
              const next = new Set(set);
              next.delete(issue.number);
              return next;
            });
          } else {
            result.failed.push({
              key: issueKey(projectKey, issue.number),
              message: error?.message ?? '',
            });
          }
          this._bulk.update((bulk) => bulk && { ...bulk, done: bulk.done + 1 });
        },
        complete: () => {
          this._bulk.set(null);
          this._bulkResult.set(result);
        },
      });
  }

  private page(projectId: string, filters: IssueFilters, cursor: string) {
    return this.client
      .listIssues(projectId, {
        ...toListRequest(filters),
        page: { cursor, limit: LIST_PAGE_SIZE },
      })
      .pipe(takeUntilDestroyed(this.destroyRef));
  }
}
