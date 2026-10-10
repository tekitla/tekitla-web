import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

/**
 * El `title` de cada ruta es una CLAVE de traducción (`titles.board`), así el
 * título de la pestaña también sale de `public/i18n/<lang>.json`.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot) ?? 'titles.app';
    this.translate.get(key).subscribe((text: string) => this.title.setTitle(text));
  }
}
