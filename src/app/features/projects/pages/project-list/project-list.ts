import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  Injector,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { DomainError } from '@/app/api';
import { Button } from '@/app/ui/components/button/button';
import { normalizeProjectKey, projectKeyValidator } from '../../data-access/project-key';
import { ProjectsStore } from '../../data-access/projects.store';

/** Lista de proyectos + alta. Al crear uno, navega a su tablero. */
@Component({
  selector: 'app-project-list',
  imports: [ReactiveFormsModule, RouterLink, Button, TranslatePipe],
  templateUrl: './project-list.html',
  styleUrl: './project-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectList implements OnInit {
  protected readonly store = inject(ProjectsStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly keyInput = viewChild<ElementRef<HTMLInputElement>>('keyInput');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    key: ['', [Validators.required, projectKeyValidator]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(2000)],
  });
  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitError = signal<string | null>(null);
  /** Key rechazada por el backend (409), para el mensaje. */
  protected readonly takenKey = signal<string | null>(null);

  ngOnInit(): void {
    this.store.load();
  }

  protected openForm(): void {
    this.formOpen.set(true);
    afterNextRender(() => this.keyInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.form.reset();
    this.submitError.set(null);
  }

  /** La key se escribe siempre en mayúsculas y sin espacios. */
  protected normalizeKey(): void {
    const control = this.form.controls.key;
    const normalized = normalizeProjectKey(control.value);
    if (normalized !== control.value) control.setValue(normalized);
  }

  protected showErrors(name: 'key' | 'name' | 'description'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    this.saving.set(true);
    this.submitError.set(null);
    const { key, name, description } = this.form.getRawValue();
    this.store.create({ key, name: name.trim(), description: description.trim() }).subscribe({
      next: (project) => {
        this.saving.set(false);
        void this.router.navigate(['/proyectos', project.id]);
      },
      error: (err: DomainError) => {
        this.saving.set(false);
        if (err.isConflict()) {
          this.takenKey.set(key);
          this.form.controls.key.setErrors({ taken: true });
          this.form.controls.key.markAsTouched();
          this.keyInput()?.nativeElement.focus();
        } else {
          this.submitError.set(err.message);
        }
      },
    });
  }

  /** Tras marcar los errores (y que se rendericen), lleva el foco al primer campo inválido. */
  private focusFirstInvalid(): void {
    afterNextRender(
      () => {
        const form = this.keyInput()?.nativeElement.form;
        form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
      { injector: this.injector },
    );
  }
}
