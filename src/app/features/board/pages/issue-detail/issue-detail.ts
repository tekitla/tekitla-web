import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  type DiscardIssueRequest,
  type DomainError,
  PRIORITIES,
  type Priority,
  type UpdateIssueRequest,
} from '@/app/api';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { Markdown } from '@/app/ui/components/markdown/markdown';
import { MarkdownEditor } from '@/app/ui/components/markdown-editor/markdown-editor';
import { DiscardDialog } from '../../components/discard-dialog/discard-dialog';
import { DiscardNote } from '../../components/discard-note/discard-note';
import { IssueActivity } from '../../components/issue-activity/issue-activity';
import {
  PRIORITY_LEVEL,
  PRIORITY_TONE,
  PriorityBadge,
} from '../../components/priority-badge/priority-badge';
import { LABEL_TONE, issueKey, statusTone } from '../../data-access/board.logic';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';
import { IssueActivityStore } from '../../data-access/issue-activity.store';

/** Límites del backend (tekitla-issues: `IssueTitleMaxLen`, `IssueDescriptionMaxLen`). */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 20_000;

/** Campo que se está guardando (o que falló), para mostrar el error a su lado. */
type Field = 'title' | 'description' | 'priority' | 'labels';

/**
 * Detalle de un issue (`/proyectos/:projectId/issues/:number`):
 * - título y descripción (Markdown) editables en el lugar;
 * - estado (cualquiera salvo los de descarte), prioridad y etiquetas en la
 *   barra lateral: se guardan al cambiarlos;
 * - «Descartar…» (diálogo con el motivo) o, si está descartado, quién y por
 *   qué y «Restaurar». `?descartar=1` (desde el menú de la tarjeta) abre el
 *   diálogo al entrar;
 * - actividad (`IssueActivity`): historial paginado y comentarios. Se refresca
 *   cuando el servidor confirma un cambio del issue (cambia su `updatedAt`).
 */
@Component({
  selector: 'app-issue-detail',
  imports: [
    RouterLink,
    DatePipe,
    Button,
    Icon,
    Markdown,
    MarkdownEditor,
    PriorityBadge,
    IssueActivity,
    DiscardDialog,
    DiscardNote,
    TranslatePipe,
  ],
  providers: [IssueActivityStore],
  templateUrl: './issue-detail.html',
  styleUrl: './issue-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueDetail {
  protected readonly store = inject(BoardStore);
  private readonly activity = inject(IssueActivityStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);

  readonly projectId = input.required<string>();
  readonly number = input.required({ transform: numberAttribute });
  /** Query param `?descartar=1`: abrir el diálogo al entrar. */
  readonly descartar = input<string>();

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly discardDialog = viewChild(DiscardDialog);

  protected readonly tone = statusTone;
  protected readonly labelTone = LABEL_TONE;
  protected readonly priorities = PRIORITIES;
  protected readonly priorityDot = (priority: Priority) => PRIORITY_TONE[PRIORITY_LEVEL[priority]];
  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;

  protected readonly key = computed(() => issueKey(this.store.projectKey(), this.number()));
  protected readonly status = computed(() => {
    const issue = this.store.selected();
    return issue ? this.store.statusOf(issue) : null;
  });
  /** Estados del selector: todos salvo los de descarte (descartar pide un motivo). */
  protected readonly statusOptions = computed(() =>
    this.store.statuses().filter((s) => s.category !== 'ISSUE_STATE_CANCELED'),
  );
  /** A dónde puede ir al descartarlo. */
  protected readonly canceledStatuses = computed(() =>
    this.store.statuses().filter((s) => s.category === 'ISSUE_STATE_CANCELED'),
  );
  protected readonly canceled = computed(() => this.status()?.category === 'ISSUE_STATE_CANCELED');
  protected readonly pending = computed(() => this.store.pending().has(this.number()));

  // ── Edición ──────────────────────────────────────────────────────────────
  protected readonly editingTitle = signal(false);
  protected readonly titleDraft = signal('');
  /** Se intentó guardar un título vacío. */
  protected readonly titleEmpty = signal(false);
  protected readonly editingDescription = signal(false);
  protected readonly descriptionDraft = signal('');
  protected readonly saving = signal<Field | null>(null);
  protected readonly fieldError = signal<{ field: Field; message: string } | null>(null);

  // ── Descartar y restaurar ────────────────────────────────────────────────
  protected readonly discarding = signal(false);
  protected readonly discardError = signal<string | null>(null);
  protected readonly restoring = signal(false);
  protected readonly restoreError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const number = this.number();
      untracked(() => {
        this.store.ensureLoaded(projectId);
        this.store.select(number);
        this.activity.load(projectId, number);
        this.editingTitle.set(false);
        this.editingDescription.set(false);
        this.fieldError.set(null);
      });
    });

    // Un cambio confirmado por el servidor (editar, mover) deja su evento en
    // el historial: se refresca la actividad.
    let seen: { number: number; updatedAt: string } | null = null;
    effect(() => {
      const issue = this.store.selected();
      if (!issue) return;
      const changed = seen?.number === issue.number && seen.updatedAt !== issue.updatedAt;
      seen = { number: issue.number, updatedAt: issue.updatedAt };
      if (changed) untracked(() => this.activity.refresh());
    });

    const nav = inject(ShellNav);
    effect(() => {
      const project = this.store.project();
      const { crumbs, project: shellProject } = boardNav(project, this.projectId(), {
        label: this.key(),
      });
      nav.set(crumbs, shellProject);
    });

    // «Descartar…» desde la tarjeta: con el issue y los estados ya cargados,
    // abre el diálogo y saca el parámetro (volver atrás no lo reabre).
    effect(() => {
      if (!this.descartar() || !this.store.selected() || !this.store.statuses().length) return;
      untracked(() => {
        // El diálogo está dentro del bloque del issue: existe después del render.
        if (!this.canceled()) {
          afterNextRender(() => this.openDiscard(), { injector: this.injector });
        }
        void this.router.navigate([], {
          queryParams: { descartar: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    });
  }

  protected openDiscard(): void {
    this.discardError.set(null);
    this.discardDialog()?.open();
  }

  protected discard(req: DiscardIssueRequest): void {
    if (this.discarding()) return;
    this.discarding.set(true);
    this.discardError.set(null);
    this.store.discard(this.number(), req).subscribe({
      next: () => {
        this.discarding.set(false);
        this.discardDialog()?.close();
        this.focusAfterRender('issue-restore');
      },
      error: (err: DomainError) => {
        this.discarding.set(false);
        this.discardError.set(err.message);
        // Ya estaba descartado (otro lo hizo): se trae como está.
        if (err.api.reason === 'ISSUE_ALREADY_DISCARDED') this.store.select(this.number());
      },
    });
  }

  protected restore(): void {
    if (this.restoring()) return;
    this.restoring.set(true);
    this.restoreError.set(null);
    this.store.restore(this.number()).subscribe({
      next: () => {
        this.restoring.set(false);
        this.focusAfterRender('issue-status');
      },
      error: (err: DomainError) => {
        this.restoring.set(false);
        this.restoreError.set(err.message);
        // Ya no estaba descartado (otro lo movió): se trae como está.
        if (err.api.reason === 'ISSUE_NOT_DISCARDED') this.store.select(this.number());
      },
    });
  }

  private focusAfterRender(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  protected moveTo(statusId: string): void {
    this.store.move(this.number(), statusId);
  }

  // ── Título ───────────────────────────────────────────────────────────────

  protected editTitle(): void {
    this.titleDraft.set(this.store.selected()?.title ?? '');
    this.editingTitle.set(true);
    this.titleEmpty.set(false);
    this.clearError('title');
    afterNextRender(() => this.titleInput()?.nativeElement.select(), { injector: this.injector });
  }

  protected saveTitle(): void {
    const title = this.titleDraft().trim();
    this.titleEmpty.set(!title);
    if (!title) return;
    if (title === this.store.selected()?.title) {
      this.editingTitle.set(false);
      return;
    }
    this.save('title', { title }, () => this.editingTitle.set(false));
  }

  protected onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.editingTitle.set(false);
    }
  }

  // ── Descripción ──────────────────────────────────────────────────────────

  protected editDescription(): void {
    this.descriptionDraft.set(this.store.selected()?.description ?? '');
    this.editingDescription.set(true);
    this.clearError('description');
  }

  protected saveDescription(): void {
    const description = this.descriptionDraft();
    if (description === this.store.selected()?.description) {
      this.editingDescription.set(false);
      return;
    }
    this.save('description', { description }, () => this.editingDescription.set(false));
  }

  // ── Prioridad y etiquetas ────────────────────────────────────────────────

  protected setPriority(priority: Exclude<Priority, 'PRIORITY_UNSPECIFIED'>): void {
    if (priority === this.store.selected()?.priority) return;
    this.save('priority', { priority }, undefined, () => this.syncPriority());
  }

  protected hasLabel(labelId: string): boolean {
    return this.store.selected()?.labelIds.includes(labelId) ?? false;
  }

  protected toggleLabel(input: HTMLInputElement, labelId: string): void {
    const current = this.store.selected()?.labelIds ?? [];
    const labelIds = input.checked
      ? [...new Set([...current, labelId])]
      : current.filter((id) => id !== labelId);
    this.save('labels', { labelIds }, undefined, () => (input.checked = this.hasLabel(labelId)));
  }

  /**
   * Vuelve a marcar la prioridad guardada. `[checked]` no se reaplica si su
   * valor no cambió, así que tras un rechazo hay que corregir el DOM a mano.
   */
  private syncPriority(): void {
    const current = this.store.selected()?.priority;
    const radios = this.host.nativeElement.querySelectorAll<HTMLInputElement>(
      'input[name="issue-priority"]',
    );
    for (const radio of radios) radio.checked = radio.value === current;
  }

  protected errorFor(field: Field): string | null {
    const error = this.fieldError();
    return error?.field === field ? error.message : null;
  }

  /**
   * Guarda un campo. Uno a la vez: mientras guarda, los controles de la barra
   * lateral quedan deshabilitados. `revert` deja el control como el dato
   * guardado si el pedido no sale o el servidor lo rechaza.
   */
  private save(
    field: Field,
    req: UpdateIssueRequest,
    done?: () => void,
    revert?: () => void,
  ): void {
    if (this.saving()) {
      revert?.();
      return;
    }
    this.saving.set(field);
    this.clearError(field);
    this.store.update(this.number(), req).subscribe({
      next: () => {
        this.saving.set(null);
        done?.();
      },
      error: (err: DomainError) => {
        this.saving.set(null);
        this.fieldError.set({ field, message: err.message });
        revert?.();
      },
    });
  }

  private clearError(field: Field): void {
    if (this.fieldError()?.field === field) this.fieldError.set(null);
  }
}
