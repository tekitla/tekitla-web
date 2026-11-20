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
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { AgentSession } from '@/app/api';
import { ShellNav } from '@/app/layout/shell/shell-nav';
import { Icon, type IconName } from '@/app/ui/components/icon/icon';
import { boardNav } from '@/app/features/board/board-nav';
import { BoardStore } from '@/app/features/board/data-access/board.store';
import { issueKey } from '@/app/features/board/data-access/board.logic';
import {
  groupSessions,
  reasonKey,
  sinceText,
  type AgentGroup,
} from '../../data-access/metrics.logic';
import { AgentsStore } from '../../data-access/metrics.store';

/** Cada cuánto se refresca mientras la pestaña está visible. */
export const AGENTS_REFRESH_MS = 30_000;

/** Ícono de cada grupo: el estado nunca va solo con color. */
const GROUP_ICON: Record<AgentGroup, IconName> = {
  person: 'user',
  stalled: 'alert',
  working: 'terminal',
  other: 'move',
  idle: 'bot',
};

/**
 * Vista «Agentes» de un proyecto (issues 026 y 036,
 * `proyectos/:projectId/agentes`): quién trabaja en qué, qué espera a una
 * persona, qué está colgado y qué está en reposo.
 *
 * - Primero lo que necesita a una persona y después lo colgado (el mismo
 *   orden que el resumen del issue); «en reposo» va plegado.
 * - Solo las sesiones propias (`ListAgentSessions` muestra las de la persona).
 * - Se refresca cada 30 s mientras la pestaña está visible; un refresco que
 *   falla deja la lista anterior y lo dice.
 */
@Component({
  selector: 'app-agents',
  imports: [RouterLink, TranslatePipe, Icon],
  templateUrl: './agents.html',
  styleUrl: './agents.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Agents {
  protected readonly board = inject(BoardStore);
  protected readonly store = inject(AgentsStore);

  /** Path `:projectId`. */
  readonly projectId = input.required<string>();

  protected readonly now = signal(new Date());
  protected readonly groups = computed(() => groupSessions(this.store.sessions()));
  protected readonly total = computed(() =>
    this.groups().reduce((n, g) => n + g.sessions.length, 0),
  );
  protected readonly showIdle = signal(false);
  protected readonly icon = GROUP_ICON;

  private readonly titles = computed(
    () => new Map(this.board.issues().map((i) => [i.number, i.title])),
  );

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => {
        this.board.ensureLoaded(id);
        this.refresh();
      });
    });

    const nav = inject(ShellNav);
    effect(() => {
      const { crumbs, project } = boardNav(this.board.project(), this.projectId(), {
        label: 'agents.title',
        translate: true,
      });
      nav.set(crumbs, project);
    });

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh();
    }, AGENTS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  protected refresh(): void {
    this.now.set(new Date());
    this.store.load(this.projectId());
  }

  protected key(s: AgentSession): string {
    return issueKey(this.board.projectKey(), s.issueNumber);
  }

  protected title(s: AgentSession): string {
    return this.titles().get(s.issueNumber) ?? '';
  }

  /** Sufijo de i18n del motivo de la espera (`metrics.reason.*`). */
  protected reasonOf(s: AgentSession): string {
    return reasonKey(s.waitingReason);
  }

  protected since(iso: string) {
    return sinceText(iso, this.now());
  }

  protected updated() {
    const at = this.store.updatedAt();
    return at ? sinceText(at.toISOString(), this.now()) : null;
  }
}
