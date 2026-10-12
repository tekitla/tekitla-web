import { Injector, afterNextRender, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';

import type { DomainError } from '@/app/api';
import { type SettingsError, type SettingsOperation, settingsError } from './settings-error';

/** Qué fila (por id) o el alta (`'create'`) está ocupada o mostrando un error. */
export type SettingsTarget = 'create' | string;

/**
 * Base de las pestañas de Ajustes (Estados, Etiquetas): una escritura a la vez,
 * el error junto a la fila (o el alta) que lo causó y el foco después de
 * cada acción.
 */
export abstract class SettingsSection {
  private readonly injector = inject(Injector);

  protected readonly busy = signal<SettingsTarget | null>(null);
  protected readonly error = signal<{ target: SettingsTarget; error: SettingsError } | null>(null);

  protected errorFor(target: SettingsTarget): SettingsError | null {
    const error = this.error();
    return error?.target === target ? error.error : null;
  }

  protected clearError(target: SettingsTarget): void {
    if (this.error()?.target === target) this.error.set(null);
  }

  /**
   * Corre una escritura del store. `done` sólo si el servidor la confirmó; si
   * se cambió de proyecto con el pedido en vuelo, completa sin emitir y sólo
   * se libera `busy`.
   */
  protected run<T>(
    target: SettingsTarget,
    operation: SettingsOperation,
    request: Observable<T>,
    done: () => void,
  ): void {
    if (this.busy()) return;
    this.busy.set(target);
    this.clearError(target);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        done();
      },
      error: (err: DomainError) => {
        this.busy.set(null);
        this.error.set({ target, error: settingsError(err, operation) });
      },
      complete: () => this.busy.set(null),
    });
  }

  /** Enfoca (y selecciona, si es un input) el elemento `id` después del próximo render. */
  protected focus(id: string, select = false): void {
    afterNextRender(
      () => {
        const el = document.getElementById(id);
        el?.focus();
        if (select && el instanceof HTMLInputElement) el.select();
      },
      { injector: this.injector },
    );
  }
}
