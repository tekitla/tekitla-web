import { DatePipe } from '@angular/common';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { type DiscardIssueRequest, type Issue, PRIORITIES } from '@/app/api';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { DiscardDialog } from '../../components/discard-dialog/discard-dialog';
import { DiscardNote } from '../../components/discard-note/discard-note';
import { PriorityBadge } from '../../components/priority-badge/priority-badge';
import { boardNav } from '../../board-nav';
import { LABEL_TONE, isDiscarded, issueKey, statusTone } from '../../data-access/board.logic';
import { BoardStore } from '../../data-access/board.store';
import {
  type IssueFilters,
  type IssueScope,
  type IssueSort,
  PRIORITY_PARAM,
  QUERY_MAX,
  SCOPES,
  SORTS,
  filtersFromParams,
  filtersToParams,
  hasFilters,
} from '../../data-access/issue-list.logic';
import { IssueListStore } from '../../data-access/issue-list.store';

/** Espera después de la última tecla antes de buscar (ListIssues: 300/min, ráfaga 60). */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Lista de issues de un proyecto (`/proyectos/:projectId/issues`): pestañas
 * Activos / Hechos / Descartados / Todos, búsqueda por título o clave (`/`
 * la enfoca), filtros por prioridad, etiqueta y estado, y orden. Todo queda
 * en la URL (se puede compartir; recargar muestra lo mismo). «Cargar más»
 * pide la página siguiente.
 *
 * Selección múltiple: mover, descartar (con motivo) o restaurar issue por
 * issue, con el reporte de los que fallaron. En Descartados cada fila dice
 * quién y por qué, con «Restaurar».
 */
@Component({
  selector: 'app-issue-list',
  imports: [
    RouterLink,
    DatePipe,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    Button,
    Icon,
    PriorityBadge,
    DiscardDialog,
    DiscardNote,
    TranslatePipe,
  ],
  providers: [IssueListStore],
  templateUrl: './issue-list.html',
  styleUrl: './issue-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
})
export class IssueList {
  protected readonly board = inject(BoardStore);
  protected readonly list = inject(IssueListStore);
  private readonly router = inject(Router);

  readonly projectId = input.required<string>();
  // Query params (withComponentInputBinding).
  readonly q = input<string>();
  readonly ver = input<string>();
  readonly prioridad = input<string>();
  readonly etiqueta = input<string>();
  readonly estado = input<string>();
  readonly orden = input<string>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly discardDialog = viewChild(DiscardDialog);

  protected readonly scopes = SCOPES;
  protected readonly scopeTone: Record<IssueScope, string> = {
    activos: 'info',
    hechos: 'success',
    descartados: 'danger',
    todos: 'neutral',
  };
  protected readonly sorts = SORTS;
  protected readonly priorities = PRIORITIES;
  protected readonly priorityParam = Object.fromEntries(
    Object.entries(PRIORITY_PARAM).map(([param, priority]) => [priority, param]),
  ) as Record<string, string>;
  protected readonly queryMax = QUERY_MAX;
  protected readonly tone = statusTone;
  protected readonly labelTone = LABEL_TONE;

  /** Los filtros salen de la URL: es la fuente de verdad. */
  protected readonly filters = computed(() =>
    filtersFromParams({
      q: this.q(),
      ver: this.ver(),
      prioridad: this.prioridad(),
      etiqueta: this.etiqueta(),
      estado: this.estado(),
      orden: this.orden(),
    }),
  );
  protected readonly filtered = computed(() => hasFilters(this.filters()));
  /** Lo que se está escribiendo en la búsqueda (va a la URL con un debounce). */
  protected readonly queryDraft = signal('');
  protected readonly statusOptions = computed(() =>
    this.board.statuses().filter((s) => s.category !== 'ISSUE_STATE_CANCELED'),
  );
  protected readonly canceledStatuses = computed(() =>
    this.board.statuses().filter((s) => s.category === 'ISSUE_STATE_CANCELED'),
  );
  protected readonly selectedDiscarded = computed(
    () => this.list.selectedIssues().filter((i) => this.discarded(i)).length,
  );
  protected readonly discardError = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      untracked(() => this.board.ensureLoaded(projectId));
    });

    effect(() => {
      const projectId = this.projectId();
      const filters = this.filters();
      untracked(() => {
        this.list.load(projectId, filters);
        // La URL manda (recargar, atrás/adelante): la caja la sigue si no se está escribiendo.
        if (this.searchTimer === undefined) this.queryDraft.set(filters.query);
      });
    });

    const nav = inject(ShellNav);
    effect(() => {
      const { crumbs, project } = boardNav(this.board.project(), this.projectId(), {
        label: 'issueList.title',
        translate: true,
      });
      nav.set(crumbs, project);
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected key(issue: Issue): string {
    return issueKey(this.board.projectKey(), issue.number);
  }

  protected statusOf(issue: Issue) {
    return this.board.statusOf(issue);
  }

  protected discarded(issue: Issue): boolean {
    return isDiscarded(issue, this.board.statuses());
  }

  protected labelsOf(issue: Issue) {
    const byId = this.board.labelsById();
    return issue.labelIds.map((id) => byId.get(id)).filter((l) => !!l);
  }

  // ── Filtros (a la URL) ────────────────────────────────────────────────────

  private navigate(patch: Partial<IssueFilters>): void {
    const params = filtersToParams({ ...this.filters(), ...patch });
    void this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      // Escribir no llena el historial; cambiar de pestaña o filtro sí.
      replaceUrl: 'query' in patch,
    });
  }

  protected onQueryInput(value: string): void {
    this.queryDraft.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = undefined;
      if (value.trim() !== this.filters().query.trim()) this.navigate({ query: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Enter busca sin esperar el debounce. */
  protected searchNow(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    if (this.queryDraft().trim() !== this.filters().query.trim()) {
      this.navigate({ query: this.queryDraft() });
    }
  }

  protected setScope(scope: IssueScope): void {
    this.navigate({ scope });
  }

  protected setPriority(value: string): void {
    this.navigate({ priority: PRIORITY_PARAM[value] ?? '' });
  }

  protected setLabel(labelId: string): void {
    this.navigate({ labelId });
  }

  protected setStatus(statusId: string): void {
    this.navigate({ statusId });
  }

  protected setSort(sort: IssueSort): void {
    this.navigate({ sort });
  }

  protected clearFilters(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.queryDraft.set('');
    this.navigate({ query: '', priority: '', labelId: '', statusId: '' });
  }

  /** `/` enfoca la búsqueda (salvo que ya se esté escribiendo en un campo). */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const typing =
      target?.closest('input, textarea, select, [contenteditable="true"]') ||
      target?.isContentEditable;
    if (typing || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
    this.searchInput()?.nativeElement.select();
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  protected restoreOne(issue: Issue): void {
    this.list.restoreIssue(issue);
  }

  protected moveSelected(statusId: string): void {
    this.list.moveSelected(statusId);
  }

  protected openDiscard(): void {
    this.discardError.set(null);
    this.discardDialog()?.open();
  }

  protected discardSelected(req: DiscardIssueRequest): void {
    this.list.discardSelected(req, (issue) => !this.discarded(issue));
    this.discardDialog()?.close();
  }

  protected restoreSelected(): void {
    this.list.restoreSelected((issue) => this.discarded(issue));
  }
}
