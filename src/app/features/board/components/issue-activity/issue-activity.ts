import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import type { DomainError, IssueEvent } from '@/app/api';
import { SessionStore } from '@/app/core/auth/session.store';
import { initialsOf } from '@/app/layout/shell/initials';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { Markdown } from '@/app/ui/components/markdown/markdown';
import { CATEGORY_TONE } from '../../data-access/board.logic';
import { IssueActivityStore } from '../../data-access/issue-activity.store';
import { PRIORITY_LEVEL, PRIORITY_TONE } from '../priority-badge/priority-badge';

/** Largo máximo de un comentario (el backend rechaza más). */
export const COMMENT_MAX = 10_000;

type Filter = 'all' | 'changes' | 'comments';

/**
 * Actividad de un issue (`IssueActivityStore`): línea de tiempo del más viejo
 * al más nuevo, filtro Todo / Cambios / Comentarios y caja para comentar. El
 * autor es el uid (los nombres llegan con accounts-service, rebanada 3b): la
 * sesión propia se muestra como «Tú».
 */
@Component({
  selector: 'app-issue-activity',
  imports: [DatePipe, ReactiveFormsModule, Button, Icon, Markdown, TranslatePipe],
  templateUrl: './issue-activity.html',
  styleUrl: './issue-activity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueActivity {
  protected readonly store = inject(IssueActivityStore);
  private readonly session = inject(SessionStore);

  protected readonly categoryTone = CATEGORY_TONE;
  protected readonly priorityLevel = PRIORITY_LEVEL;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly commentMax = COMMENT_MAX;
  protected readonly filters: readonly Filter[] = ['all', 'changes', 'comments'];
  protected readonly filter = signal<Filter>('all');
  protected readonly visible = computed(() => {
    const filter = this.filter();
    return this.store.events().filter((e) => {
      const comment = e.change.kind === 'commented';
      return filter === 'all' || (filter === 'comments') === comment;
    });
  });

  protected readonly body = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(COMMENT_MAX)],
  });
  protected readonly posting = signal(false);
  protected readonly postError = signal<string | null>(null);

  protected isMe(event: IssueEvent): boolean {
    return event.actorId !== '' && event.actorId === this.session.user()?.uid;
  }

  protected initials(event: IssueEvent): string {
    return this.isMe(event)
      ? initialsOf(this.session.user()) || '?'
      : event.actorId.slice(0, 2).toUpperCase() || '?';
  }

  /** «Hoy 14:05» para lo de hoy; «6 oct, 10:12» para lo demás (como el diseño). */
  protected isToday(iso: string): boolean {
    const date = new Date(iso);
    return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
  }

  protected submit(): void {
    if (this.posting()) return;
    const body = this.body.value.trim();
    if (!body || this.body.invalid) {
      this.body.markAsTouched();
      return;
    }
    this.posting.set(true);
    this.postError.set(null);
    this.store.comment(body).subscribe({
      next: () => {
        this.posting.set(false);
        this.body.reset();
      },
      error: (err: DomainError) => {
        this.posting.set(false);
        this.postError.set(err.message);
      },
    });
  }

  /** Ctrl/⌘ + Enter comenta. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    }
  }
}
