import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Button } from '@/app/ui/components/button/button';
import { ItemsStore } from '../../data-access/items.store';

/** Página: lee del store y dispara acciones. No llama al API directo. */
@Component({
  selector: 'app-item-list',
  imports: [RouterLink, Button, TranslatePipe],
  templateUrl: './item-list.html',
  styleUrl: './item-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemList implements OnInit {
  protected readonly store = inject(ItemsStore);

  ngOnInit(): void {
    this.store.load();
  }
}
