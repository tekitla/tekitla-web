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
import { columnOf, issueKey } from '../../data-access/board.logic';
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
  /** Tonos de vrb por estado: badge del encabezado y punto del selector. */
  protected readonly stateTone: Record<BoardState, string> = {
    ISSUE_STATE_TODO: 'vrb-badge--neutral',
    ISSUE_STATE_IN_PROGRESS: 'vrb-badge--info',
    ISSUE_STATE_DONE: 'vrb-badge--success',
  };
  protected readonly stateDot: Record<BoardState, string> = {
    ISSUE_STATE_TODO: 'neutral',
    ISSUE_STATE_IN_PROGRESS: 'info',
    ISSUE_STATE_DONE: 'success',
  };
  protected readonly key = computed(() => issueKey(this.store.projectKey(), this.number()));
  protected readonly column = computed(() => {
    const issue = this.store.selected();
    return issue ? columnOf(issue) : null;
  });
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
      nav.set(
        [
          { label: 'shell.nav.projects', translate: true, link: ['/proyectos'] },
          project
            ? { label: project.name, link: ['/proyectos', project.id] }
            : { label: 'board.title', translate: true, link: ['/proyectos', this.projectId()] },
          { label: this.key() },
        ],
        project && { id: project.id, name: project.name },
      );
    });
  }

  protected move(state: BoardState): void {
    this.store.move(this.number(), state);
  }
}
