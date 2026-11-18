import { DOCUMENT, DatePipe } from '@angular/common';
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
import { TranslatePipe } from '@ngx-translate/core';

import {
  SHARE_DURATIONS,
  SHARE_NOTE_MAX,
  SHARE_OWNER_NAME_MAX,
  SHARE_SCOPES,
  type ShareLink,
  type ShareLinkDuration,
  type ShareLinkScope,
} from '@/app/api';
import { SessionStore } from '@/app/core/auth/session.store';
import { Button } from '@/app/ui/components/button/button';
import { Icon } from '@/app/ui/components/icon/icon';
import { ShareLinksStore } from '../../../data-access/share-links.store';
import { shareLinkState, shareUrl } from '../../../data-access/shared.logic';

/**
 * Ajustes › Compartir (issue 009): crear enlaces de solo lectura del proyecto
 * y revocarlos. Solo el dueño los gestiona (lo verifica el servicio).
 *
 * El token de un enlace nuevo se muestra una sola vez, con «Copiar»: el
 * servicio guarda solo su hash. La lista muestra para quién es cada uno, su
 * alcance, cuándo vence y cuándo se usó por última vez.
 */
@Component({
  selector: 'app-share-settings',
  imports: [Button, Icon, DatePipe, TranslatePipe],
  templateUrl: './share-settings.html',
  styleUrls: ['../settings-table.scss', './share-settings.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareSettings {
  protected readonly store = inject(ShareLinksStore);
  private readonly session = inject(SessionStore);
  private readonly document = inject(DOCUMENT);

  /** Path `:projectId` de la ruta del proyecto. */
  readonly projectId = input.required<string>();

  protected readonly scopes = SHARE_SCOPES;
  protected readonly durations = SHARE_DURATIONS;
  protected readonly noteMax = SHARE_NOTE_MAX;
  protected readonly ownerMax = SHARE_OWNER_NAME_MAX;

  protected readonly scope = signal<ShareLinkScope>('SHARE_LINK_SCOPE_PLAN');
  protected readonly duration = signal<ShareLinkDuration>('SHARE_LINK_DURATION_THIRTY_DAYS');
  protected readonly note = signal('');
  /** Precargado con el nombre de la sesión (decisión de Victor, 2026-11-18). */
  protected readonly ownerName = signal(firstName(this.session.user()?.displayName));
  protected readonly noteMissing = signal(false);

  protected readonly creating = signal(false);
  /** URL del enlace recién creado: se ve una sola vez. */
  protected readonly createdUrl = signal('');
  protected readonly copied = signal(false);

  protected readonly confirming = signal<string | null>(null);
  protected readonly revoking = signal<string | null>(null);

  private readonly now = signal(new Date());
  protected readonly rows = computed(() =>
    this.store.links().map((link) => ({ link, state: shareLinkState(link, this.now()) })),
  );

  constructor() {
    // untracked: load lee y escribe el proyecto del store; si no, el effect
    // se dispararía otra vez y pediría la lista dos veces.
    effect(() => {
      const id = this.projectId();
      untracked(() => this.store.load(id));
    });
    // «Vencido» con la hora de ahora, renovada cada minuto.
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected create(): void {
    const note = this.note().trim();
    this.noteMissing.set(!note);
    if (!note || this.creating()) return;
    this.creating.set(true);
    this.createdUrl.set('');
    this.copied.set(false);
    this.store
      .create({
        scope: this.scope(),
        duration: this.duration(),
        note,
        ownerDisplayName: this.ownerName().trim(),
      })
      .subscribe({
        next: (token) => {
          this.creating.set(false);
          this.now.set(new Date());
          this.createdUrl.set(shareUrl(this.document.location.origin, token));
          this.note.set('');
        },
        error: () => this.creating.set(false),
      });
  }

  protected copy(): void {
    const url = this.createdUrl();
    if (!url) return;
    void navigator.clipboard?.writeText(url).then(
      () => this.copied.set(true),
      () => this.copied.set(false),
    );
  }

  protected dismissCreated(): void {
    this.createdUrl.set('');
    this.copied.set(false);
  }

  protected revoke(link: ShareLink): void {
    if (this.revoking()) return;
    this.revoking.set(link.id);
    this.store.revoke(link.id).subscribe({
      next: () => {
        this.revoking.set(null);
        this.confirming.set(null);
      },
      error: () => this.revoking.set(null),
    });
  }
}

/** El primer nombre de la sesión, recortado al máximo permitido. */
function firstName(displayName: string | null | undefined): string {
  return (displayName ?? '').trim().split(/\s+/)[0].slice(0, SHARE_OWNER_NAME_MAX);
}
