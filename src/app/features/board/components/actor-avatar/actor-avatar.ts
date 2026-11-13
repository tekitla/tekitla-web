import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { AgentTool } from '@/app/api';
import { Icon, type IconName } from '@/app/ui/components/icon/icon';
import type { ActorView } from '../../data-access/actors.logic';

const TOOL_ICON: Record<AgentTool, IconName> = {
  AGENT_TOOL_UNSPECIFIED: 'bot',
  AGENT_TOOL_CLAUDE_CODE: 'terminal',
  AGENT_TOOL_CODEX: 'code',
  AGENT_TOOL_CLOUD: 'cloud',
  AGENT_TOOL_OTHER: 'bot',
};

/**
 * Avatar de un actor (`vrb-kanban-card__avatar`), decorativo: el texto lo
 * pone quien lo usa. Persona: círculo con iniciales. Agente: cuadrado oscuro
 * con el icono de su herramienta, así se distinguen de un vistazo (CU-033-5).
 */
@Component({
  selector: 'app-actor-avatar',
  imports: [Icon],
  template: `
    <span
      class="vrb-kanban-card__avatar actor-avatar"
      [class.actor-avatar--agent]="actor().kind === 'agent'"
      [class.actor-avatar--sm]="size() === 'sm'"
      [class.actor-avatar--revoked]="actor().revoked"
      aria-hidden="true"
    >
      @if (actor().kind === 'agent') {
        <ui-icon [name]="icon()" />
      } @else {
        {{ actor().initials }}
      }
    </span>
  `,
  styles: `
    :host {
      display: contents;
    }

    .actor-avatar {
      margin-left: 0;
      --ui-icon-size: 13px;
    }

    .actor-avatar--agent {
      border-radius: var(--vrb-radius-check);
      background: var(--vrb-ink);
      color: var(--vrb-ink-fg);
    }

    .actor-avatar--sm {
      width: 20px;
      height: 20px;
      font-size: 9px;
      --ui-icon-size: 11px;
    }

    .actor-avatar--revoked {
      opacity: 0.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorAvatar {
  readonly actor = input.required<ActorView>();
  readonly size = input<'md' | 'sm'>('md');

  protected readonly icon = computed(() => TOOL_ICON[this.actor().tool]);
}
