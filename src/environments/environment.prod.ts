import type { AppEnvironment } from './environment.model';

// Build de producción (`npm run build` / `npm run build:prod`).
export const environment: AppEnvironment = {
  production: true,
  env: 'production',
  appName: 'tequio-web',
  apiBaseUrl: 'https://api.tequio.victorrb1015.com',
  // TODO: completar con la config web del proyecto Firebase de producción.
  firebase: {
    apiKey: 'REEMPLAZAR',
    authDomain: 'tequio-app-435b4.firebaseapp.com',
    projectId: 'tequio-app-435b4',
    appId: 'REEMPLAZAR',
  },
};
