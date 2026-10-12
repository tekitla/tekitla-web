import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { Markdown } from '../markdown/markdown';

/**
 * Editor de Markdown (`vrb-editor`): pestañas Escribir / Vista previa sobre un
 * textarea. El valor entra y sale con `[(value)]`; la etiqueta la pone quien lo
 * usa con un `<label [for]="inputId">`.
 *
 *   <ui-markdown-editor inputId="desc" [(value)]="draft" describedBy="desc-hint" />
 */
@Component({
  selector: 'ui-markdown-editor',
  imports: [Markdown, TranslatePipe],
  template: `
    <div class="vrb-editor">
      <div class="vrb-editor__bar" role="tablist" [attr.aria-label]="'editor.mode' | translate">
        <button
          type="button"
          class="vrb-editor__tab"
          role="tab"
          [id]="inputId() + '-write'"
          [attr.aria-controls]="inputId()"
          [attr.aria-selected]="!preview()"
          (click)="preview.set(false)"
        >
          {{ 'editor.write' | translate }}
        </button>
        <button
          type="button"
          class="vrb-editor__tab"
          role="tab"
          [id]="inputId() + '-preview-tab'"
          [attr.aria-controls]="inputId() + '-preview'"
          [attr.aria-selected]="preview()"
          (click)="preview.set(true)"
        >
          {{ 'editor.preview' | translate }}
        </button>
      </div>
      <textarea
        class="vrb-editor__input"
        [id]="inputId()"
        [rows]="rows()"
        [maxLength]="maxLength()"
        [value]="value()"
        [hidden]="preview()"
        [attr.aria-describedby]="describedBy() || null"
        (input)="value.set($any($event.target).value)"
      ></textarea>
      @if (preview()) {
        <div
          class="vrb-editor__preview"
          role="tabpanel"
          [id]="inputId() + '-preview'"
          [attr.aria-labelledby]="inputId() + '-preview-tab'"
        >
          @if (value().trim()) {
            <ui-markdown [source]="value()" />
          } @else {
            <p class="ui-markdown-editor__muted">{{ 'editor.previewEmpty' | translate }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .vrb-editor__input[hidden] {
      display: none;
    }
    .ui-markdown-editor__muted {
      margin: 0;
      color: var(--vrb-muted-fg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownEditor {
  readonly inputId = input.required<string>();
  readonly value = model('');
  readonly rows = input(8);
  readonly maxLength = input(65_536);
  readonly describedBy = input('');

  protected readonly preview = signal(false);
}
