import type { AppEnvironment } from './environment.model';

// Desarrollo local (`npm start`): apunta al gateway local (tekitla-gateway en :8080).
export const environment: AppEnvironment = {
  production: false,
  env: 'dev',
  appName: 'tekitla-web',
  apiBaseUrl: 'http://localhost:8080',
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
