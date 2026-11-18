import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue } from '@/app/api';
import { Viewport } from '@/app/core/layout/viewport';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Icon } from '@/app/ui/components/icon/icon';
import { boardNav } from '../../board-nav';
import { PlanCard } from '../../components/plan-card/plan-card';
import { ActorsStore } from '../../data-access/actors.store';
import { BoardStore } from '../../data-access/board.store';
import { issueKey } from '../../data-access/board.logic';
import { parseIssueParam } from '../../data-access/issue-panel.logic';
import { PlanPrefixStore } from '../../data-access/plan-prefix.store';
import {
  LANES,
  UNCATEGORIZED,
  buildPlan,
  displayName,
  personName,
  prefixesOf,
  responsiblesOf,
} from '../../data-access/plan.logic';
import { IssueDetail } from '../issue-detail/issue-detail';

/**
 * Vista Plan de un proyecto (039, `proyectos/:projectId/plan`): qué está
 * hecho, qué está en curso y qué falta, por categoría, y quién atiende cada
 * issue.
 *
 * - La categoría es una etiqueta con prefijo (`perfil/` por defecto); el
 *   prefijo se elige acá y se recuerda por proyecto (CU-039-7).
 * - El filtro va en la URL (`?categoria=escuela`, CU-039-2) para recargar y
 *   compartir.
 * - Arriba, los totales (cada issue una vez, CU-039-3) y la caja «Esperan a
 *   <persona>» (`espera/<persona>`, CU-039-8).
 * - El carril «hecho» muestra las últimas 4 semanas, con «ver todos».
 * - Desktop: la tarjeta abre el detalle en un panel lateral (`?issue=RND-231`,
 *   como el tablero del 033); `Esc` lo cierra. Móvil: la página del detalle.
 *
 * Usa lo que ya cargó el tablero (`BoardStore`: issues, etiquetas, estados) y
 * los actores: sin pedidos ni contrato nuevos.
 */
@Component({
  selector: 'app-plan',
  imports: [RouterLink, PlanCard, IssueDetail, Icon, TranslatePipe],
  templateUrl: './plan.html',
  styleUrl: './plan.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
})
export class Plan {
  protected readonly store = inject(BoardStore);
  protected readonly actors = inject(ActorsStore);
  protected readonly prefixStore = inject(PlanPrefixStore);
  protected readonly isMobile = inject(Viewport).isMobile;
  private readonly router = inject(Router);

  /** Path `:projectId`. */
  readonly projectId = input.required<string>();
  /** `?categoria=escuela`: solo ese bloque. */
  readonly categoria = input<string>();
  /** `?issue=RND-231`: el issue del panel lateral. */
  readonly issue = input<string>();

  protected readonly lanes = LANES;
  protected readonly uncategorized = UNCATEGORIZED;
  protected readonly displayName = displayName;

  /** Bloques con «ver todos» abierto en el carril hecho. */
  private readonly allDone = signal<ReadonlySet<string>>(new Set());
  private readonly now = signal(new Date());

  protected readonly category = computed(() => (this.categoria() ?? '').trim().toLowerCase());
  protected readonly plan = computed(() =>
    buildPlan({
      issues: this.store.issues(),
      labelsById: this.store.labelsById(),
      prefix: this.prefixStore.prefix(),
      category: this.category(),
      allDone: this.allDone(),
      now: this.now(),
    }),
  );
  /** El filtro elegido existe (si no, se muestra todo y «Todas» queda marcada). */
  protected readonly activeCategory = computed(() => {
    const c = this.category();
    const plan = this.plan();
    if (c === UNCATEGORIZED) return plan.hasUncategorized ? c : '';
    return plan.categories.includes(c) ? c : '';
  });
  protected readonly prefixes = computed(() =>
    prefixesOf(this.store.labels(), this.prefixStore.prefix()),
  );
  /** Ningún issue tiene una categoría con el prefijo elegido. */
  protected readonly noCategories = computed(() => this.plan().categories.length === 0);

  protected readonly cardsOpenPanel = computed(() => !this.isMobile() && !!this.store.projectKey());
  protected readonly panelNumber = computed(() =>
    this.isMobile() ? null : parseIssueParam(this.issue(), this.store.projectKey()),
  );
  protected readonly panelKey = computed(() => {
    const number = this.panelNumber();
    return number === null ? '' : issueKey(this.store.projectKey(), number);
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.store.ensureLoaded(id));
    });
    effect(() => this.actors.load());
    effect(() => this.prefixStore.use(this.projectId()));

    const nav = inject(ShellNav);
    effect(() => {
      const { crumbs, project } = boardNav(this.store.project(), this.projectId(), {
        label: 'plan.title',
        translate: true,
      });
      nav.set(crumbs, project);
    });

    // «Últimas 4 semanas» con la hora de ahora, renovada cada hora.
    const timer = setInterval(() => this.now.set(new Date()), 60 * 60 * 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected assigneeOf(issue: Issue) {
    return this.actors.view(issue.assigneeActorId);
  }

  protected responsiblesOf(issue: Issue): string[] {
    return responsiblesOf(issue, this.store.labelsById()).map(personName);
  }

  protected blockName(key: string): string {
    return key === UNCATEGORIZED ? '' : displayName(key);
  }

  protected setCategory(value: string): void {
    void this.router.navigate([], {
      queryParams: { categoria: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setPrefix(value: string): void {
    this.prefixStore.set(value);
    // El filtro era de otro prefijo.
    if (this.categoria()) this.setCategory('');
  }

  protected toggleAllDone(key: string): void {
    const next = new Set(this.allDone());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.allDone.set(next);
  }

  protected showsAllDone(key: string): boolean {
    return this.allDone().has(key);
  }

  protected open(number: number): void {
    void this.router.navigate([], {
      queryParams: { issue: issueKey(this.store.projectKey(), number) },
      queryParamsHandling: 'merge',
    });
  }

  protected closePanel(): void {
    const number = this.panelNumber();
    void this.router
      .navigate([], {
        queryParams: { issue: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .then(() => {
        if (number !== null)
          document.querySelector<HTMLElement>(`.plan [data-issue="${number}"]`)?.focus();
      });
  }

  protected onEscape(event: Event): void {
    if (this.panelNumber() === null || event.defaultPrevented) return;
    // Un menú o diálogo abierto dentro del panel se cierra primero.
    if (document.querySelector('.cdk-overlay-container .cdk-overlay-pane:not(:empty)')) return;
    event.preventDefault();
    this.closePanel();
  }
}
