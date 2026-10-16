import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { DiscardInfo } from '@/app/api';
import { SessionStore } from '@/app/core/auth/session.store';

/**
 * «Descartado por *autor*: “*motivo*”», o «Descartado sin motivo» si se
 * descartó moviéndolo (`MoveIssue`, clientes de v0.3). El autor es el uid
 * hasta la rebanada 3b; la sesión propia se muestra como «Tú».
 */
@Component({
  selector: 'app-discard-note',
  imports: [TranslatePipe],
  template: `
    @if (discard(); as info) {
      {{ 'discard.by' | translate: { actor: isMe() ? ('activity.me' | translate) : info.actorId } }}
      <q class="discard-note__reason">{{ info.reason }}</q>
    } @else {
      {{ 'discard.withoutReason' | translate }}
    }
  `,
  styles: `
    :host {
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscardNote {
  private readonly session = inject(SessionStore);

  readonly discard = input<DiscardInfo | null>(null);

  protected readonly isMe = computed(() => {
    const actorId = this.discard()?.actorId ?? '';
    return actorId !== '' && actorId === this.session.user()?.uid;
  });
}
