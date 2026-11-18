import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { Issue, Label } from '@/app/api';
import { Icon } from '@/app/ui/components/icon/icon';
import type { ActorView } from '../../data-access/actors.logic';
import {
  LANES,
  UNCATEGORIZED,
  buildPlan,
  displayName,
  personName,
  prefixesOf,
  responsiblesOf,
} from '../../data-access/plan.logic';
import { PlanCard } from '../plan-card/plan-card';

/**
 * Cuerpo de la vista Plan (039): filtro por categoría, prefijo, totales, caja
 * «Esperan a <persona>» y un bloque por categoría con sus tres carriles. Lo
 * comparten la página privada (`proyectos/:id/plan`) y la del enlace de solo
 * lectura (009, `compartido/:token/plan`): cada una pone su cabecera, sus
 * datos y adónde lleva cada tarjeta.
 *
 * Sin estado de la URL: el filtro y el prefijo entran por inputs y salen por
 * `categoryChange` y `prefixChange`. Lo único propio es «ver todos» del
 * carril hecho y la hora para «últimas 4 semanas».
 *
 * Lo que se proyecta (`<ng-content>`) va al lado de los bloques: el panel
 * lateral de la página privada.
 */
@Component({
  selector: 'app-plan-view',
  imports: [PlanCard, Icon, TranslatePipe],
  templateUrl: './plan-view.html',
  styleUrl: '../../pages/plan/plan.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanView {
  readonly issues = input.required<readonly Issue[]>();
  readonly labels = input.required<readonly Label[]>();
  readonly labelsById = input.required<ReadonlyMap<string, Label>>();
  /** Prefijo de las categorías (`perfil/`). */
  readonly prefix = input.required<string>();
  /** Filtro elegido (en minúsculas); vacío = todas. */
  readonly category = input('');
  readonly projectId = input.required<string>();
  readonly projectKey = input.required<string>();
  /** Quién atiende un issue (`null`: sin asignar o desconocido). */
  readonly assigneeOf = input.required<(issue: Issue) => ActorView | null>();
  /** Qué espera un issue de la caja «Esperan a» (CU-039-10). */
  readonly noteOf = input.required<(issue: Issue) => string>();
  /**
   * Adónde lleva cada tarjeta. Sin esto, la página privada del issue; con
   * `null` para un issue, la tarjeta no es un enlace (enlace de alcance plan).
   */
  readonly cardLink = input<((issue: Issue) => readonly (string | number)[] | null) | null>(null);
  readonly cardsOpenPanel = input(false);
  /** Issue abierto en el panel lateral (`null`: ninguno). */
  readonly panelNumber = input<number | null>(null);

  readonly categoryChange = output<string>();
  readonly prefixChange = output<string>();
  readonly opened = output<number>();

  protected readonly lanes = LANES;
  protected readonly uncategorized = UNCATEGORIZED;
  protected readonly displayName = displayName;

  /** Bloques con «ver todos» abierto en el carril hecho. */
  private readonly allDone = signal<ReadonlySet<string>>(new Set());
  private readonly now = signal(new Date());

  protected readonly plan = computed(() =>
    buildPlan({
      issues: this.issues(),
      labelsById: this.labelsById(),
      prefix: this.prefix(),
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
  protected readonly prefixes = computed(() => prefixesOf(this.labels(), this.prefix()));
  /** Ningún issue tiene una categoría con el prefijo elegido. */
  protected readonly noCategories = computed(() => this.plan().categories.length === 0);

  constructor() {
    // «Últimas 4 semanas» con la hora de ahora, renovada cada hora.
    const timer = setInterval(() => this.now.set(new Date()), 60 * 60 * 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /**
   * Destino de una tarjeta: `undefined` sin `cardLink` (la página privada).
   * Un método y no `cardLink()?.(issue)` en la plantilla: ahí `?.` da `null`,
   * que para la tarjeta es «sin enlace».
   */
  protected linkOf(issue: Issue): readonly (string | number)[] | null | undefined {
    const cardLink = this.cardLink();
    return cardLink ? cardLink(issue) : undefined;
  }

  protected responsiblesOf(issue: Issue): string[] {
    return responsiblesOf(issue, this.labelsById()).map(personName);
  }

  protected blockName(key: string): string {
    return key === UNCATEGORIZED ? '' : displayName(key);
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
}
