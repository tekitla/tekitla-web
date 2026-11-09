import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { DiscardIssueRequest, Status } from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';

/** Largo máximo del motivo (tekitla-issues: `DiscardReasonMaxLen`, en runas). */
export const REASON_MAX = 500;

/**
 * Diálogo «Descartar» (`<dialog class="vrb-dialog">` nativo: foco atrapado,
 * Escape cierra). Pide el motivo (obligatorio, 1 a 500 caracteres) y, si el
 * proyecto tiene varios estados de descarte, a cuál va. No llama al backend:
 * emite `confirmed` y quien lo usa decide (y le pasa `busy` y `error`).
 */
@Component({
  selector: 'app-discard-dialog',
  imports: [Button, Icon, TranslatePipe],
  template: `
    <dialog
      #dialog
      class="vrb-dialog discard-dialog"
      aria-labelledby="discard-title"
      aria-describedby="discard-description"
      (close)="closed.emit()"
    >
      <form (submit)="$event.preventDefault(); submit()" novalidate>
        <header class="vrb-dialog__header">
          <h2 id="discard-title" class="vrb-dialog__title">
            {{ 'discard.title' | translate: { subject: subject() } }}
          </h2>
          <p id="discard-description" class="vrb-dialog__description">
            {{ 'discard.description' | translate }}
          </p>
        </header>
        <div class="vrb-dialog__body">
          <div class="vrb-field">
            <label class="vrb-field__label" for="discard-reason">
              {{ 'discard.reason' | translate }}
            </label>
            <textarea
              id="discard-reason"
              class="vrb-input discard-dialog__reason"
              rows="3"
              required
              [maxLength]="reasonMax"
              [value]="reason()"
              [placeholder]="'discard.reasonPlaceholder' | translate"
              [attr.aria-invalid]="!!invalid() || null"
              aria-describedby="discard-reason-hint discard-reason-error"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
            <p id="discard-reason-hint" class="vrb-field__hint">
              {{ 'discard.reasonHint' | translate: { count: length(), max: reasonMax } }}
            </p>
            <p id="discard-reason-error" class="vrb-field__error" aria-live="polite">
              @if (invalid(); as invalid) {
                {{ 'discard.errors.' + invalid | translate: { max: reasonMax } }}
              }
            </p>
          </div>
          @if (statuses().length > 1) {
            <div class="vrb-field">
              <label class="vrb-field__label" for="discard-status">
                {{ 'discard.status' | translate }}
              </label>
              <div class="vrb-select">
                <select
                  id="discard-status"
                  class="vrb-input"
                  (change)="statusId.set($any($event.target).value)"
                >
                  @for (status of statuses(); track status.id) {
                    <option [value]="status.id" [selected]="status.id === chosenStatus()">
                      {{ status.name }}
                    </option>
                  }
                </select>
              </div>
            </div>
          }
          @if (error(); as error) {
            <p class="vrb-field__error" role="alert">{{ error }}</p>
          }
        </div>
        <footer class="vrb-dialog__footer">
          <ui-button variant="ghost" (pressed)="close()">
            {{ 'common.cancel' | translate }}
          </ui-button>
          <ui-button type="submit" variant="danger" [loading]="busy()">
            {{ 'discard.confirm' | translate }}
          </ui-button>
        </footer>
      </form>
      <button
        type="button"
        class="vrb-dialog__close"
        [attr.aria-label]="'common.close' | translate"
        (click)="close()"
      >
        <ui-icon name="close" />
      </button>
    </dialog>
  `,
  styles: `
    .discard-dialog {
      width: min(520px, calc(100vw - 32px));
    }
    .discard-dialog__reason {
      height: auto;
      min-height: 88px;
      padding-block: var(--space-2);
      resize: vertical;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscardDialog {
  /** Qué se descarta: `TK-3` o «3 issues». */
  readonly subject = input.required<string>();
  /** Estados de categoría CANCELED, en orden; el primero es el destino por defecto. */
  readonly statuses = input<readonly Status[]>([]);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<DiscardIssueRequest>();
  /** Se cerró (Cancelar, Escape o la X), o lo cerró quien lo usa. */
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly reasonMax = REASON_MAX;
  protected readonly reason = signal('');
  protected readonly statusId = signal('');
  protected readonly invalid = signal<'required' | 'tooLong' | null>(null);
  protected readonly length = computed(() => Array.from(this.reason().trim()).length);
  protected readonly chosenStatus = computed(() => this.statusId() || this.statuses()[0]?.id || '');

  open(): void {
    this.reason.set('');
    this.statusId.set('');
    this.invalid.set(null);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLTextAreaElement>('#discard-reason')?.focus();
  }

  close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }

  protected submit(): void {
    if (this.busy()) return;
    const reason = this.reason().trim();
    const invalid = !reason ? 'required' : this.length() > REASON_MAX ? 'tooLong' : null;
    this.invalid.set(invalid);
    if (invalid) {
      this.dialog().nativeElement.querySelector<HTMLTextAreaElement>('#discard-reason')?.focus();
      return;
    }
    // Con un solo estado de descarte, el backend elige el primero.
    const statusId = this.statuses().length > 1 ? this.chosenStatus() : undefined;
    this.confirmed.emit({ reason, statusId });
  }
}
