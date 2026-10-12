import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue } from '@/app/api';
import { Viewport } from '@/app/core/layout/viewport';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { IssueCard, type MoveRequest } from '../../components/issue-card/issue-card';
import { CATEGORY_TONE } from '../../data-access/board.logic';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';

/** Los avisos de éxito se van solos; los de error quedan hasta cerrarlos. */
const INFO_NOTICE_MS = 5000;

/**
 * Tablero de un proyecto (`vrb-kanban`): una columna por estado del proyecto
 * (`ListStatuses`, en orden de rank), con el tono de su categoría; los estados
 * de categoría CANCELED (descartados) no se muestran. Cada columna, por rank.
 *
 * - Desktop (≥ 768px): las columnas lado a lado, con drag & drop (CDK) para
 *   cambiar de columna y reordenar dentro de una, además del menú «Mover» de
 *   cada tarjeta, Shift+← / Shift+→ (columna vecina) y Shift+↑ / Shift+↓
 *   (subir o bajar en la columna).
 * - Móvil (< 768px): PESTAÑAS, una columna por vez, con el conteo de cada una
 *   a la vista. Se mueve con el menú «Mover» (el drag queda deshabilitado: en
 *   táctil compite con el scroll y no hay otra columna visible donde soltar).
 */
@Component({
  selector: 'app-board',
  imports: [
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    IssueCard,
    Button,
    Icon,
    TranslatePipe,
  ],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  protected readonly store = inject(BoardStore);
  protected readonly isMobile = inject(Viewport).isMobile;
  private readonly injector = inject(Injector);

  /** Path `:projectId` (withComponentInputBinding + paramsInheritanceStrategy 'always'). */
  readonly projectId = input.required<string>();

  protected readonly tone = CATEGORY_TONE;
  /** Ningún issue en el tablero (los descartados no cuentan). */
  protected readonly empty = computed(() => this.store.columns().every((c) => !c.issues.length));
  protected readonly canceledCount = computed(
    () =>
      this.store.issues().filter((i) => this.store.statusOf(i)?.category === 'ISSUE_STATE_CANCELED')
        .length,
  );

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.store.load(id));
    });

    const nav = inject(ShellNav);
    effect(() => {
      const project = this.store.project();
      const { crumbs, project: shellProject } = boardNav(project, this.projectId());
      nav.set(crumbs, shellProject);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const notice = this.store.notice();
      clearTimeout(timer);
      if (notice?.kind === 'info') {
        timer = setTimeout(() => this.store.dismissNotice(notice.id), INFO_NOTICE_MS);
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  /** Soltar: la posición es `currentIndex` en la columna destino (CDK). */
  protected onDrop(event: CdkDragDrop<string, string, Issue>): void {
    const sameList = event.previousContainer === event.container;
    if (sameList && event.previousIndex === event.currentIndex) return;
    this.store.move(event.item.data.number, event.container.data, event.currentIndex);
  }

  protected onMove(request: MoveRequest): void {
    if (request.via === 'menu') {
      this.store.move(request.number, request.statusId);
    } else {
      const columns = this.store.columns();
      const from = columns.findIndex((c) => c.issues.some((i) => i.number === request.number));
      const column = columns[from];
      if (!column) return;
      if (request.axis === 'column') {
        const target = columns[from + request.direction];
        if (!target) return;
        this.store.move(request.number, target.status.id);
      } else {
        const index = column.issues.findIndex((i) => i.number === request.number);
        const to = index + request.direction;
        if (to < 0 || to >= column.issues.length) return;
        this.store.move(request.number, column.status.id, to);
      }
    }
    this.restoreFocus(request);
  }

  /**
   * La tarjeta movida se vuelve a crear en otra columna (o en otro lugar) y el
   * foco se perdería. Sigue a la tarjeta si se ve; en móvil, si se fue a otra
   * pestaña, queda en la pestaña actual. El live region anuncia a dónde fue.
   */
  private restoreFocus(request: MoveRequest): void {
    afterNextRender(
      () => {
        const active = this.store.columns().find((c) => c.status.id === this.store.activeColumn());
        const hidden = this.isMobile() && !active?.issues.some((i) => i.number === request.number);
        const target = hidden
          ? document.getElementById(`board-tab-${this.store.activeColumn()}`)
          : document.getElementById(`issue-link-${request.number}`);
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  protected selectTab(statusId: string): void {
    this.store.setActiveColumn(statusId);
  }

  /** Patrón de pestañas ARIA: ←/→ (circular), Inicio y Fin activan y enfocan. */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const columns = this.store.columns();
    const last = columns.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const statusId = columns[next]!.status.id;
    this.selectTab(statusId);
    document.getElementById(`board-tab-${statusId}`)?.focus();
  }
}
