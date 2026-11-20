import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { CiStatus, IssueLink, PrState } from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { ReposStore } from '../../data-access/repos.store';

const PR_TONE: Record<PrState, string> = {
  PR_STATE_UNSPECIFIED: 'neutral',
  PR_STATE_NONE: 'neutral',
  PR_STATE_DRAFT: 'neutral',
  PR_STATE_OPEN: 'info',
  PR_STATE_MERGED: 'success',
  PR_STATE_CLOSED: 'neutral',
};

const CI_TONE: Record<CiStatus, string> = {
  CI_STATUS_UNSPECIFIED: 'neutral',
  CI_STATUS_NONE: 'neutral',
  CI_STATUS_PENDING: 'warning',
  CI_STATUS_SUCCESS: 'success',
  CI_STATUS_FAILED: 'danger',
  CI_STATUS_CANCELED: 'neutral',
};

/**
 * «Ramas vinculadas» del detalle de un issue (issue 016): repo, rama, PR,
 * estado del CI y quién y cuándo. Ligar a mano una rama de un repo del
 * proyecto y quitar un link (queda suprimido: un push nuevo no lo recrea).
 */
@Component({
  selector: 'app-issue-links',
  imports: [Button, DatePipe, TranslatePipe],
  templateUrl: './issue-links.html',
  styleUrl: './issue-links.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueLinks {
  protected readonly store = inject(ReposStore);

  readonly projectId = input.required<string>();
  readonly number = input.required<number>();
  /** Clave del issue (TK-9), para el texto de ayuda. */
  readonly issueKey = input('');

  protected readonly prTone = PR_TONE;
  protected readonly ciTone = CI_TONE;

  protected readonly links = computed<readonly IssueLink[]>(
    () => this.store.linksByIssue().get(this.number()) ?? [],
  );

  protected readonly adding = signal(false);
  protected readonly repoId = signal('');
  protected readonly branch = signal('');
  protected readonly branchMissing = signal(false);
  protected readonly saving = signal(false);
  protected readonly removing = signal<string | null>(null);

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const number = this.number();
      untracked(() => {
        // El panel reutiliza el componente al pasar de un issue a otro.
        this.adding.set(false);
        this.branch.set('');
        this.branchMissing.set(false);
        this.store.loadIssueLinks(projectId, number);
      });
    });
  }

  protected openAdd(): void {
    this.adding.set(true);
    const repos = this.store.repositories();
    if (!repos.some((r) => r.id === this.repoId())) this.repoId.set(repos[0]?.id ?? '');
  }

  protected add(): void {
    const branch = this.branch().trim();
    this.branchMissing.set(!branch);
    if (!branch || !this.repoId() || this.saving()) return;
    this.saving.set(true);
    this.store.link(this.number(), this.repoId(), branch).subscribe({
      next: () => {
        this.saving.set(false);
        this.adding.set(false);
        this.branch.set('');
      },
      error: () => this.saving.set(false),
    });
  }

  protected remove(link: IssueLink): void {
    if (this.removing()) return;
    this.removing.set(link.id);
    this.store.unlink(this.number(), link.id).subscribe({
      next: () => this.removing.set(null),
      error: () => this.removing.set(null),
    });
  }
}
