# Tekitla

App frontend Angular (`tekitla-web`). Generada desde la plantilla
`dev-plantillas/templates/angular-app` (ver `.copier-answers.yml`).

## Arrancar

```bash
# Paquetes privados de GitHub Packages: hace falta un token con read:packages.
export NODE_AUTH_TOKEN=$(gh auth token)
npm install
npm start            # http://localhost:4200 contra el gateway local (http://localhost:8080)
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm start` | Dev server |
| `npm run build` / `build:prod` | Build de producción → `dist/tekitla-web/browser` |
| `npm run build:qa` | Build con `environment.qa.ts` |
| `npm run test:unit` | Unit tests (vitest) |
| `npm run test:e2e` | E2E (Playwright; 1ra vez `npx playwright install chromium`) |
| `npm run lint` | `prettier --check` + typecheck |
| `npm run format` | `prettier --write` |

## Ambientes

| Ambiente | Archivo | API |
|---|---|---|
| dev (`npm start`) | `src/environments/environment.ts` | http://localhost:8080 (tekitla-gateway local) |
| qa | `src/environments/environment.qa.ts` | https://api-qa.tekitla.victorrb1015.com |
| production | `src/environments/environment.prod.ts` | https://api.tekitla.victorrb1015.com |

## Firebase (login con Google)

El bloque `firebase` de cada `src/environments/environment*.ts` trae placeholders
(`REEMPLAZAR_*`). Se copian de *Consola de Firebase › Configuración del proyecto ›
General › Tus apps › app web* (`tekitla-app`). No son secretos. Mientras falten,
la pantalla de login lo avisa. Detalle en [docs/ci-cd-setup.md](docs/ci-cd-setup.md#4-firebase).

## Deploy

Firebase Hosting desde CI, sin claves: merge a `main` → producción, tag `qa-vX.Y.Z` → QA.
Setup en [docs/ci-cd-setup.md](docs/ci-cd-setup.md).

## Más

- Convenciones y estructura: [CLAUDE.md](CLAUDE.md)
- Estilos: [docs/estilos-bem.md](docs/estilos-bem.md)
- Actualizar desde la plantilla: `copier update` (requiere el repo limpio).
