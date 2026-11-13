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
  signal,
  untracked,
} from '@angular/core';
import { Location } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink, Scroll } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue, Status } from '@/app/api';
import { Viewport } from '@/app/core/layout/viewport';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { IssueCard, type MoveRequest } from '../../components/issue-card/issue-card';
import { issueKey, statusTone, wipState } from '../../data-access/board.logic';
import {
  type PanelHistoryState,
  neighborInColumn,
  onlyPanelChanged,
  openedOverBoard,
  ownsKeyboard,
  parseIssueParam,
} from '../../data-access/issue-panel.logic';
import { IssueDetail } from '../issue-detail/issue-detail';
import { boardNav } from '../../board-nav';
import { BoardStore } from '../../data-access/board.store';

/** Los avisos de éxito se van solos; los de error quedan hasta cerrarlos. */
const INFO_NOTICE_MS = 5000;

/**
 * Tablero de un proyecto (`vrb-kanban`): una columna por estado visible del
 * proyecto (`ListStatuses`, en orden de rank; los ocultos no se muestran),
 * con su color. Cada columna, por rank. Con límite WIP, la cabecera muestra
 * «issues / límite» y avisa si se pasó (no bloquea: el backend mueve igual).
 *
 * - Desktop (≥ 768px): las columnas lado a lado, con drag & drop (CDK) para
 *   cambiar de columna y reordenar dentro de una, además del menú «Mover» de
 *   cada tarjeta, Shift+← / Shift+→ (columna vecina) y Shift+↑ / Shift+↓
 *   (subir o bajar en la columna).
 * - Móvil (< 768px): PESTAÑAS, una columna por vez, con el conteo de cada una
 *   a la vista. Se mueve con el menú «Mover» (el drag queda deshabilitado: en
 *   táctil compite con el scroll y no hay otra columna visible donde soltar).
 *
 * Detalle en panel lateral (033, parte 1): en desktop, abrir una tarjeta
 * muestra el issue a la derecha sin dejar el tablero. El issue va en la URL
 * (`?issue=RND-231`) para compartirlo y volver con «atrás». `Esc` cierra y
 * ↑ / ↓ pasan al anterior o siguiente de la columna. En móvil, o con un
 * enlace `?issue=` abierto en el celular, se usa la página completa.
 */
@Component({
  selector: 'app-board',
  imports: [
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    IssueCard,
    IssueDetail,
    Button,
    Icon,
    TranslatePipe,
  ],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onPanelKeydown($event)' },
})
export class Board {
  protected readonly store = inject(BoardStore);
  protected readonly isMobile = inject(Viewport).isMobile;
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Path `:projectId` (withComponentInputBinding + paramsInheritanceStrategy 'always'). */
  readonly projectId = input.required<string>();
  /** Query param `?issue=RND-231`: el issue abierto en el panel lateral. */
  readonly issue = input<string>();

  /** Número del issue del panel. En móvil no hay panel (página completa). */
  protected readonly panelNumber = computed(() =>
    this.isMobile() ? null : parseIssueParam(this.issue(), this.store.projectKey()),
  );
  protected readonly panelKey = computed(() => {
    const number = this.panelNumber();
    return number === null ? '' : issueKey(this.store.projectKey(), number);
  });
  protected readonly panelPrev = computed(() => this.neighbor(-1));
  protected readonly panelNext = computed(() => this.neighbor(1));
  /** La entrada actual del historial la abrió el tablero (cerrar = atrás). */
  private readonly overBoard = signal(false);
  /** `history.state` de los enlaces de las tarjetas al panel. */
  protected readonly panelState = computed<PanelHistoryState>(() => ({
    tkPanel: this.panelNumber() === null || this.overBoard(),
  }));

  protected readonly tone = statusTone;
  protected readonly wip = wipState;
  /** Ningún issue en el tablero (los de columnas ocultas no cuentan). */
  protected readonly empty = computed(() => this.store.columns().every((c) => !c.issues.length));
  /** Issues en columnas ocultas (descartados, por defecto): siguen en la lista. */
  protected readonly hiddenCount = computed(
    () => this.store.issues().filter((i) => this.store.statusOf(i)?.hidden).length,
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

    this.setUpPanel();
  }

  // ── Panel lateral (033) ──────────────────────────────────────────────────

  private setUpPanel(): void {
    // Al abrir: el foco va al panel. Al cerrar: vuelve a la tarjeta.
    let previous: number | null = null;
    effect(() => {
      const number = this.panelNumber();
      untracked(() => {
        this.overBoard.set(openedOverBoard(this.location.getState()));
        const closedNumber = previous;
        const opening = number !== null && previous === null;
        previous = number;
        afterNextRender(
          () => {
            if (opening) document.getElementById('board-panel')?.focus({ preventScroll: true });
            else if (number === null && closedNumber !== null) {
              document.getElementById(`issue-link-${closedNumber}`)?.focus({ preventScroll: true });
            }
          },
          { injector: this.injector },
        );
      });
    });

    // Un enlace `?issue=` abierto en el celular va a la página completa (CU-033-8).
    effect(() => {
      const number = parseIssueParam(this.issue(), this.store.projectKey());
      if (!this.isMobile() || number === null) return;
      untracked(
        () =>
          void this.router.navigate(['/proyectos', this.projectId(), 'issues', number], {
            replaceUrl: true,
          }),
      );
    });

    // Abrir, cambiar o cerrar el panel no mueve el tablero: el router vuelve
    // arriba en cada navegación (scrollPositionRestoration), así que se
    // restaura la posición de antes (CU-033-2). «Atrás» ya la restaura el router.
    let saved: readonly [number, number] | null = null;
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        const panelOnly =
          event.navigationTrigger !== 'popstate' &&
          onlyPanelChanged(this.router.parseUrl(this.router.url), this.router.parseUrl(event.url));
        saved = panelOnly ? [window.scrollX, window.scrollY] : null;
      } else if (event instanceof Scroll && saved) {
        const [x, y] = saved;
        saved = null;
        setTimeout(() => window.scrollTo(x, y));
      }
    });
  }

  private neighbor(direction: -1 | 1): number | null {
    const number = this.panelNumber();
    return number === null ? null : neighborInColumn(this.store.columns(), number, direction);
  }

  /** Cierra el panel: «atrás» si lo abrió el tablero; si no, saca `?issue=`. */
  protected closePanel(): void {
    if (this.overBoard()) {
      this.location.back();
      return;
    }
    void this.router.navigate([], {
      queryParams: { issue: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** ↑ / ↓: el anterior o siguiente de la columna, sin sumar entradas al historial. */
  protected stepPanel(direction: -1 | 1): void {
    const number = this.neighbor(direction);
    if (number === null) return;
    void this.router.navigate([], {
      queryParams: { issue: issueKey(this.store.projectKey(), number) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      state: { tkPanel: this.overBoard() },
    });
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (this.panelNumber() === null || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (ownsKeyboard(event.target)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePanel();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.stepPanel(event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  /**
   * Si una columna visible es de descarte, no recibe tarjetas: descartar va con
   * motivo (desde «Descartar…»). Devuelve el predicado de CDK para esa columna.
   */
  protected canEnter(status: Status): () => boolean {
    const open = status.category !== 'ISSUE_STATE_CANCELED';
    return () => open;
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
        // La columna vecina que no sea de descarte.
        const step = request.direction;
        let to = from + step;
        while (columns[to]?.status.category === 'ISSUE_STATE_CANCELED') to += step;
        const target = columns[to];
        if (!target || column.status.category === 'ISSUE_STATE_CANCELED') return;
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
