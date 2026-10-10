import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import { marked } from 'marked';

/**
 * Convierte Markdown (GFM) a HTML. NO sanitiza: el resultado se usa sólo con
 * `[innerHTML]`, que pasa por el sanitizador de Angular (saca <script>,
 * handlers `on*`, `javascript:` en enlaces, iframes, estilos…).
 */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true, breaks: true });
}

/**
 * Muestra Markdown renderizado y sanitizado.
 *
 *   <ui-markdown [source]="issue.description" />
 *
 * Excepción documentada a la regla de BEM sin selectores de etiqueta: el HTML
 * generado no tiene clases, así que se estila por etiqueta DENTRO del bloque
 * `.ui-markdown`, con encapsulación `None` (el contenido de `innerHTML` no
 * recibe los atributos de la encapsulación emulada). Todo queda bajo
 * `.ui-markdown` para no filtrarse al resto de la app.
 */
@Component({
  selector: 'ui-markdown',
  template: '<div class="ui-markdown" [innerHTML]="html()"></div>',
  styleUrl: './markdown.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Markdown {
  readonly source = input('');

  protected readonly html = computed(() => renderMarkdown(this.source()));
}
