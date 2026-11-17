import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { Icon } from '@/app/ui/components/icon/icon';
import { BoardStore } from '../../data-access/board.store';

/** El mismo máximo que el alta completa (`issue-new.ts`). */
export const QUICK_ADD_MAX = 200;

/**
 * «+ Agregar» al pie de una columna (CU-033-3). Abre un campo: `Enter` crea el
 * issue con ese título al final de la columna y deja el campo vacío y con el
 * foco, listo para otro; `Esc` lo cierra y devuelve el foco al botón. Se
 * pueden crear varios seguidos sin esperar al servidor. Si un alta falla, el
 * título vuelve al campo (si quedó vacío) con el error. El aviso de creado lo
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

  protected readonly max = QUICK_ADD_MAX;
  protected readonly open = signal(false);
  protected readonly title = signal('');
  /** Error visible: `required` o el título que no se pudo crear. */
  protected readonly error = signal<
    { kind: 'required' } | { kind: 'failed'; title: string } | null
  >(null);

  protected show(): void {
    this.open.set(true);
    this.focus(() => this.field());
  }

  protected onInput(value: string): void {
    this.title.set(value);
    if (this.error()?.kind === 'required') this.error.set(null);
  }

  protected submit(): void {
    const title = this.title().trim();
    if (!title) {
      this.error.set({ kind: 'required' });
      return;
    }
    this.title.set('');
    this.error.set(null);
    this.store.quickAdd(this.statusId(), title).subscribe({
      error: () => {
        if (!this.title()) this.title.set(title);
        this.error.set({ kind: 'failed', title });
      },
    });
  }

  protected close(event?: Event): void {
    event?.stopPropagation();
    this.open.set(false);
    this.title.set('');
    this.error.set(null);
    this.focus(() => this.opener());
  }

  /** Al salir del campo vacío se cierra; con texto queda abierto (no se pierde lo escrito). */
  protected onBlur(): void {
    if (!this.title().trim() && this.error()?.kind !== 'failed') {
      this.open.set(false);
      this.error.set(null);
    }
  }

  private focus(target: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
