import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import {
  ACTORS,
  ISSUES,
  PROJECT,
  type Priority,
  STATUSES,
  type SketchIssue,
  type SketchStatus,
  issueKey,
} from './bocetos.data';
import { SketchAvatar } from './sketch-avatar';
import { type CardPick, type Density, SketchCard } from './sketch-card';
import {
  type BoardView,
  type PanelLayout,
  UNASSIGNED,
  parseStoredView,
  serializeStoredView,
  viewStorageKey,
} from './board-view';
import { SketchDetail } from './sketch-detail';
import { SketchIcon } from './sketch-icon';

type Variant = 'd' | 'a' | 'b' | 'c';
type GroupBy = 'ninguno' | 'asignado' | 'prioridad' | 'etiqueta';

interface Lane {
  readonly id: string;
  readonly name: string;
  readonly actorId?: string;
  readonly issues: readonly SketchIssue[];
}

interface VariantInfo {
  readonly id: Variant;
  readonly name: string;
  readonly summary: string;
  readonly density: Density;
  readonly groupBy: GroupBy;
  readonly open: number | null;
  readonly selected: readonly number[];
  readonly menu: number | null;
}

const VARIANTS: readonly VariantInfo[] = [
  {
    id: 'd',
    name: 'Propuesta · Vista',
    summary:
      'Lo que eligió Victor el 2026-11-13: un menú «Vista» en la barra elige el panel (acoplado o dividido), agrupar (ninguno o por asignado) y la densidad, y se recuerda por proyecto. El filtro por asignado queda en la barra. Densidad por defecto, lugar del alta rápida y atajos P/A/M: pendientes.',
    density: 'comoda',
    groupBy: 'ninguno',
    open: 22,
    selected: [],
    menu: null,
  },
  {
    id: 'a',
    name: 'A · Panel acoplado',
    summary:
      'El detalle ocupa una columna fija a la derecha y el tablero se angosta (sigue usable). Tarjetas cómodas. «+ Agregar» al pie de cada columna. Edición en línea con el menú «⋯» de la tarjeta.',
    density: 'comoda',
    groupBy: 'ninguno',
    open: 22,
    selected: [],
    menu: null,
  },
  {
    id: 'b',
    name: 'B · Carriles por asignado',
    summary:
      'Un carril plegable por persona y por agente, más «Sin asignar», con los encabezados de columna fijos arriba. Tarjetas compactas. El detalle es una hoja por encima del tablero. Muestra la selección múltiple con su barra.',
    density: 'compacta',
    groupBy: 'asignado',
    open: null,
    selected: [26, 27, 37],
    menu: null,
  },
  {
    id: 'c',
    name: 'C · Vista dividida',
    summary:
      'Tablero y detalle comparten la pantalla (60/40). Alta rápida arriba de cada columna. Edición en línea con el menú de la tarjeta abierto.',
    density: 'compacta',
    groupBy: 'ninguno',
    open: 26,
    selected: [],
    menu: 31,
  },
];

const PRIORITIES: readonly Priority[] = ['urgente', 'alta', 'media', 'baja'];

/**
 * Bocetos del tablero v2 (issue 033, paso 1). Solo en desarrollo
 * (`environment.production === false`): la ruta no existe en QA ni en prod.
 * Datos inventados y textos fijos en español a propósito: es un boceto para
 * elegir, no código de producto; se borra al empezar la parte 1.
 */
@Component({
  selector: 'app-bocetos',
  imports: [SketchCard, SketchDetail, SketchIcon, SketchAvatar],
  templateUrl: './bocetos.html',
  styleUrl: './bocetos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Bocetos {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly variants = VARIANTS;
  protected readonly statuses = STATUSES;
  protected readonly actors = ACTORS;
  protected readonly priorities = PRIORITIES;
  protected readonly project = PROJECT;
  protected readonly issueKey = issueKey;

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly variant = computed<VariantInfo>(
    () => VARIANTS.find((v) => v.id === this.params().get('v')) ?? VARIANTS[0],
  );
  /** `?issue=HUE-22`: el detalle abierto vive en la URL (CU-033-1). */
  protected readonly openNumber = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => {
        const m = /-(\d+)$/.exec(p.get('issue') ?? '');
        return m ? Number(m[1]) : null;
      }),
    ),
    { initialValue: null },
  );

  protected readonly issues = signal<SketchIssue[]>([...ISSUES]);
  protected readonly density = signal<Density>('comoda');
  protected readonly panelLayout = signal<PanelLayout>('acoplado');
  protected readonly assigneeFilter = signal<ReadonlySet<string>>(new Set());
  protected readonly viewMenuOpen = signal(false);
  protected readonly assigneeMenuOpen = signal(false);
  protected readonly unassigned = UNASSIGNED;

  /** La vista actual con el modelo que después guarda el 034. */
  protected readonly view = computed<BoardView>(() => ({
    panel: this.panelLayout(),
    groupBy: this.groupBy() === 'asignado' ? 'asignado' : 'ninguno',
    density: this.density(),
    filters: { assigneeIds: [...this.assigneeFilter()] },
  }));
  protected readonly groupBy = signal<GroupBy>('ninguno');
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly menuFor = signal<number | null>(null);
  protected readonly menuPos = signal({ x: 0, y: 0 });
  protected readonly addingIn = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly toast = signal<string | null>(null);

  private readonly addInputs = viewChildren<ElementRef<HTMLInputElement>>('addInput');

  protected readonly openIssue = computed(() =>
    this.issues().find((i) => i.number === this.openNumber()),
  );

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const who = this.assigneeFilter();
    const byWho = who.size
      ? this.issues().filter((i) => who.has(i.assigneeId ?? UNASSIGNED))
      : this.issues();
    if (!q) return byWho;
    return byWho.filter(
      (i) => i.title.toLowerCase().includes(q) || issueKey(i.number).toLowerCase().includes(q),
    );
  });

  protected readonly lanes = computed<readonly Lane[]>(() => {
    const issues = this.visible();
    switch (this.groupBy()) {
      case 'ninguno':
        return [{ id: 'all', name: '', issues }];
      case 'asignado': {
        const lanes: Lane[] = ACTORS.map((a) => ({
          id: a.id,
          name: a.name,
          actorId: a.id,
          issues: issues.filter((i) => i.assigneeId === a.id),
        }));
        lanes.push({
          id: 'none',
          name: 'Sin asignar',
          issues: issues.filter((i) => !i.assigneeId),
        });
        return lanes.filter((l) => l.issues.length);
      }
      case 'prioridad':
        return PRIORITIES.map((p) => ({
          id: p,
          name: p[0].toUpperCase() + p.slice(1),
          issues: issues.filter((i) => i.priority === p),
        })).filter((l) => l.issues.length);
      case 'etiqueta': {
        const names = [...new Set(issues.flatMap((i) => i.labels.map((l) => l.name)))].sort();
        return names.map((n) => ({
          id: n,
          name: n,
          issues: issues.filter((i) => i.labels.some((l) => l.name === n)),
        }));
      }
    }
  });

  constructor() {
    // Al cambiar de variante, cada una arranca con su estado de ejemplo.
    let last: Variant | null = null;
    effect(() => {
      const v = this.variant();
      if (v.id === last) return;
      last = v.id;
      this.density.set(v.density);
      this.panelLayout.set(v.id === 'c' ? 'dividido' : 'acoplado');
      this.assigneeFilter.set(new Set());
      this.viewMenuOpen.set(false);
      this.groupBy.set(v.groupBy);
      if (v.id === 'd') {
        // La propuesta lee la vista recordada para este proyecto.
        const stored = parseStoredView(localStorage.getItem(viewStorageKey(PROJECT.key)));
        this.panelLayout.set(stored.panel);
        this.groupBy.set(stored.groupBy);
        this.density.set(stored.density);
      }
      this.selected.set(new Set(v.selected));
      this.menuFor.set(null);
      if (v.menu !== null) {
        const n = v.menu;
        setTimeout(() => this.toggleMenu(n), 300);
      }
      this.collapsed.set(new Set());
      this.addingIn.set(v.id === 'a' ? 'todo' : null);
      if (this.openNumber() === null && v.open !== null) this.open(v.open, true);
      if (v.open === null && this.openNumber() !== null) this.close(true);
    });
  }

  protected inColumn(lane: Lane, status: SketchStatus): readonly SketchIssue[] {
    return lane.issues.filter((i) => i.statusId === status.id);
  }

  protected countIn(status: SketchStatus): number {
    return this.visible().filter((i) => i.statusId === status.id).length;
  }

  protected setVariant(id: Variant): void {
    void this.router.navigate([], { queryParams: { v: id, issue: null } });
  }

  protected pick(p: CardPick): void {
    this.menuFor.set(null);
    if (p.multi) {
      const next = new Set(this.selected());
      if (next.has(p.number)) next.delete(p.number);
      else next.add(p.number);
      this.selected.set(next);
      return;
    }
    this.selected.set(new Set());
    this.open(p.number);
  }

  protected open(number: number, replace = false): void {
    void this.router.navigate([], {
      queryParams: { issue: issueKey(number) },
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  protected close(replace = false): void {
    void this.router.navigate([], {
      queryParams: { issue: null },
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  /** Cambia una parte de la vista; en la propuesta se recuerda por proyecto. */
  protected setView(change: Partial<Pick<BoardView, 'panel' | 'groupBy' | 'density'>>): void {
    if (change.panel) this.panelLayout.set(change.panel);
    if (change.groupBy) this.groupBy.set(change.groupBy);
    if (change.density) this.density.set(change.density);
    if (this.variant().id === 'd') {
      localStorage.setItem(viewStorageKey(PROJECT.key), serializeStoredView(this.view()));
    }
  }

  protected toggleAssignee(id: string): void {
    const next = new Set(this.assigneeFilter());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.assigneeFilter.set(next);
  }

  protected clearAssignees(): void {
    this.assigneeFilter.set(new Set());
  }

  /** ↑ / ↓ en el detalle: issue anterior o siguiente de la misma columna. */
  protected step(dir: -1 | 1): void {
    const cur = this.openIssue();
    if (!cur) return;
    const column = this.visible().filter((i) => i.statusId === cur.statusId);
    const idx = column.findIndex((i) => i.number === cur.number);
    const next = column[idx + dir];
    if (next) this.open(next.number, true);
  }

  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const typing = target.matches('input, select, textarea');
    if (e.key === 'Escape') {
      if (this.viewMenuOpen() || this.assigneeMenuOpen()) {
        this.viewMenuOpen.set(false);
        this.assigneeMenuOpen.set(false);
      } else if (this.menuFor() !== null) this.menuFor.set(null);
      else if (this.addingIn() !== null && typing) this.addingIn.set(null);
      else if (this.selected().size) this.selected.set(new Set());
      else if (this.openIssue()) this.close();
      return;
    }
    if (typing || !this.openIssue()) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.step(e.key === 'ArrowUp' ? -1 : 1);
    }
  }

  protected toggleLane(id: string): void {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsed.set(next);
  }

  protected startAdd(statusId: string): void {
    this.addingIn.set(statusId);
    setTimeout(() => this.addInputs()[0]?.nativeElement.focus());
  }

  /** Alta rápida: Enter crea en ese estado y deja el campo listo (CU-033-3). */
  protected quickAdd(event: Event, status: SketchStatus, lane: Lane): void {
    const input = event.target as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    const number = Math.max(...this.issues().map((i) => i.number)) + 1;
    const issue: SketchIssue = {
      number,
      title,
      statusId: status.id,
      priority: 'media',
      labels: [],
      assigneeId: lane.actorId,
    };
    const all = this.issues();
    const top = this.variant().id === 'c';
    this.issues.set(top ? [issue, ...all] : [...all, issue]);
    input.value = '';
    this.flash(`${issueKey(number)} creado en ${status.name}`);
  }

  /** El menú va en `position: fixed` para que la columna no lo recorte. */
  protected toggleMenu(number: number, event?: Event): void {
    if (this.menuFor() === number) {
      this.menuFor.set(null);
      return;
    }
    const button = (event?.currentTarget ??
      document.querySelector(`[data-more="${number}"]`)) as HTMLElement | null;
    if (!button) return;
    const r = button.getBoundingClientRect();
    this.menuPos.set({ x: Math.max(8, r.right - 240), y: r.bottom + 4 });
    this.menuFor.set(number);
  }

  protected patch(numbers: Iterable<number>, change: Partial<SketchIssue>, what: string): void {
    const set = new Set(numbers);
    this.issues.update((list) => list.map((i) => (set.has(i.number) ? { ...i, ...change } : i)));
    this.menuFor.set(null);
    this.flash(`${set.size === 1 ? issueKey([...set][0]) : `${set.size} issues`}: ${what}`);
  }

  protected bulk(kind: 'priority' | 'status' | 'assignee', value: string): void {
    if (!value) return;
    const sel = this.selected();
    if (kind === 'priority') this.patch(sel, { priority: value as Priority }, `prioridad ${value}`);
    if (kind === 'status') {
      const s = STATUSES.find((x) => x.id === value);
      this.patch(sel, { statusId: value }, `movidos a ${s?.name}`);
    }
    if (kind === 'assignee') {
      const a = ACTORS.find((x) => x.id === value);
      this.patch(
        sel,
        { assigneeId: value === 'none' ? undefined : value },
        `asignados a ${a?.name ?? 'nadie'}`,
      );
    }
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected setQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
  }

  protected setGroup(e: Event): void {
    this.groupBy.set((e.target as HTMLSelectElement).value as GroupBy);
  }

  private flash(text: string): void {
    this.toast.set(text);
    setTimeout(() => this.toast() === text && this.toast.set(null), 2500);
  }
}
