import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { DomainError, PRIORITIES, type Priority } from '@/app/api';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Markdown } from '@/app/ui/components/markdown/markdown';
import { PRIORITY_LEVEL, PRIORITY_TONE } from '../../components/priority-badge/priority-badge';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';

const TITLE_MAX = 200;

/**
 * Alta de issue: título, prioridad (selector segmentado) y descripción en
 * Markdown con pestañas Escribir / Vista previa (`vrb-editor`).
 */
@Component({
  selector: 'app-issue-new',
  imports: [ReactiveFormsModule, RouterLink, Button, Markdown, TranslatePipe],
  templateUrl: './issue-new.html',
  styleUrl: './issue-new.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueNew {
  protected readonly store = inject(BoardStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  readonly projectId = input.required<string>();

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  protected readonly priorities = PRIORITIES;
  /** El backend crea el issue en el primer estado de la categoría «Por hacer». */
  protected readonly firstStatus = computed(() =>
    this.store.statuses().find((s) => s.category === 'ISSUE_STATE_TODO'),
  );
  /** Color del punto de cada prioridad en el selector. */
  protected readonly priorityDot = (priority: Priority) => PRIORITY_TONE[PRIORITY_LEVEL[priority]];
  protected readonly titleMax = TITLE_MAX;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    description: [''],
    priority: ['PRIORITY_MEDIUM' as Priority],
  });
  protected readonly preview = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.store.ensureLoaded(id));
    });
    afterNextRender(() => this.titleInput()?.nativeElement.focus());

    const nav = inject(ShellNav);
    effect(() => {
      const project = this.store.project();
      const { crumbs, project: shellProject } = boardNav(project, this.projectId(), {
        label: 'issueNew.title',
        translate: true,
      });
      nav.set(crumbs, shellProject);
    });
  }

  protected showTitleError(): boolean {
    const control = this.form.controls.title;
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      afterNextRender(() => this.titleInput()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    this.saving.set(true);
    this.submitError.set(null);
    const { title, description, priority } = this.form.getRawValue();
    this.store.create({ title: title.trim(), description, priority }).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/proyectos', this.projectId()]);
      },
      error: (err: DomainError) => {
        this.saving.set(false);
        this.submitError.set(err.message);
      },
    });
  }
}
