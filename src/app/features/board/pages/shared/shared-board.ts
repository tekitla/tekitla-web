import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue } from '@/app/api';
import { IssueCard } from '../../components/issue-card/issue-card';
import { statusTone } from '../../data-access/board.logic';
import { SharedStore } from '../../data-access/shared.store';
import { sharedLink } from '../../data-access/shared.logic';

/**
 * Tablero de un enlace de solo lectura con alcance panel (issue 009,
 * CU-009-1): las columnas visibles con sus tarjetas, sin arrastrar, sin
 * «Mover», sin alta ni ajustes. Cada tarjeta lleva al detalle del enlace.
 */
@Component({
  selector: 'app-shared-board',
  imports: [IssueCard, TranslatePipe],
  templateUrl: './shared-board.html',
  styleUrl: './shared-board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedBoard {
  protected readonly store = inject(SharedStore);
  protected readonly tone = statusTone;

  protected linkOf(issue: Issue): (string | number)[] {
    return sharedLink(this.store.token(), 'issues', issue.number);
  }
}
