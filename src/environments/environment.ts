import type { AppEnvironment } from './environment.model';

// Desarrollo local (`npm start`): apunta al gateway local (tequio-gateway en :8080).
export const environment: AppEnvironment = {
  production: false,
  env: 'dev',
  appName: 'tequio-web',
  apiBaseUrl: 'http://localhost:8080',
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
