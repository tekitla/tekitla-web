import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, expand, map, reduce, tap, throwError } from 'rxjs';

import { type Comment, type IssueEvent, IssuesClient, MAX_PAGES, toDomainError } from '@/app/api';

/** Eventos por página de `ListIssueEvents`. */
export const ACTIVITY_PAGE_SIZE = 50;

interface Pages {
  events: IssueEvent[];
  pages: number;
  nextCursor: string;
  hasNext: boolean;
}

/**
 * Historial (actividad) de UN issue: `ListIssueEvents` paginado, del más
 * viejo al más nuevo, y la caja para comentar. Provisto en la página de
 * detalle: vive mientras se ve el issue.
 *
 * Trae la primera página y `loadMore` sigue con la próxima (los eventos más
 * nuevos). `refresh` (después de editar o mover) vuelve a pedir las páginas
 * que ya se veían, o todas si ya se había llegado al final, así el cambio
 * nuevo aparece sin perder lo cargado.
 */
@Injectable()
export class IssueActivityStore {
  private readonly client = inject(IssuesClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _events = signal<IssueEvent[]>([]);
  private readonly _loading = signal(false);
  private readonly _loadingMore = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _hasNext = signal(false);

  readonly events = this._events.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadingMore = this._loadingMore.asReadonly();
  readonly error = this._error.asReadonly();
  readonly hasNext = this._hasNext.asReadonly();

  private target: { projectId: string; number: number } | null = null;
  private pages = 0;
  private nextCursor = '';
  private requestId = 0;

  /** Carga el historial del issue; si es el mismo que ya se ve, lo refresca. */
  load(projectId: string, number: number): void {
    if (this.target?.projectId === projectId && this.target.number === number) {
      this.refresh();
      return;
    }
    this.target = { projectId, number };
    this._events.set([]);
    this._hasNext.set(false);
    this.pages = 0;
    this.nextCursor = '';
    this._loading.set(true);
    this.fetch(1, '', false);
  }

  /** Vuelve a pedir lo que ya se veía (todas las páginas si se había llegado al final). */
  refresh(): void {
    if (!this.target) return;
    this.fetch(this._hasNext() ? Math.max(this.pages, 1) : Infinity, '', false);
  }

  /** La página siguiente (eventos más nuevos). */
  loadMore(): void {
    if (!this.target || !this._hasNext() || this._loadingMore()) return;
    this._loadingMore.set(true);
    this.fetch(1, this.nextCursor, true);
  }

  /**
   * Comenta el issue. Si el historial ya está completo, el comentario se suma
   * al final al instante; si no, aparece al llegar a la última página.
   */
  comment(body: string): Observable<Comment> {
    const target = this.target;
    if (!target) return throwError(() => new Error('IssueActivityStore.comment sin issue'));
    return this.client.createComment(target.projectId, target.number, body).pipe(
      tap((comment) => {
        if (this.target !== target || this._hasNext()) return;
        const event: IssueEvent = {
          id: `comment-${comment.id}`,
          issueId: comment.issueId,
          actorId: comment.authorId,
          createdAt: comment.createdAt,
          change: { kind: 'commented', comment },
        };
        this._events.update((list) => [...list, event]);
      }),
      catchError((err: unknown) => throwError(() => toDomainError(err))),
    );
  }

  /**
   * Pide hasta `maxPages` páginas desde `cursor`. `append`: se suman a lo que
   * hay (loadMore); si no, reemplazan todo (carga y refresco).
   */
  private fetch(maxPages: number, cursor: string, append: boolean): void {
    const target = this.target!;
    const requestId = ++this.requestId;
    this.pagesFrom(target, cursor, maxPages)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestId !== this.requestId) return;
          this._events.update((list) => (append ? [...list, ...result.events] : result.events));
          this.pages = append ? this.pages + result.pages : result.pages;
          this.nextCursor = result.nextCursor;
          this._hasNext.set(result.hasNext);
          this._error.set(null);
          this.done();
        },
        error: (err: unknown) => {
          if (requestId !== this.requestId) return;
          this._error.set(toDomainError(err).message);
          this.done();
        },
      });
  }

  private done(): void {
    this._loading.set(false);
    this._loadingMore.set(false);
  }

  private pagesFrom(
    target: { projectId: string; number: number },
    cursor: string,
    maxPages: number,
  ): Observable<Pages> {
    const page = (c: string) =>
      this.client
        .listIssueEvents(target.projectId, target.number, { cursor: c, limit: ACTIVITY_PAGE_SIZE })
        .pipe(
          map((res) => ({
            events: res.events,
            pages: 1,
            nextCursor: res.page.nextCursor,
            hasNext: res.page.hasNext && res.page.nextCursor !== '',
          })),
        );
    return page(cursor).pipe(
      expand((p, i) =>
        p.hasNext && i + 1 < Math.min(maxPages, MAX_PAGES) ? page(p.nextCursor) : EMPTY,
      ),
      reduce(
        (all, p) => ({
          events: [...all.events, ...p.events],
          pages: all.pages + 1,
          nextCursor: p.nextCursor,
          hasNext: p.hasNext,
        }),
        { events: [], pages: 0, nextCursor: '', hasNext: false } as Pages,
      ),
    );
  }
}
