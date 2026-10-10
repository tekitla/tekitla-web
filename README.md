# Tequio

App frontend Angular (`tequio-web`). Generada desde la plantilla
`dev-plantillas/templates/angular-app` (ver `.copier-answers.yml`).

## Arrancar

```bash
npm install
npm start            # http://localhost:4200 contra el backend de QA
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm start` | Dev server |
| `npm run build` / `build:prod` | Build de producción → `dist/tequio-web/browser` |
| `npm run build:qa` | Build con `environment.qa.ts` |
| `npm run test:unit` | Unit tests (vitest) |
| `npm run test:e2e` | E2E (Playwright; 1ra vez `npx playwright install chromium`) |
| `npm run lint` | `prettier --check` + typecheck |
| `npm run format` | `prettier --write` |

## Ambientes

| Ambiente | Archivo | API |
|---|---|---|
| dev (`npm start`) | `src/environments/environment.ts` | https://api-qa.tequio.victorrb1015.com |
| qa | `src/environments/environment.qa.ts` | https://api-qa.tequio.victorrb1015.com |
| production | `src/environments/environment.prod.ts` | https://api.tequio.victorrb1015.com |

## Deploy

Firebase Hosting desde CI, sin claves: merge a `main` → producción, tag `qa-vX.Y.Z` → QA.
Setup en [docs/ci-cd-setup.md](docs/ci-cd-setup.md).

## Más

- Convenciones y estructura: [CLAUDE.md](CLAUDE.md)
- Estilos: [docs/estilos-bem.md](docs/estilos-bem.md)
- Actualizar desde la plantilla: `copier update` (requiere el repo limpio).
