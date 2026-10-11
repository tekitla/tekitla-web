import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { BOARD_STATES, type BoardState } from '@/app/api';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Markdown } from '@/app/ui/components/markdown/markdown';
import { PriorityBadge } from '../../components/priority-badge/priority-badge';
import { STATE_TONE, columnOf, issueKey } from '../../data-access/board.logic';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';

/**
 * Detalle de un issue (`/proyectos/:projectId/issues/:number`): descripción
 * Markdown renderizada y sanitizada, y selector de estado para cambiarlo de
 * columna.
 */
@Component({
  selector: 'app-issue-detail',
  imports: [RouterLink, DatePipe, Markdown, PriorityBadge, TranslatePipe],
  templateUrl: './issue-detail.html',
  styleUrl: './issue-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueDetail {
  protected readonly store = inject(BoardStore);

  readonly projectId = input.required<string>();
  readonly number = input.required({ transform: numberAttribute });

  protected readonly states = BOARD_STATES;
  protected readonly tone = STATE_TONE;
  protected readonly key = computed(() => issueKey(this.store.projectKey(), this.number()));
  protected readonly column = computed(() => {
    const issue = this.store.selected();
    return issue ? columnOf(issue) : null;
  });
  /** Descartado: no tiene columna; elegir un estado lo reabre. */
  protected readonly canceled = computed(
    () => this.store.selected()?.state === 'ISSUE_STATE_CANCELED',
  );
  protected readonly pending = computed(() => this.store.pending().has(this.number()));

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const number = this.number();
      untracked(() => {
        this.store.ensureLoaded(projectId);
        this.store.select(number);
      });
    });

    const nav = inject(ShellNav);
    effect(() => {
      const project = this.store.project();
      const { crumbs, project: shellProject } = boardNav(project, this.projectId(), {
        label: this.key(),
      });
      nav.set(crumbs, shellProject);
    });
  }

  protected move(state: BoardState): void {
    this.store.move(this.number(), state);
  }
}
