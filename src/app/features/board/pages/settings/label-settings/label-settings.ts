import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LABEL_COLORS, type Label, type LabelColor } from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { LABEL_TONE } from '../../../data-access/board.logic';
import { BoardStore } from '../../../data-access/board.store';
import { ProjectConfigStore } from '../../../data-access/project-config.store';
import {
  MAX_LABELS,
  NAME_MAX,
  type NameError,
  nameError,
} from '../../../data-access/settings.logic';
import { SettingsSection } from '../settings-section';

type Color = Exclude<LabelColor, 'LABEL_COLOR_UNSPECIFIED'>;

/**
 * Ajustes › Etiquetas: crear (nombre y color, un tono del design system),
 * editar en el lugar y borrar (el backend la quita de todos los issues).
 */
@Component({
  selector: 'app-label-settings',
  imports: [Button, Icon, TranslatePipe],
  templateUrl: './label-settings.html',
  styleUrl: '../settings-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelSettings extends SettingsSection {
  private readonly board = inject(BoardStore);
  private readonly config = inject(ProjectConfigStore);

  protected readonly tone = LABEL_TONE;
  protected readonly colors = LABEL_COLORS;
  protected readonly nameMax = NAME_MAX;
  protected readonly maxLabels = MAX_LABELS;

  protected readonly labels = this.config.labels;
  protected readonly full = computed(() => this.labels().length >= MAX_LABELS);
  /** En cuántos issues está cada etiqueta (para avisar antes de borrarla). */
  protected readonly usage = computed(() => {
    const counts = new Map<string, number>();
    for (const issue of this.board.issues()) {
      for (const id of issue.labelIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  });

  // Alta
  protected readonly newName = signal('');
  protected readonly newColor = signal<Color>('LABEL_COLOR_NEUTRAL');
  protected readonly newNameError = signal<NameError | null>(null);

  // Editar
  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editColor = signal<Color>('LABEL_COLOR_NEUTRAL');
  protected readonly editNameError = signal<NameError | null>(null);

  // Borrar
  protected readonly deletingId = signal<string | null>(null);

  protected usageOf(label: Label): number {
    return this.usage().get(label.id) ?? 0;
  }

  protected create(): void {
    const invalid = nameError(this.newName(), this.labels());
    this.newNameError.set(invalid);
    if (invalid) return;
    const req = { name: this.newName().trim(), color: this.newColor() };
    this.run('create', 'createLabel', this.config.createLabel(req), () => {
      this.newName.set('');
      this.focus('label-new-name');
    });
  }

  protected startEdit(label: Label): void {
    this.editingId.set(label.id);
    this.editName.set(label.name);
    this.editColor.set(
      label.color === 'LABEL_COLOR_UNSPECIFIED' ? 'LABEL_COLOR_NEUTRAL' : label.color,
    );
    this.editNameError.set(null);
    this.deletingId.set(null);
    this.clearError(label.id);
    this.focus(`label-name-${label.id}`, true);
  }

  protected save(label: Label): void {
    const name = this.editName().trim();
    const invalid = nameError(name, this.labels(), label.id);
    this.editNameError.set(invalid);
    if (invalid) return;
    const req = {
      name: name === label.name ? undefined : name,
      color: this.editColor() === label.color ? undefined : this.editColor(),
    };
    if (!req.name && !req.color) {
      this.stopEdit(label);
      return;
    }
    this.run(label.id, 'updateLabel', this.config.updateLabel(label.id, req), () =>
      this.stopEdit(label),
    );
  }

  protected stopEdit(label: Label): void {
    this.editingId.set(null);
    this.focus(`label-edit-${label.id}`);
  }

  protected onEditKeydown(event: KeyboardEvent, label: Label): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.stopEdit(label);
    }
  }

  protected startDelete(label: Label): void {
    this.deletingId.set(label.id);
    this.editingId.set(null);
    this.clearError(label.id);
    this.focus(`label-delete-panel-${label.id}`);
  }

  protected cancelDelete(label: Label): void {
    this.deletingId.set(null);
    this.focus(`label-delete-${label.id}`);
  }

  protected remove(label: Label): void {
    this.run(label.id, 'deleteLabel', this.config.deleteLabel(label.id), () => {
      this.deletingId.set(null);
      // El backend la quitó de los issues: el tablero se refresca.
      this.board.refresh();
      this.focus('label-new-name');
    });
  }
}
