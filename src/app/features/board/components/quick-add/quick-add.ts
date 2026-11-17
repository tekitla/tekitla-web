import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { Icon } from '@/app/ui/components/icon/icon';
import { ISSUE_TITLE_MAX } from '../../data-access/board.logic';
import { BoardStore } from '../../data-access/board.store';

/**
 * «+ Agregar» al pie de una columna (CU-033-3). Abre un campo: `Enter` crea el
 * issue con ese título al final de la columna y deja el campo vacío y con el
 * foco, listo para otro; `Esc` lo cierra y devuelve el foco al botón. Se
 * pueden crear varios seguidos sin esperar al servidor. Si un alta falla, el
 * título vuelve al campo (si quedó vacío, o si se había cerrado) con el error. El aviso de creado lo
 * da el tablero. El resto de los campos sigue en el detalle.
 */
@Component({
  selector: 'app-quick-add',
  imports: [Icon, TranslatePipe],
  templateUrl: './quick-add.html',
  styleUrl: './quick-add.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAdd {
  private readonly store = inject(BoardStore);
  private readonly injector = inject(Injector);

  readonly statusId = input.required<string>();
  readonly column = input.required<string>();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly opener = viewChild<ElementRef<HTMLButtonElement>>('opener');

  protected readonly max = ISSUE_TITLE_MAX;
  protected readonly open = signal(false);
  protected readonly title = signal('');
  /** Pidió crear sin título (se borra al escribir). */
  protected readonly required = signal(false);
  /** Títulos que no se pudieron crear desde el último intento: se nombran todos. */
  protected readonly failed = signal<readonly string[]>([]);
  protected readonly failedText = computed(() =>
    this.failed()
      .map((t) => `«${t}»`)
      .join(', '),
  );

  protected show(): void {
    this.open.set(true);
    this.focus(() => this.field());
  }

  protected onInput(value: string): void {
    this.title.set(value);
    this.required.set(false);
  }

  protected submit(): void {
    const title = this.title().trim();
    if (!title) {
      this.required.set(true);
      return;
    }
    this.title.set('');
    this.required.set(false);
    this.failed.set([]);
    this.store.quickAdd(this.statusId(), title).subscribe({ error: () => this.fail(title) });
  }

  /**
   * Un alta falló, aunque el campo ya se haya cerrado (Esc o salir de él con
   * el pedido en vuelo): se abre con el título si no tiene otro, y el error
   * nombra todos los que fallaron. Si el foco estaba en «+ Agregar» (que
   * desaparece al abrir) o se perdió, pasa al campo.
   */
  private fail(title: string): void {
    const active = document.activeElement;
    const opener = this.opener()?.nativeElement;
    const lost = !active || active === document.body || (!!opener && active === opener);
    if (!this.open() || !this.title().trim()) this.title.set(title);
    this.open.set(true);
    this.failed.update((list) => [...list, title]);
    if (lost) this.focus(() => this.field());
  }

  protected close(event?: Event): void {
    event?.stopPropagation();
    this.reset();
    this.focus(() => this.opener());
  }

  /** Al salir del campo vacío se cierra; con texto queda abierto (no se pierde lo escrito). */
  protected onBlur(): void {
    if (!this.title().trim()) this.reset();
  }

  private reset(): void {
    this.open.set(false);
    this.title.set('');
    this.required.set(false);
    this.failed.set([]);
  }

  private focus(target: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
