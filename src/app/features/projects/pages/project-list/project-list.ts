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
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { normalizeProjectKey, projectKeyValidator } from '../../data-access/project-key';
import { ProjectsStore } from '../../data-access/projects.store';

/** Color del avatar de cada proyecto, en rotación (todavía no hay color por proyecto). */
const TONES = ['tk-avatar--accent', 'tk-avatar--info', 'tk-avatar--success', 'tk-avatar--brand'];

/**
 * Lista de proyectos (tarjetas) + alta en un `<dialog>` nativo (foco atrapado,
 * Escape cierra). Al crear uno, navega a su tablero.
 */
@Component({
  selector: 'app-project-list',
  imports: [ReactiveFormsModule, RouterLink, Button, Icon, TranslatePipe],
  templateUrl: './project-list.html',
  styleUrl: './project-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectList implements OnInit {
  protected readonly store = inject(ProjectsStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly keyInput = viewChild<ElementRef<HTMLInputElement>>('keyInput');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly skeletons = [0, 1, 2];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    key: ['', [Validators.required, projectKeyValidator]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(2000)],
  });
  protected readonly saving = signal(false);
  protected readonly submitError = signal<string | null>(null);
  /** Key rechazada por el backend (409), para el mensaje. */
  protected readonly takenKey = signal<string | null>(null);

  constructor() {
    inject(ShellNav).set([{ label: 'projects.list.title', translate: true }]);
  }

  ngOnInit(): void {
    this.store.load();
  }

  protected tone(index: number): string {
    return TONES[index % TONES.length]!;
  }

  protected openForm(): void {
    this.dialog().nativeElement.showModal();
    this.keyInput()?.nativeElement.focus();
  }

  /** Mientras se crea no se cierra: la respuesta todavía tiene que mostrarse o navegar. */
  protected closeForm(): void {
    if (this.saving()) return;
    this.dialog().nativeElement.close();
  }

  /** Escape dispara `cancel`: se ignora mientras se crea el proyecto. */
  protected onDialogCancel(event: Event): void {
    if (this.saving()) event.preventDefault();
  }

  /** Al cerrar (botón, Cancelar o Escape) el formulario vuelve a empezar. */
  protected onDialogClose(): void {
    this.form.reset();
    this.submitError.set(null);
    this.takenKey.set(null);
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
        this.closeForm();
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
        this.dialog().nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
      { injector: this.injector },
    );
  }
}
