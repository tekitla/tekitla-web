import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type SketchActor, TOOL_NAME, actorById } from './bocetos.data';
import { SketchIcon, type SketchIconName } from './sketch-icon';

const TOOL_ICON: Record<string, SketchIconName> = {
  CLAUDE_CODE: 'terminal',
  CODEX: 'bot',
  CLOUD: 'cloud',
  OTHER: 'bot',
};

/**
 * Persona: círculo con iniciales. Agente: cuadrado con el icono de su
 * herramienta, así se distinguen de un vistazo (CU-033-5).
 */
@Component({
  selector: 'app-sketch-avatar',
  imports: [SketchIcon],
  template: `
    <span
      class="sketch-avatar"
      [class.sketch-avatar--agent]="actor().kind === 'AGENT'"
      [class.sketch-avatar--sm]="size() === 'sm'"
      [title]="title()"
    >
      @if (actor().kind === 'AGENT') {
        <app-sketch-icon [name]="icon()" />
      } @else {
        {{ actor().initials }}
      }
    </span>
  `,
  styles: `
    :host {
      display: contents;
    }
    .sketch-avatar {
      display: inline-grid;
      place-items: center;
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      background: color-mix(in oklab, var(--vrb-brand) 14%, var(--vrb-bg));
      color: color-mix(in oklab, var(--vrb-brand) 75%, var(--vrb-fg));
      font: 600 10px/1 var(--vrb-font-sans);
      --ui-icon-size: 13px;
    }
    .sketch-avatar--agent {
      border-radius: 6px;
      background: var(--vrb-ink);
      color: var(--vrb-ink-fg);
    }
    .sketch-avatar--sm {
      width: 20px;
      height: 20px;
      font-size: 9px;
      --ui-icon-size: 11px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SketchAvatar {
  readonly actor = input.required<SketchActor>();
  readonly size = input<'md' | 'sm'>('md');

  protected readonly icon = computed(() => TOOL_ICON[this.actor().tool ?? 'OTHER']);
  protected readonly title = computed(() => {
    const a = this.actor();
    if (a.kind === 'PERSON') return a.name;
    const owner = actorById(a.ownerId)?.name ?? '';
    return `${a.name} · ${TOOL_NAME[a.tool ?? 'OTHER']} · de ${owner}`;
  });
}
