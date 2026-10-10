import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { ItemsStore } from '../../data-access/items.store';

@Component({
  selector: 'app-item-detail',
  imports: [RouterLink, DatePipe, TranslatePipe],
  templateUrl: './item-detail.html',
  styleUrl: './item-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetail {
  protected readonly store = inject(ItemsStore);

  /** Viene del path `:id` (withComponentInputBinding en app.config.ts). */
  readonly id = input.required<string>();

  constructor() {
    // Cada vez que cambia el id de la URL, el store carga ese item.
    effect(() => this.store.select(this.id()));
  }
}
