import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateLoader, provideTranslateService } from '@ngx-translate/core';

import { authInterceptor } from './api/http/interceptors/auth.interceptor';
import { errorInterceptor } from './api/http/interceptors/error.interceptor';
import { routes } from './app.routes';
import { AssetsTranslateLoader, DEFAULT_LANG } from './core/i18n/assets-translate-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),

    // Orden de interceptores: la request los recorre en este orden y la
    // respuesta al revés. El de errores va primero para normalizar al final,
    // después de que auth haya tenido la chance de refrescar ante un 401.
    provideHttpClient(withFetch(), withInterceptors([errorInterceptor, authInterceptor])),

    provideTranslateService({
      loader: provideTranslateLoader(AssetsTranslateLoader),
      fallbackLang: DEFAULT_LANG,
      lang: DEFAULT_LANG,
    }),
  ],
};
