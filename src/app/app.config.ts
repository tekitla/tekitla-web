import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig,
} from '@angular/router';
import { provideTranslateLoader, provideTranslateService } from '@ngx-translate/core';

import { authInterceptor } from './api/http/interceptors/auth.interceptor';
import { errorInterceptor } from './api/http/interceptors/error.interceptor';
import { routes } from './app.routes';
import { AssetsTranslateLoader, DEFAULT_LANG } from './core/i18n/assets-translate-loader';
import { TranslatedTitleStrategy } from './core/i18n/translated-title.strategy';

// Fechas y números en español (DatePipe, etc.).
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: TitleStrategy, useExisting: TranslatedTitleStrategy },
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Las páginas hijas (alta y detalle de issue) reciben `:projectId` del padre como input.
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),

    // Orden de interceptores: la request los recorre en este orden y la
    // respuesta al revés. El de errores va primero para normalizar al final,
    // después de que auth haya reaccionado al 401 (token nuevo) o 403 (sin acceso).
    provideHttpClient(withFetch(), withInterceptors([errorInterceptor, authInterceptor])),

    provideTranslateService({
      loader: provideTranslateLoader(AssetsTranslateLoader),
      fallbackLang: DEFAULT_LANG,
      lang: DEFAULT_LANG,
    }),
  ],
};
