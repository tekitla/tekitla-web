import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, tap, throwError } from 'rxjs';

import { type CreateProjectRequest, IssuesClient, type Project, toDomainError } from '@/app/api';

/**
 * Store de la feature `projects`: lista de proyectos del usuario y alta.
 * Provisto en la ruta (projects.routes.ts).
 */
@Injectable()
export class ProjectsStore {
  private readonly client = inject(IssuesClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _projects = signal<Project[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly projects = this._projects.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isEmpty = computed(
    () => !this._loading() && this._error() === null && this._projects().length === 0,
  );

  private requestId = 0;

  load(): void {
    const requestId = ++this.requestId;
    this._loading.set(true);
    this._error.set(null);
    this.client
      .listAllProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          if (requestId !== this.requestId) return;
          this._projects.set(projects);
          this._loading.set(false);
        },
        error: (err: unknown) => {
          if (requestId !== this.requestId) return;
          this._error.set(toDomainError(err).message);
          this._loading.set(false);
        },
      });
  }

  /**
   * Crea el proyecto y lo suma a la lista (ordenada por nombre, como el
   * backend). El error llega como DomainError: la página distingue el 409 (key
   * repetida) para marcar el campo.
   */
  create(req: CreateProjectRequest): Observable<Project> {
    return this.client.createProject(req).pipe(
      tap((project) =>
        this._projects.update((list) =>
          [...list.filter((p) => p.id !== project.id), project].sort(byName),
        ),
      ),
      catchError((err: unknown) => throwError(() => toDomainError(err))),
    );
  }
}

function byName(a: Project, b: Project): number {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}
