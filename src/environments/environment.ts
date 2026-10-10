import type { AppEnvironment } from './environment.model';

// Desarrollo local (`npm start`): apunta al backend de QA.
export const environment: AppEnvironment = {
  production: false,
  env: 'dev',
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
