import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { TranslatePipe } from '@ngx-translate/core';

import { STATUS_CATEGORIES, type Status, type StatusCategory } from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { CATEGORY_TONE, countByStatus, isBoardStatus } from '../../../data-access/board.logic';
import { BoardStore } from '../../../data-access/board.store';
import { ProjectConfigStore } from '../../../data-access/project-config.store';
import {
  MAX_STATUSES,
  NAME_MAX,
  type NameError,
  defaultDestination,
  isLastOfCategory,
  nameError,
} from '../../../data-access/settings.logic';
import { SettingsSection } from '../settings-section';

/**
 * Ajustes › Estados: cada estado es una columna del tablero. Crear (nombre y
 * categoría), reordenar (subir/bajar) y, desde el menú «Más acciones» de cada
 * fila, renombrar y borrar pasando sus issues a otro estado. La categoría no cambia después de crear. Se valida del lado
 * del cliente lo que se puede (nombre, máximo, último de su categoría).
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

  protected readonly tone = CATEGORY_TONE;
  protected readonly categories = STATUS_CATEGORIES;
  protected readonly nameMax = NAME_MAX;
  protected readonly maxStatuses = MAX_STATUSES;

  protected readonly statuses = this.config.statuses;
  protected readonly columns = this.config.boardStatuses;
  protected readonly counts = computed(() => countByStatus(this.board.issues(), this.statuses()));
  protected readonly full = computed(() => this.statuses().length >= MAX_STATUSES);

  // Alta
  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newCategory = signal<StatusCategory>('ISSUE_STATE_TODO');
  protected readonly newNameError = signal<NameError | null>(null);

  // Renombrar
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly renameError = signal<NameError | null>(null);

  // Borrar
  protected readonly deletingId = signal<string | null>(null);
  protected readonly deleteTarget = signal('');

  protected isLast(status: Status): boolean {
    return isLastOfCategory(status, this.statuses());
  }

  protected countOf(status: Status): number {
    return this.counts().get(status.id) ?? 0;
  }

  protected isBoard(status: Status): boolean {
    return isBoardStatus(status);
  }

  // ── Alta ─────────────────────────────────────────────────────────────────

  protected startCreate(): void {
    this.creating.set(true);
    this.newName.set('');
    this.newNameError.set(null);
    this.clearError('create');
    this.focus('status-new-name');
  }

  protected create(): void {
    const invalid = nameError(this.newName(), this.statuses());
    this.newNameError.set(invalid);
    if (invalid) return;
    const req = { name: this.newName().trim(), category: this.newCategory() };
    this.run('create', 'createStatus', this.config.createStatus(req), () => {
      this.creating.set(false);
      this.focus('status-new');
    });
  }

  // ── Renombrar ────────────────────────────────────────────────────────────

  protected startRename(status: Status): void {
    this.renamingId.set(status.id);
    this.renameDraft.set(status.name);
    this.renameError.set(null);
    this.deletingId.set(null);
    this.clearError(status.id);
    this.focus(`status-name-${status.id}`, true);
  }

  protected rename(status: Status): void {
    const name = this.renameDraft().trim();
    if (name === status.name) {
      this.renamingId.set(null);
      return;
    }
    const invalid = nameError(name, this.statuses(), status.id);
    this.renameError.set(invalid);
    if (invalid) return;
    this.run(status.id, 'renameStatus', this.config.renameStatus(status.id, name), () => {
      this.renamingId.set(null);
      this.focus(`status-actions-${status.id}`);
    });
  }

  protected onRenameKeydown(event: KeyboardEvent, status: Status): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.renamingId.set(null);
      this.focus(`status-actions-${status.id}`);
    }
  }

  // ── Reordenar ────────────────────────────────────────────────────────────

  protected move(status: Status, direction: -1 | 1): void {
    const request = this.config.moveStatus(status.id, direction);
    if (!request) return;
    this.run(status.id, 'moveStatus', request, () => {
      // El foco sigue al botón; si quedó deshabilitado (llegó a un borde), al otro.
      const index = this.statuses().findIndex((s) => s.id === status.id);
      const atEdge = direction === -1 ? index === 0 : index === this.statuses().length - 1;
      const button = (direction === -1) !== atEdge ? 'up' : 'down';
      this.focus(`status-${button}-${status.id}`);
    });
  }

  // ── Borrar ───────────────────────────────────────────────────────────────

  protected startDelete(status: Status): void {
    this.deletingId.set(status.id);
    this.deleteTarget.set(defaultDestination(status, this.statuses()));
    this.renamingId.set(null);
    this.clearError(status.id);
    this.focus(`status-delete-panel-${status.id}`);
  }

  protected cancelDelete(status: Status): void {
    this.deletingId.set(null);
    this.focus(`status-actions-${status.id}`);
  }

  protected destinations(status: Status): Status[] {
    return this.statuses().filter((s) => s.id !== status.id);
  }

  protected remove(status: Status): void {
    // El destino viaja siempre: el conteo local puede estar viejo (otro
    // cliente sumó issues) y el servidor lo ignora si el estado está vacío.
    const moveTo = this.deleteTarget() || undefined;
    this.run(status.id, 'deleteStatus', this.config.deleteStatus(status.id, moveTo), () => {
      this.deletingId.set(null);
      // Sus issues pasaron a otro estado en el servidor: el tablero se refresca.
      this.board.refresh();
      this.focus('status-new');
    });
  }
}
