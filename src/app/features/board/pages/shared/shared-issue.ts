import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Markdown } from '@/app/ui/components/markdown/markdown';
import { ActorAvatar } from '../../components/actor-avatar/actor-avatar';
import { PriorityBadge } from '../../components/priority-badge/priority-badge';
import { LABEL_TONE, issueKey, statusOf, statusTone } from '../../data-access/board.logic';
import { SharedStore } from '../../data-access/shared.store';
import { sharedLink } from '../../data-access/shared.logic';

/**
 * Detalle de un issue en un enlace de solo lectura con alcance panel (issue
 * 009, CU-009-7): título, estado, prioridad, etiquetas, asignado y
 * descripción. Sin edición, comentarios ni historial (el enlace no los deja
 * ver). Con alcance plan no hay detalle: se avisa y se vuelve al Plan.
 */
@Component({
  selector: 'app-shared-issue',
  imports: [RouterLink, Markdown, ActorAvatar, PriorityBadge, TranslatePipe],
  templateUrl: './shared-issue.html',
  styleUrl: './shared-issue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedIssue {
  protected readonly store = inject(SharedStore);

  /** Path `:number`. */
  readonly number = input.required<string>();

  protected readonly labelTone = LABEL_TONE;
  protected readonly tone = statusTone;
  protected readonly link = sharedLink;

  protected readonly issue = computed(() => {
    const n = Number(this.number());
    return Number.isInteger(n) && n > 0 && this.store.isPanel() ? this.store.issue(n) : null;
  });
  protected readonly key = computed(() => {
    const it = this.issue();
    return it ? issueKey(this.store.projectKey(), it.number) : '';
  });
  protected readonly status = computed(() => {
    const it = this.issue();
    return it ? statusOf(it, this.store.statuses()) : null;
  });
  protected readonly labels = computed(() => {
    const byId = this.store.labelsById();
    return (this.issue()?.labelIds ?? []).flatMap((id) => byId.get(id) ?? []);
  });
  protected readonly assignee = computed(() =>
    this.store.assignee(this.issue()?.assigneeActorId ?? ''),
  );
}
