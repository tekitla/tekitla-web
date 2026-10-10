import type { AppEnvironment } from './environment.model';

// Build de QA (`npm run build:qa`).
export const environment: AppEnvironment = {
  production: true,
  env: 'qa',
  appName: 'tequio-web',
  apiBaseUrl: 'https://api-qa.tequio.victorrb1015.com',
  // TODO: completar con la config web del proyecto Firebase de QA.
  firebase: {
    apiKey: 'REEMPLAZAR',
    authDomain: 'tequio-app-435b4.firebaseapp.com',
    projectId: 'tequio-app-435b4',
    appId: 'REEMPLAZAR',
  },
};
