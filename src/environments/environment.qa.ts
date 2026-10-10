import type { AppEnvironment } from './environment.model';

// Build de QA (`npm run build:qa`).
export const environment: AppEnvironment = {
  production: true,
  env: 'qa',
  appName: 'tekitla-web',
  apiBaseUrl: 'https://api-qa.tekitla.victorrb1015.com',
  // Config web de Firebase (NO es secreta: termina en el bundle). Copiar de
  // Consola de Firebase › Configuración del proyecto (⚙) › General › Tus apps ›
  // app web de tekitla-app › «Configuración del SDK» (objeto firebaseConfig).
  // Mientras queden los REEMPLAZAR, el login muestra un aviso y no intenta entrar.
  firebase: {
    apiKey: 'REEMPLAZAR_API_KEY',
    authDomain: 'tekitla-app.firebaseapp.com',
    projectId: 'tekitla-app',
    appId: 'REEMPLAZAR_APP_ID',
  },
};
