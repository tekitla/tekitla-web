import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuGroup, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
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
import { Location } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
} from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue, Status } from '@/app/api';
import { Viewport } from '@/app/core/layout/viewport';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { IssueCard, type MoveRequest } from '../../components/issue-card/issue-card';
import { issueKey, statusTone, wipState } from '../../data-access/board.logic';
import {
  closeAction,
  isLeaving,
  neighborInColumn,
  openedOverBoard,
  ownsKeyboard,
  panelHistoryState,
  parseIssueParam,
  withPanelMark,
} from '../../data-access/issue-panel.logic';
import { IssueDetail } from '../issue-detail/issue-detail';
import { boardNav } from '../../board-nav';
import { ActorsStore } from '../../data-access/actors.store';
import { BoardStore } from '../../data-access/board.store';
import { DENSITIES } from '../../data-access/board-view';
import { BoardViewStore } from '../../data-access/board-view.store';

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
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuGroup,
    CdkMenuItemRadio,
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
  protected readonly actors = inject(ActorsStore);
  protected readonly view = inject(BoardViewStore);
  protected readonly densities = DENSITIES;
  protected readonly isMobile = inject(Viewport).isMobile;
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Path `:projectId` (withComponentInputBinding + paramsInheritanceStrategy 'always'). */
  readonly projectId = input.required<string>();
  /** Query param `?issue=RND-231`: el issue abierto en el panel lateral. */
  readonly issue = input<string>();

  /** El issue pedido en `?issue=` (null hasta conocer la clave del proyecto). */
  private readonly requestedNumber = computed(() =>
    parseIssueParam(this.issue(), this.store.projectKey()),
  );
  /** Las tarjetas abren el panel: desktop y con la clave del proyecto (para la URL). */
  protected readonly cardsOpenPanel = computed(() => !this.isMobile() && !!this.store.projectKey());
  /** Número del issue del panel. En móvil no hay panel (página completa). */
  protected readonly panelNumber = computed(() =>
    this.isMobile() ? null : this.requestedNumber(),
  );
  protected readonly panelKey = computed(() => {
    const number = this.panelNumber();
    return number === null ? '' : issueKey(this.store.projectKey(), number);
  });
  protected readonly panelPrev = computed(() => this.neighbor(-1));
  protected readonly panelNext = computed(() => this.neighbor(1));

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
    // Pide los actores al abrir el tablero y otra vez si cambia la sesión
    // (`load` lee el uid: es la dependencia de este effect).
    effect(() => this.actors.load());
    // La vista recordada es por proyecto: el id llega con la ruta, antes que el proyecto.
    effect(() => this.view.use(this.projectId()));

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
  //
  // Historial: abrir desde el tablero suma una entrada marcada (ver
  // `panelHistoryState`); cambiar de issue la reemplaza; cerrar es «atrás»
  // si la entrada es del tablero o, si no (enlace directo, recarga), saca
  // `?issue=` reemplazando la URL.
  //
  // Scroll (CU-033-2): abrir, cambiar de issue y cerrar reemplazando van con
  // `scroll: 'manual'` y el router no mueve el tablero. Cerrar cuando la
  // entrada es del tablero es «atrás» (Esc, el botón o el del navegador): el
  // router vuelve a la posición de cuando se abrió el panel, como cualquier
  // «atrás». Decisión del 2026-11-13: no se pelea con el scroll del router.

  /** La entrada desde la que `closePanel` pidió «atrás» (ver `closeAction`). */
  private leaving: unknown = undefined;
  /** El próximo panel que se abra lo pidió el usuario: el foco va a él. */
  private focusNextPanel = false;
  /** Tarjeta pedida mientras llegaba el «atrás» de cerrar: se abre al llegar. */
  private pendingOpen: number | null = null;

  private setUpPanel(): void {
    // Al abrir: el foco va al panel. Al cerrar, si el foco se perdió (estaba
    // en el panel), vuelve a la tarjeta; si ya no está en el tablero (se
    // descartó o pasó a una columna oculta), a la primera.
    let previous: number | null = null;
    effect(() => {
      const number = this.panelNumber();
      untracked(() => {
        const closedNumber = previous;
        previous = number;
        // Se pide una vez: lo consume el próximo cambio del panel, abra o no.
        const focusPanel = this.focusNextPanel;
        this.focusNextPanel = false;
        afterNextRender(
          () => {
            if (number !== null) {
              // Solo si lo pidió el usuario (abrir o cambiar con una tarjeta):
              // un `?issue=` que se resuelve al cargar, o «atrás»/«adelante»,
              // no le saca el foco de donde esté.
              if (focusPanel) {
                document.getElementById('board-panel')?.focus({ preventScroll: true });
              }
              return;
            }
            const lost = !document.activeElement || document.activeElement === document.body;
            if (number === null && closedNumber !== null && lost) {
              const card =
                document.getElementById(`issue-link-${closedNumber}`) ??
                document.querySelector<HTMLElement>('.board__kanban [id^="issue-link-"]');
              card?.focus({ preventScroll: true });
            }
          },
          { injector: this.injector },
        );
      });
    });

    // Llegó el «atrás» de cerrar: la URL ya no tiene `?issue=` (no basta con que
    // el panel no se vea: al angostar la ventana también se oculta). Si se
    // pidió una tarjeta mientras tanto, se abre ahora.
    effect(() => {
      if (this.requestedNumber() !== null) return;
      untracked(() => {
        this.leaving = undefined;
        const pending = this.pendingOpen;
        this.pendingOpen = null;
        if (pending !== null) this.openPanel(pending);
      });
    });

    // Un «atrás» (el de cerrar) que se cancela o falla deja la entrada del
    // panel: se puede volver a cerrar y lo pendiente se descarta.
    let popstate = -1;
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart && event.navigationTrigger === 'popstate') {
        popstate = event.id;
      } else if (
        (event instanceof NavigationCancel || event instanceof NavigationError) &&
        event.id === popstate
      ) {
        this.leaving = undefined;
        this.pendingOpen = null;
      }
    });

    // Un enlace `?issue=` abierto en el celular va a la página completa (CU-033-8).
    // Reacciona al enlace, no al ancho: angostar la ventana con el panel
    // abierto lo oculta, no saca del tablero.
    effect(() => {
      const number = this.requestedNumber();
      if (number === null || !untracked(this.isMobile)) return;
      untracked(
        () =>
          void this.router.navigate(['/proyectos', this.projectId(), 'issues', number], {
            replaceUrl: true,
          }),
      );
    });
  }

  private neighbor(direction: -1 | 1): number | null {
    const number = this.panelNumber();
    return number === null ? null : neighborInColumn(this.store.columns(), number, direction);
  }

  /** La entrada actual del historial la abrió el tablero en este documento. */
  private overBoard(): boolean {
    return openedOverBoard(this.location.getState());
  }

  /** Abre (o cambia) el issue del panel sin mover el tablero. */
  private showInPanel(number: number, replaceUrl: boolean): Promise<boolean> {
    return this.router.navigate([], {
      queryParams: { issue: issueKey(this.store.projectKey(), number) },
      queryParamsHandling: 'merge',
      replaceUrl,
      // Entrada nueva: solo la marca (el state de la anterior es de ella). Al
      // reemplazar se conserva el state y su marca: cerrar hace lo mismo que antes.
      state: replaceUrl
        ? withPanelMark(this.location.getState(), this.overBoard())
        : panelHistoryState(),
      scroll: 'manual',
    });
  }

  /** Clic en una tarjeta (desktop). La abierta no hace nada. */
  protected openPanel(number: number): void {
    if (!this.cardsOpenPanel() || this.panelNumber() === number) return;
    // Hay un «atrás» de cerrar en camino: reemplazar ahora caería en la entrada
    // que se está dejando. Se abre cuando llegue.
    if (isLeaving(this.location.getState(), this.leaving)) {
      this.pendingOpen = number;
      return;
    }
    this.focusNextPanel = true;
    // Con `?issue=` en la URL (aunque todavía no se resuelva), se reemplaza.
    void this.showInPanel(number, !!this.issue()).then((navigated) => {
      // Navegación cancelada o sin cambios: el pedido de foco no queda para después.
      if (!navigated) this.focusNextPanel = false;
    });
  }

  /** Cierra el panel: «atrás» si lo abrió el tablero; si no, saca `?issue=`. */
  protected closePanel(): void {
    const action = closeAction(this.location.getState(), this.leaving);
    if (action.kind === 'ignore') return;
    if (action.kind === 'back') {
      this.leaving = action.leaving;
      this.location.back();
      return;
    }
    void this.router.navigate([], {
      queryParams: { issue: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
  }

  /** ↑ / ↓: el anterior o siguiente de la columna, sin sumar entradas al historial. */
  protected stepPanel(direction: -1 | 1): void {
    const number = this.neighbor(direction);
    if (number === null) return;
    const focused = document.activeElement;
    void this.showInPanel(number, true).then(() =>
      // Llegó al borde con el botón: queda deshabilitado y el foco se perdería
      // en <body>. Pasa al panel, salvo que el usuario ya lo haya movido.
      afterNextRender(
        () => {
          const active = document.activeElement;
          const stillThere = active === focused || !active || active === document.body;
          if (stillThere && focused instanceof HTMLButtonElement && focused.disabled) {
            document.getElementById('board-panel')?.focus({ preventScroll: true });
          }
        },
        { injector: this.injector },
      ),
    );
  }

  /**
   * El menú lateral del shell está abierto encima del contenido (pantallas
   * medianas, con su fondo oscuro a la vista): Esc y las flechas son del menú.
   */
  private sidebarOverlayOpen(): boolean {
    const scrim = document.querySelector<HTMLElement>(
      '.vrb-shell[data-sidebar-open] .vrb-shell__scrim',
    );
    return !!scrim && getComputedStyle(scrim).display !== 'none';
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (this.panelNumber() === null || event.defaultPrevented) return;
    if (event.key !== 'Escape' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (ownsKeyboard(event.target) || this.sidebarOverlayOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePanel();
    } else if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      // Con el foco en el panel (fuera de su contenido, que se desplaza con
      // las flechas). En el resto de la página las flechas siguen
      // desplazándola, y en una tarjeta no confunden con el issue abierto.
      event.target instanceof Element &&
      !event.target.closest('.board__panel-body') &&
      !!event.target.closest('#board-panel')
    ) {
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
