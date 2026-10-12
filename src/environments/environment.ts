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
  // App web «tekitla-web», registrada el 2026-10-12 (firebase apps:sdkconfig WEB).
  firebase: {
    apiKey: 'AIzaSyBkK6lhxg2dU0aX8Jqr-2VEfKGlx7319E8',
    authDomain: 'tekitla-app.firebaseapp.com',
    projectId: 'tekitla-app',
    appId: '1:956518569612:web:a8c772d7abd450dbcc0da9',
  },
};
