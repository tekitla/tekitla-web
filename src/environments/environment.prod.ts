import type { AppEnvironment } from './environment.model';

// Build de producción (`npm run build` / `npm run build:prod`).
export const environment: AppEnvironment = {
  production: true,
  env: 'production',
  appName: 'tequio-web',
  apiBaseUrl: 'https://api.tequio.victorrb1015.com',
  // Config web de Firebase (NO es secreta: termina en el bundle). Copiar de
  // Consola de Firebase › Configuración del proyecto (⚙) › General › Tus apps ›
  // app web de tequio-app-435b4 › «Configuración del SDK» (objeto firebaseConfig).
  // Mientras queden los REEMPLAZAR, el login muestra un aviso y no intenta entrar.
  firebase: {
    apiKey: 'REEMPLAZAR_API_KEY',
    authDomain: 'tequio-app-435b4.firebaseapp.com',
    projectId: 'tequio-app-435b4',
    appId: 'REEMPLAZAR_APP_ID',
  },
};
