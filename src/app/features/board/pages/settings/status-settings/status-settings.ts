import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { TranslatePipe } from '@ngx-translate/core';

import {
  type DomainError,
  LABEL_COLORS,
  type LabelColor,
  STATUS_CATEGORIES,
  type Status,
  type StatusCategory,
} from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { countByStatus, statusTone } from '../../../data-access/board.logic';
import { BoardStore } from '../../../data-access/board.store';
import { ProjectConfigStore } from '../../../data-access/project-config.store';
import {
  type DraftProblem,
  MAX_STATUSES,
  NAME_MAX,
  type NameError,
  type StatusDraft,
  type StatusesDraft,
  WIP_MAX,
  addStatus,
  destinationsFor,
  draftFrom,
  draftProblems,
  isDirty,
  isLastOfCategory,
  moveStatus,
  nameError,
  rebaseDraft,
  removeStatus,
  setDestination,
  toBatchRequest,
  undoRemove,
  updateStatus,
} from '../../../data-access/settings.logic';
import { SettingsSection } from '../settings-section';
import { settingsError } from '../settings-error';

/** Qué pasó con el último «Guardar». */
type SaveOutcome = 'saved' | 'rebased' | null;

/**
 * Ajustes › Estados: cada estado es una columna del tablero. Se edita un
 * BORRADOR (crear, renombrar, reordenar, color, límite WIP, mostrar en el
 * tablero y borrar pasando sus issues a otro estado) y «Guardar cambios» lo
 * manda entero en un solo request (`BatchUpdateStatuses`, todo o nada). La
 * categoría no cambia después de crear. Se valida del lado del cliente lo que
 * se puede (nombres, máximo, un estado por categoría, destinos).
 *
 * Si otro cambió los estados mientras tanto (`STALE_STATUSES`), se traen de
 * nuevo y el borrador se rebasa encima, para revisarlo y guardar otra vez.
 */
@Component({
  selector: 'app-status-settings',
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem, Button, Icon, TranslatePipe],
  templateUrl: './status-settings.html',
  styleUrl: '../settings-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusSettings extends SettingsSection {
  protected readonly board = inject(BoardStore);
  private readonly config = inject(ProjectConfigStore);

  protected readonly categories = STATUS_CATEGORIES;
  protected readonly colors: readonly LabelColor[] = ['LABEL_COLOR_UNSPECIFIED', ...LABEL_COLORS];
  protected readonly nameMax = NAME_MAX;
  protected readonly maxStatuses = MAX_STATUSES;
  protected readonly wipMax = WIP_MAX;
  protected readonly tone = statusTone;

  /** Lo guardado sobre lo que se armó el borrador. */
  private readonly saved = signal<readonly Status[]>([]);
  protected readonly draft = signal<StatusesDraft>({ statuses: [], removed: [] });
  protected readonly dirty = computed(() => isDirty(this.draft(), this.saved()));
  protected readonly problems = computed(() => draftProblems(this.draft()));
  /** Se intentó guardar: desde ahí se muestran los problemas. */
  protected readonly attempted = signal(false);
  protected readonly outcome = signal<SaveOutcome>(null);

  protected readonly counts = computed(() =>
    countByStatus(this.board.issues(), this.config.statuses()),
  );
  protected readonly full = computed(() => this.draft().statuses.length >= MAX_STATUSES);
  /** Vista previa: las columnas que va a tener el tablero. */
  protected readonly columns = computed(() => this.draft().statuses.filter((s) => !s.hidden));
  /** Problemas que no son de un nombre (esos se muestran en su fila). */
  protected readonly generalProblems = computed(() =>
    this.attempted() ? this.problems().filter((p) => p.kind !== 'name') : [],
  );

  // Alta
  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newCategory = signal<StatusCategory>('ISSUE_STATE_TODO');
  protected readonly newNameError = signal<NameError | null>(null);

  // Renombrar
  protected readonly renamingKey = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly renameError = signal<NameError | null>(null);

  constructor() {
    super();
    // Llegaron (o cambiaron) los estados guardados: si no hay cambios sin
    // guardar, el borrador los sigue.
    effect(() => {
      const statuses = this.config.statuses();
      untracked(() => {
        if (isDirty(this.draft(), this.saved())) return;
        this.saved.set(statuses);
        this.draft.set(draftFrom(statuses));
      });
    });
  }

  protected countOf(status: StatusDraft): number {
    return status.id ? (this.counts().get(status.id) ?? 0) : 0;
  }

  protected isLast(status: StatusDraft): boolean {
    return isLastOfCategory(this.draft(), status.key);
  }

  protected nameProblem(status: StatusDraft): NameError | null {
    if (!this.attempted()) return null;
    const problem = this.problems().find((p) => p.kind === 'name' && p.key === status.key);
    return problem?.kind === 'name' ? problem.error : null;
  }

  protected destinations(statusId: string): StatusDraft[] {
    return destinationsFor(this.draft(), statusId);
  }

  protected problemKey(problem: DraftProblem): string {
    return `settings.statuses.problems.${problem.kind}`;
  }

  protected removedName(statusId: string): string {
    return this.draft().removed.find((r) => r.status.id === statusId)?.status.name ?? '';
  }

  private edit(change: (draft: StatusesDraft) => StatusesDraft): void {
    this.draft.update(change);
    this.outcome.set(null);
  }

  // ── Alta ─────────────────────────────────────────────────────────────────

  protected startCreate(): void {
    this.creating.set(true);
    this.newName.set('');
    this.newNameError.set(null);
    this.focus('status-new-name');
  }

  protected create(): void {
    const named = this.draft().statuses.map((s) => ({ id: s.key, name: s.name }));
    const invalid = nameError(this.newName(), named);
    this.newNameError.set(invalid);
    if (invalid) return;
    this.edit((d) => addStatus(d, this.newName(), this.newCategory()));
    this.creating.set(false);
    this.focus('status-new');
  }

  // ── Renombrar ────────────────────────────────────────────────────────────

  protected startRename(status: StatusDraft): void {
    this.renamingKey.set(status.key);
    this.renameDraft.set(status.name);
    this.renameError.set(null);
    this.focus(`status-name-${status.key}`, true);
  }

  protected rename(status: StatusDraft): void {
    const named = this.draft().statuses.map((s) => ({ id: s.key, name: s.name }));
    const invalid = nameError(this.renameDraft(), named, status.key);
    this.renameError.set(invalid);
    if (invalid) return;
    this.edit((d) => updateStatus(d, status.key, { name: this.renameDraft().trim() }));
    this.renamingKey.set(null);
    this.focus(`status-actions-${status.key}`);
  }

  protected onRenameKeydown(event: KeyboardEvent, status: StatusDraft): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.renamingKey.set(null);
      this.focus(`status-actions-${status.key}`);
    }
  }

  // ── Color, WIP y visibilidad ─────────────────────────────────────────────

  protected setColor(status: StatusDraft, color: LabelColor): void {
    this.edit((d) => updateStatus(d, status.key, { color }));
  }

  /** Vacío o inválido = sin límite; se recorta a 0…WIP_MAX. */
  protected setWip(status: StatusDraft, input: HTMLInputElement): void {
    const value = Math.trunc(Number(input.value));
    const wipLimit = Number.isFinite(value) ? Math.min(Math.max(value, 0), WIP_MAX) : 0;
    const shown = wipLimit ? String(wipLimit) : '';
    if (input.value !== shown) input.value = shown;
    this.edit((d) => updateStatus(d, status.key, { wipLimit }));
  }

  protected setVisible(status: StatusDraft, visible: boolean): void {
    this.edit((d) => updateStatus(d, status.key, { hidden: !visible }));
  }

  // ── Reordenar ────────────────────────────────────────────────────────────

  protected move(status: StatusDraft, direction: -1 | 1): void {
    this.edit((d) => moveStatus(d, status.key, direction));
    // El foco sigue al botón; si quedó deshabilitado (llegó a un borde), al otro.
    const list = this.draft().statuses;
    const index = list.findIndex((s) => s.key === status.key);
    const atEdge = direction === -1 ? index === 0 : index === list.length - 1;
    const button = (direction === -1) !== atEdge ? 'up' : 'down';
    this.focus(`status-${button}-${status.key}`);
  }

  // ── Borrar ───────────────────────────────────────────────────────────────

  protected remove(status: StatusDraft): void {
    this.edit((d) => removeStatus(d, status.key));
    this.focus(status.id ? `status-removed-${status.id}` : 'status-new');
  }

  protected setDestination(statusId: string, moveToStatusId: string): void {
    this.edit((d) => setDestination(d, statusId, moveToStatusId));
  }

  protected undoRemove(statusId: string): void {
    this.edit((d) => undoRemove(d, statusId));
    this.focus(`status-actions-${statusId}`);
  }

  // ── Guardar ──────────────────────────────────────────────────────────────

  protected discard(): void {
    this.draft.set(draftFrom(this.saved()));
    this.attempted.set(false);
    this.outcome.set(null);
    this.error.set(null);
    this.renamingKey.set(null);
    this.creating.set(false);
  }

  protected save(): void {
    if (this.busy()) return;
    this.attempted.set(true);
    this.outcome.set(null);
    if (this.problems().length) {
      this.focus('status-problems');
      return;
    }
    const draft = this.draft();
    const req = toBatchRequest(draft);
    this.busy.set('save');
    this.error.set(null);
    this.config.saveStatuses(req).subscribe({
      next: (statuses) => {
        this.busy.set(null);
        this.saved.set(statuses);
        this.draft.set(draftFrom(statuses));
        this.attempted.set(false);
        this.outcome.set('saved');
        this.focus('status-save-outcome');
        // Sus issues pasaron a otro estado en el servidor: el tablero se refresca.
        if (req.deletions.length) this.board.refresh();
      },
      error: (err: DomainError) => {
        this.busy.set(null);
        if (err.api.reason === 'STALE_STATUSES') {
          this.rebase(draft);
          return;
        }
        this.error.set({ target: 'save', error: settingsError(err, 'saveStatuses') });
        this.focus('status-save-error');
      },
      complete: () => this.busy.set(null),
    });
  }

  /** Otro cambió los estados: se traen de nuevo y el borrador se rebasa encima. */
  private rebase(draft: StatusesDraft): void {
    this.busy.set('save');
    this.config.reloadStatuses().subscribe({
      next: (fresh) => {
        this.busy.set(null);
        this.saved.set(fresh);
        this.draft.set(rebaseDraft(draft, fresh));
        this.outcome.set('rebased');
        this.focus('status-save-outcome');
      },
      error: (err: DomainError) => {
        this.busy.set(null);
        this.error.set({ target: 'save', error: settingsError(err, 'saveStatuses') });
      },
      complete: () => this.busy.set(null),
    });
  }
}
