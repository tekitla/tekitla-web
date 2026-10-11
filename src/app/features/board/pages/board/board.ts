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

import { BOARD_STATES, type BoardState, type Issue } from '@/app/api';
import { Viewport } from '@/app/core/layout/viewport';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { IssueCard, type MoveRequest } from '../../components/issue-card/issue-card';
import { STATE_TONE } from '../../data-access/board.logic';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';

/** Los avisos de éxito se van solos; los de error quedan hasta cerrarlos. */
const INFO_NOTICE_MS = 5000;

/**
 * Tablero de un proyecto (`vrb-kanban`): 3 columnas (Por hacer / En curso /
 * Hecho), ordenadas por `rank`; los descartados no se muestran.
 *
 * - Desktop (≥ 768px): las 3 columnas lado a lado, con drag & drop (CDK) entre
 *   columnas, además del menú «Mover» de cada tarjeta y Shift+← / Shift+→.
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

  protected readonly states = BOARD_STATES;
  protected readonly tone = STATE_TONE;
  protected readonly canceledCount = computed(
    () => this.store.issues().filter((i) => i.state === 'ISSUE_STATE_CANCELED').length,
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

  protected onDrop(event: CdkDragDrop<BoardState, BoardState, Issue>): void {
    if (event.previousContainer === event.container) return;
    this.store.move(event.item.data.number, event.container.data);
  }

  protected onMove(request: MoveRequest): void {
    this.store.move(request.number, request.to);
    this.restoreFocus(request);
  }

  /**
   * La tarjeta movida se vuelve a crear en otra columna y el foco se perdería.
   * En desktop sigue a la tarjeta; en móvil (la tarjeta se fue a otra pestaña)
   * queda en la pestaña actual. El live region anuncia a dónde fue.
   */
  private restoreFocus(request: MoveRequest): void {
    afterNextRender(
      () => {
        const target = this.isMobile()
          ? document.getElementById(`board-tab-${this.store.activeColumn()}`)
          : document.getElementById(`issue-link-${request.number}`);
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  protected selectTab(state: BoardState): void {
    this.store.setActiveColumn(state);
  }

  /** Patrón de pestañas ARIA: ←/→ (circular), Inicio y Fin activan y enfocan. */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = this.states.length - 1;
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
    const state = this.states[next]!;
    this.selectTab(state);
    document.getElementById(`board-tab-${state}`)?.focus();
  }
}
