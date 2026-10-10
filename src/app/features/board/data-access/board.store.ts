import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, tap, throwError } from 'rxjs';

import {
  type BoardState,
  type CreateIssueRequest,
  type Issue,
  IssuesClient,
  type Project,
  toDomainError,
} from '@/app/api';
import { columnOf, groupByState, issueKey, upsertIssue, withState } from './board.logic';

/** Aviso efímero para el usuario (live region del tablero). */
export interface BoardNotice {
  kind: 'info' | 'error';
  /** Clave de traducción (`board.notice.*`). */
  message: string;
  /** `TK-42` */
  issue: string;
  state?: BoardState;
  id: number;
}

/**
 * Store del tablero de UN proyecto: proyecto, issues, mover (optimista),
 * crear y detalle. Provisto en la ruta `proyectos/:projectId` (board.routes.ts):
 * lo comparten tablero, alta y detalle, así volver del detalle no recarga en
 * blanco y lo creado/movido se ve al instante.
 */
@Injectable()
export class BoardStore {
  private readonly client = inject(IssuesClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _projectId = signal<string | null>(null);
  private readonly _project = signal<Project | null>(null);
  private readonly _issues = signal<Issue[]>([]);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _notFound = signal(false);
  private readonly _pending = signal<ReadonlySet<number>>(new Set());
  private readonly _notice = signal<BoardNotice | null>(null);
  /** Columna visible en móvil; vive acá para sobrevivir a ir y volver del detalle. */
  private readonly _activeColumn = signal<BoardState>('ISSUE_STATE_TODO');

  readonly project = this._project.asReadonly();
  readonly issues = this._issues.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly notFound = this._notFound.asReadonly();
  readonly notice = this._notice.asReadonly();
  readonly activeColumn = this._activeColumn.asReadonly();
  readonly columns = computed(() => groupByState(this._issues()));
  readonly projectKey = computed(() => this._project()?.key ?? '');

  // ── Detalle ──────────────────────────────────────────────────────────────
  private readonly _selectedNumber = signal<number | null>(null);
  private readonly _selectedLoading = signal(false);
  private readonly _selectedError = signal<string | null>(null);
  private readonly _selectedNotFound = signal(false);

  /** El issue seleccionado sale de la lista: si se mueve, el detalle lo refleja. */
  readonly selected = computed(() => {
    const number = this._selectedNumber();
    return number === null ? null : (this._issues().find((i) => i.number === number) ?? null);
  });
  readonly selectedLoading = this._selectedLoading.asReadonly();
  readonly selectedError = this._selectedError.asReadonly();
  readonly selectedNotFound = this._selectedNotFound.asReadonly();

  private loadRequestId = 0;
  private detailRequestId = 0;
  private moveSeq = 0;
  private noticeSeq = 0;
  /** Último movimiento pedido por issue: sólo ése puede confirmar o deshacer. */
  private readonly latestMove = new Map<number, number>();

  isPending(number: number): boolean {
    return this._pending().has(number);
  }

  readonly pending = this._pending.asReadonly();

  /**
   * Carga proyecto + todos sus issues. Si ya hay datos del mismo proyecto
   * (volver del detalle), refresca en segundo plano sin vaciar el tablero.
   */
  load(projectId: string): void {
    const sameProject = this._projectId() === projectId && this._loaded();
    if (!sameProject) {
      this._projectId.set(projectId);
      this._project.set(null);
      this._issues.set([]);
      this._loaded.set(false);
      this._activeColumn.set('ISSUE_STATE_TODO');
      this._loading.set(true);
    }
    this._error.set(null);
    this._notFound.set(false);
    const requestId = ++this.loadRequestId;

    forkJoin({
      projects: this.client.listAllProjects(),
      issues: this.client.listAllIssues(projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ projects, issues }) => {
          if (requestId !== this.loadRequestId) return;
          const project = projects.find((p) => p.id === projectId) ?? null;
          this._project.set(project);
          this._notFound.set(project === null);
          // Un movimiento en vuelo manda sobre lo que trajo el refresco.
          const pending = this._issues().filter((i) => this._pending().has(i.number));
          this._issues.set(pending.reduce(upsertIssue, issues));
          this._loaded.set(true);
          this._loading.set(false);
        },
        error: (err: unknown) => {
          if (requestId !== this.loadRequestId) return;
          const error = toDomainError(err);
          if (error.isNotFound()) this._notFound.set(true);
          else this._error.set(error.message);
          this._loading.set(false);
        },
      });
  }

  /** Carga si todavía no hay datos de este proyecto (entrada directa al detalle). */
  ensureLoaded(projectId: string): void {
    if (this._projectId() !== projectId || (!this._loaded() && !this._loading())) {
      this.load(projectId);
    }
  }

  /**
   * Mueve un issue de columna con actualización OPTIMISTA: la tarjeta cambia de
   * columna al instante y, si el backend falla, vuelve a donde estaba y se avisa.
   * Si el mismo issue se mueve de nuevo antes de que responda el primero, sólo
   * cuenta la respuesta del último movimiento.
   */
  move(number: number, to: BoardState): void {
    const projectId = this._projectId();
    const current = this._issues().find((i) => i.number === number);
    if (!projectId || !current || columnOf(current) === to) return;

    const previousState = current.state;
    const seq = ++this.moveSeq;
    this.latestMove.set(number, seq);
    this._issues.update((list) => withState(list, number, to));
    this.setPending(number, true);
    const key = issueKey(this.projectKey(), number);

    this.client
      .moveIssue(projectId, number, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (issue) => {
          if (this.latestMove.get(number) !== seq) return;
          this.latestMove.delete(number);
          this.setPending(number, false);
          // El backend es la verdad (updatedAt, y por si normalizó algo).
          if (issue.number === number) this._issues.update((list) => upsertIssue(list, issue));
          this.notify('info', 'board.notice.moved', key, to);
        },
        error: () => {
          if (this.latestMove.get(number) !== seq) return;
          this.latestMove.delete(number);
          this.setPending(number, false);
          this._issues.update((list) =>
            list.map((i) => (i.number === number ? { ...i, state: previousState } : i)),
          );
          this.notify('error', 'board.notice.moveFailed', key, columnOf({ state: previousState }));
        },
      });
  }

  /** Crea un issue (el backend lo pone en «Por hacer») y lo suma al tablero. */
  create(req: CreateIssueRequest): Observable<Issue> {
    const projectId = this._projectId();
    if (!projectId) return throwError(() => new Error('BoardStore.create sin proyecto'));
    return this.client.createIssue(projectId, req).pipe(
      tap((issue) => {
        this._issues.update((list) => upsertIssue(list, issue));
        this._activeColumn.set(columnOf(issue));
        this.notify('info', 'board.notice.created', issueKey(this.projectKey(), issue.number));
      }),
      catchError((err: unknown) => throwError(() => toDomainError(err))),
    );
  }

  /** Detalle: muestra lo que haya en la lista al instante y lo refresca del servidor. */
  select(number: number): void {
    const projectId = this._projectId();
    if (!projectId) return;
    const requestId = ++this.detailRequestId;
    this._selectedNumber.set(number);
    this._selectedError.set(null);
    this._selectedNotFound.set(false);
    this._selectedLoading.set(true);

    this.client
      .getIssue(projectId, number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (issue) => {
          if (requestId !== this.detailRequestId) return;
          // Si hay un movimiento en vuelo, su estado optimista manda.
          if (!this.isPending(number)) this._issues.update((list) => upsertIssue(list, issue));
          this._selectedLoading.set(false);
        },
        error: (err: unknown) => {
          if (requestId !== this.detailRequestId) return;
          const error = toDomainError(err);
          if (error.isNotFound()) this._selectedNotFound.set(true);
          else this._selectedError.set(error.message);
          this._selectedLoading.set(false);
        },
      });
  }

  setActiveColumn(state: BoardState): void {
    this._activeColumn.set(state);
  }

  dismissNotice(id?: number): void {
    if (id === undefined || this._notice()?.id === id) this._notice.set(null);
  }

  private notify(
    kind: BoardNotice['kind'],
    message: string,
    issue: string,
    state?: BoardState,
  ): void {
    this._notice.set({ kind, message, issue, state, id: ++this.noticeSeq });
  }

  private setPending(number: number, pending: boolean): void {
    this._pending.update((set) => {
      const next = new Set(set);
      if (pending) next.add(number);
      else next.delete(number);
      return next;
    });
  }
}
