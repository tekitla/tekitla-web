import { Injectable, signal } from '@angular/core';

/** Un paso de las migas de pan. `link` vacío = la página actual. */
export interface Crumb {
  /** Clave de i18n o texto ya resuelto (nombre de proyecto, `TK-42`). */
  label: string;
  translate?: boolean;
  link?: readonly unknown[];
}

/** Proyecto abierto: agrega su grupo («Tablero») al sidebar. */
export interface ShellProject {
  id: string;
  name: string;
}

/**
 * Lo que cada página le cuenta al shell: migas de pan y proyecto abierto. Las
 * páginas lo fijan al cargar; el shell sólo lo lee.
 */
@Injectable({ providedIn: 'root' })
export class ShellNav {
  private readonly _crumbs = signal<readonly Crumb[]>([]);
  private readonly _project = signal<ShellProject | null>(null);

  readonly crumbs = this._crumbs.asReadonly();
  readonly project = this._project.asReadonly();

  set(crumbs: readonly Crumb[], project: ShellProject | null = null): void {
    this._crumbs.set(crumbs);
    this._project.set(project);
  }
}
