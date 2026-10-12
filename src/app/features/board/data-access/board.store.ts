import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, tap, throwError } from 'rxjs';

import {
  type CreateIssueRequest,
  type Issue,
  IssuesClient,
  type Project,
  type UpdateIssueRequest,
  toDomainError,
} from '@/app/api';
import {
  type Placement,
  buildColumns,
  issueKey,
  placementAt,
  rankBetween,
  statusOf,
  upsertIssue,
  withMove,
} from './board.logic';
import { ProjectConfigStore } from './project-config.store';

/** Aviso efímero para el usuario (live region del tablero). */
export interface BoardNotice {
  kind: 'info' | 'error';
  /** Clave de traducción (`board.notice.*`). */
  message: string;
  /** `TK-42` */
  issue: string;
  /** Nombre del estado (columna) que menciona el aviso. */
  column?: string;
  /** Clave de traducción de una segunda línea (qué pasó después). */
  detail?: string;
  id: number;
}

/** Dónde está un issue según el servidor: a eso se vuelve si falla un movimiento. */
type Position = Pick<Issue, 'statusId' | 'state' | 'rank'>;

/** Movimientos en vuelo de un issue. */
interface MovesInFlight {
  /** `seq` del último movimiento pedido: el único que decide el resultado. */
  latest: number;
  /** Cuántas respuestas faltan. */
  count: number;
  /** Última posición que el servidor confirmó. */
  confirmed: Position;
  /** Resultado del último movimiento, cuando ya respondió. */
  outcome: MoveOutcome | null;
}

type MoveOutcome =
  | { ok: true; issue: Issue | null; statusId: string; sameColumn: boolean }
  /** `stale`: el servidor rechazó los vecinos (vista vieja: hay que recargar). */
  | { ok: false; stale: boolean };

/**
 * Store del tablero de UN proyecto: proyecto, issues, columnas (de
 * `ProjectConfigStore`), mover (optimista), crear, editar y detalle. Provisto
 * en la ruta `proyectos/:projectId` (board.routes.ts): lo comparten tablero,
 * alta, detalle y ajustes, así volver del detalle no recarga en blanco y lo
 * creado/movido se ve al instante.
 */
@Injectable()
export class BoardStore {
  private readonly client = inject(IssuesClient);
  private readonly config = inject(ProjectConfigStore);
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
  /** Columna elegida en móvil; vive acá para sobrevivir a ir y volver del detalle. */
  private readonly _activeColumn = signal<string | null>(null);

  readonly project = this._project.asReadonly();
  readonly issues = this._issues.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();
  readonly notFound = this._notFound.asReadonly();
  readonly notice = this._notice.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly statuses = this.config.statuses;
  readonly labels = this.config.labels;
  readonly labelsById = this.config.labelsById;
  readonly columns = computed(() => buildColumns(this._issues(), this.config.statuses()));
  readonly projectKey = computed(() => this._project()?.key ?? '');
  /** Columna visible en móvil: la elegida si sigue existiendo, si no la primera. */
  readonly activeColumn = computed(() => {
    const columns = this.columns();
    const chosen = this._activeColumn();
    return columns.find((c) => c.status.id === chosen)?.status.id ?? columns[0]?.status.id ?? null;
  });

  // ── Detalle ──────────────────────────────────────────────────────────────
  private readonly _selectedNumber = signal<number | null>(null);
  private readonly _selectedLoading = signal(false);
  private readonly _selectedError = signal<string | null>(null);
  private readonly _selectedNotFound = signal(false);

  /** El issue seleccionado sale de la lista: si se mueve o edita, el detalle lo refleja. */
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
  /** Movimientos en vuelo por issue: el último pedido y cuántos faltan responder. */
  private readonly inFlight = new Map<number, MovesInFlight>();

  isPending(number: number): boolean {
    return this._pending().has(number);
  }

  /** Estado (columna) de un issue. */
  statusOf(issue: Issue) {
    return statusOf(issue, this.config.statuses());
  }

  /**
   * Carga proyecto, issues, estados y etiquetas. Si ya hay datos del mismo
   * proyecto (volver del detalle), refresca en segundo plano sin vaciar el
   * tablero.
   */
  load(projectId: string): void {
    const sameProject = this._projectId() === projectId && this._loaded();
    if (!sameProject) {
      this._projectId.set(projectId);
      this._project.set(null);
      this._issues.set([]);
      this.config.reset(projectId);
      this._loaded.set(false);
      this._activeColumn.set(null);
      this._loading.set(true);
      // Lo que esté en vuelo es del proyecto anterior: sus respuestas se ignoran.
      this._pending.set(new Set());
      this.inFlight.clear();
      this.detailRequestId++;
    }
    this._error.set(null);
    this._notFound.set(false);
    const requestId = ++this.loadRequestId;

    forkJoin({
      projects: this.client.listAllProjects(),
      issues: this.client.listAllIssues(projectId),
      statuses: this.client.listStatuses(projectId),
      labels: this.client.listLabels(projectId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ projects, issues, statuses, labels }) => {
          if (requestId !== this.loadRequestId) return;
          const project = projects.find((p) => p.id === projectId) ?? null;
          this._project.set(project);
          this._notFound.set(project === null);
          this.config.set(projectId, statuses, labels);
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

  /** Carga si todavía no hay datos de este proyecto (entrada directa al detalle o a ajustes). */
  ensureLoaded(projectId: string): void {
    if (this._projectId() !== projectId || (!this._loaded() && !this._loading())) {
      this.load(projectId);
    }
  }

  /** Vuelve a pedir todo en segundo plano (p. ej. después de borrar un estado). */
  refresh(): void {
    const projectId = this._projectId();
    if (projectId) this.load(projectId);
  }

  /**
   * Mueve un issue al estado `statusId` con actualización OPTIMISTA: la
   * tarjeta cambia al instante y, si el backend falla, vuelve a donde estaba y
   * se avisa.
   *
   * Con `index`, también la ubica en esa posición de la columna destino (tal
   * como se ve): el backend recibe los vecinos y calcula el rank. Sin `index`
   * conserva su rank. Si el servidor responde que los vecinos ya no cuadran
   * (FAILED_PRECONDITION: la vista está vieja), se recarga el tablero.
   *
   * Si el mismo issue se mueve de nuevo antes de que responda el primero, se
   * espera a que respondan todos y decide el último: si salió bien queda donde
   * está; si falló, vuelve a la última posición que el servidor confirmó.
   */
  move(number: number, statusId: string, index?: number): void {
    const projectId = this._projectId();
    const current = this._issues().find((i) => i.number === number);
    const status = this.config.statuses().find((s) => s.id === statusId);
    if (!projectId || !current || !status) return;

    const fromStatusId = this.statusOf(current)?.id ?? current.statusId;
    const column = this.columns().find((c) => c.status.id === statusId)?.issues ?? [];
    const placement = index === undefined ? null : placementAt(column, number, index);
    if (fromStatusId === statusId) {
      const now = column.findIndex((i) => i.number === number);
      if (!placement || samePlacement(placement, placementAt(column, number, now))) return;
    }

    const rankOf = (n: number) => column.find((i) => i.number === n)?.rank ?? null;
    const rank = placement
      ? (rankBetween(
          placement.afterNumber ? rankOf(placement.afterNumber) : null,
          placement.beforeNumber ? rankOf(placement.beforeNumber) : null,
        ) ?? undefined)
      : undefined;

    const seq = ++this.moveSeq;
    // Sin movimientos en vuelo, la posición actual es la que tiene el servidor.
    const moves = this.inFlight.get(number) ?? {
      latest: seq,
      count: 0,
      confirmed: { statusId: current.statusId, state: current.state, rank: current.rank },
      outcome: null,
    };
    moves.latest = seq;
    moves.count++;
    this.inFlight.set(number, moves);
    this._issues.update((list) => withMove(list, number, status, rank));
    this.setPending(number, true);
    const key = issueKey(this.projectKey(), number);
    const sameColumn = fromStatusId === statusId;
    // Se cambió de proyecto (o se volvió a él) mientras estaba en vuelo.
    const stale = () => this._projectId() !== projectId || this.inFlight.get(number) !== moves;

    this.client
      .moveIssue(projectId, number, { statusId, ...placement })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (issue) => {
          if (stale()) return;
          // Aunque lo haya superado otro movimiento, el servidor ya lo aplicó.
          const confirmed = issue.number === number ? issue : null;
          moves.confirmed = confirmed
            ? { statusId: confirmed.statusId, state: confirmed.state, rank: confirmed.rank }
            : { statusId, state: status.category, rank: rank ?? moves.confirmed.rank };
          this.settle(
            number,
            moves,
            seq,
            { ok: true, issue: confirmed, statusId, sameColumn },
            key,
          );
        },
        error: (err: unknown) => {
          if (stale()) return;
          const outcome = { ok: false, stale: toDomainError(err).isStaleOrder() } as const;
          this.settle(number, moves, seq, outcome, key);
        },
      });
  }

  /** Cuenta una respuesta; con la última que falta, aplica el resultado del último movimiento. */
  private settle(
    number: number,
    moves: MovesInFlight,
    seq: number,
    outcome: MoveOutcome,
    key: string,
  ): void {
    moves.count--;
    if (seq === moves.latest) moves.outcome = outcome;
    if (moves.count > 0 || !moves.outcome) return;

    const last = moves.outcome;
    this.inFlight.delete(number);
    this.setPending(number, false);
    if (last.ok) {
      // El backend es la verdad (rank, updatedAt, y por si normalizó algo).
      if (last.issue) this._issues.update((list) => upsertIssue(list, last.issue!));
      const message = last.sameColumn ? 'board.notice.reordered' : 'board.notice.moved';
      this.notify('info', message, key, this.statusName(last.statusId));
      return;
    }
    const confirmed = moves.confirmed;
    this._issues.update((list) =>
      list.map((i) => (i.number === number ? { ...i, ...confirmed } : i)),
    );
    if (last.stale) {
      this.notify('error', 'board.notice.moveFailed', key, undefined, 'board.notice.stale');
      this.refresh();
      return;
    }
    const column = this.statusName(confirmed.statusId);
    this.notify('error', 'board.notice.moveFailed', key, column, 'board.notice.moveFailedDetail');
  }

  /** Crea un issue (el backend lo pone en el primer estado «Por hacer») y lo suma al tablero. */
  create(req: CreateIssueRequest): Observable<Issue> {
    const projectId = this._projectId();
    if (!projectId) return throwError(() => new Error('BoardStore.create sin proyecto'));
    return this.client.createIssue(projectId, req).pipe(
      tap((issue) => {
        this._issues.update((list) => upsertIssue(list, issue));
        const status = this.statusOf(issue);
        if (status) this._activeColumn.set(status.id);
        this.notify(
          'info',
          'board.notice.created',
          issueKey(this.projectKey(), issue.number),
          status?.name,
        );
      }),
      catchError((err: unknown) => throwError(() => toDomainError(err))),
    );
  }

  /**
   * Edita título, descripción, prioridad o etiquetas (solo lo que viene). Espera
   * al servidor: la página muestra el error junto al campo.
   */
  update(number: number, req: UpdateIssueRequest): Observable<Issue> {
    const projectId = this._projectId();
    if (!projectId) return throwError(() => new Error('BoardStore.update sin proyecto'));
    return this.client.updateIssue(projectId, number, req).pipe(
      tap((issue) => {
        if (this._projectId() !== projectId) return;
        // Un movimiento en vuelo manda sobre la posición: se conserva la optimista.
        const local = this._issues().find((i) => i.number === number);
        const keep = local && this.isPending(number);
        this._issues.update((list) =>
          upsertIssue(
            list,
            keep
              ? { ...issue, statusId: local.statusId, state: local.state, rank: local.rank }
              : issue,
          ),
        );
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
          // Si hay un movimiento en vuelo, su posición optimista manda.
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

  setActiveColumn(statusId: string): void {
    this._activeColumn.set(statusId);
  }

  dismissNotice(id?: number): void {
    if (id === undefined || this._notice()?.id === id) this._notice.set(null);
  }

  private statusName(statusId: string): string | undefined {
    return this.config.statuses().find((s) => s.id === statusId)?.name;
  }

  private notify(
    kind: BoardNotice['kind'],
    message: string,
    issue: string,
    column?: string,
    detail?: string,
  ): void {
    this._notice.set({ kind, message, issue, column, detail, id: ++this.noticeSeq });
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

function samePlacement(a: Placement, b: Placement): boolean {
  return a.afterNumber === b.afterNumber && a.beforeNumber === b.beforeNumber;
}
