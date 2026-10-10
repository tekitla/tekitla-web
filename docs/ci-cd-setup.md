# CI/CD — setup de una vez

Pipeline en GitHub Actions (`.github/workflows/`):

| Evento | Qué corre |
|---|---|
| PR | `npm ci` → `lint` → `test:unit` → `build:prod` |
| Push a `main` | lo anterior + deploy a **producción** (`tequio-app-435b4`) |
| Tag `qa-vX.Y.Z` | `build:qa` + deploy a **QA** (`tequio-app-435b4`) |

El deploy es **keyless**: el CI pide un token OIDC de corta duración, GCP lo valida
con Workload Identity Federation (WIF) y deja impersonar a un service account de
deploy **sólo desde este repo**. No hay claves JSON en ningún lado.

## 1. GCP: pool WIF + service account (por cada ambiente)

Correr **dos veces**: una con el proyecto de producción y otra con el de QA.
Requiere `gcloud` autenticado con permisos de IAM en el proyecto (`roles/owner`, o
`iam.workloadIdentityPoolAdmin` + `iam.serviceAccountAdmin` + `resourcemanager.projectIamAdmin`).
Los comandos son PowerShell; en bash cambiá `$VAR = "x"` por `VAR="x"`.

```powershell
$PROJECT  = "tequio-app-435b4"        # luego repetir con "tequio-app-435b4"
$REPO     = "<org>/tequio-web"                # owner/repo en GitHub
$ISSUER   = "https://token.actions.githubusercontent.com"
$POOL     = "github-pool"
$PROVIDER = "github-provider"
$ATTR     = "repository"
$SA_NAME  = "ci-deployer"

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com firebasehosting.googleapis.com --project=$PROJECT

gcloud iam workload-identity-pools create $POOL --project=$PROJECT --location=global --display-name="CI"

gcloud iam workload-identity-pools providers create-oidc $PROVIDER --project=$PROJECT --location=global `
  --workload-identity-pool=$POOL --issuer-uri=$ISSUER `
  --attribute-mapping="google.subject=assertion.sub,attribute.$ATTR=assertion.$ATTR,attribute.ref=assertion.ref" `
  --attribute-condition="assertion.$ATTR == '$REPO'"

gcloud iam service-accounts create $SA_NAME --project=$PROJECT --display-name="CI deployer (tequio-web)"
$SA     = "$SA_NAME@$PROJECT.iam.gserviceaccount.com"
$NUMBER = gcloud projects describe $PROJECT --format="value(projectNumber)"

gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/firebasehosting.admin" --condition=None
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/serviceusage.serviceUsageConsumer" --condition=None
gcloud iam service-accounts add-iam-policy-binding $SA --project=$PROJECT --role="roles/iam.workloadIdentityUser" `
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.$ATTR/$REPO"

# Valores para el paso 2:
"GCP_WIF_PROVIDER = projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
"GCP_SA_EMAIL     = $SA"
```

Endurecimiento opcional: en producción, sumar a `--attribute-condition`
`&& assertion.ref == 'refs/heads/main'`, y en QA `&& assertion.ref.startsWith('refs/tags/qa-v')`.

## 2. Variables del CI

Dos variables **por ambiente** (no son secretos, pero tampoco van en el repo):

| Variable | Valor |
|---|---|
| `GCP_WIF_PROVIDER` | `projects/<NÚMERO>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>` |
| `GCP_SA_EMAIL` | `ci-deployer@<proyecto>.iam.gserviceaccount.com` |

En GitHub: *Settings › Environments* → crear `production` y `qa`, y en cada uno
*Environment variables* → `GCP_WIF_PROVIDER` y `GCP_SA_EMAIL`. En `production`,
opcionalmente, *Deployment branches and tags* = sólo `main`.

## 3. Ajustes del repo en GitHub

- *Rulesets* de `main`: requerir PR, requerir el check `CI / verify`, bloquear force push.
- *Rulesets* de tags: `qa-v*` restringido a maintainers.

## 4. Firebase

- Cada proyecto GCP tiene que tener Firebase habilitado y el sitio de Hosting por
  defecto (`<proyecto>.web.app`). Los alias `production`/`qa` están en `.firebaserc`.
- Dominio propio: *Firebase Console › Hosting › Agregar dominio personalizado*.
- Auth: habilitar el proveedor *Email/Password* (u otros) y agregar el dominio de la app
  en *Authentication › Settings › Authorized domains*. Completar el bloque `firebase`
  de `src/environments/environment*.ts` con la config web de cada proyecto (no es secreta).

## 5. Probar

```bash
git tag qa-v0.1.0 && git push origin qa-v0.1.0   # despliega QA
```

Para producción, mergear a `main`. Si el job de deploy falla con
`Permission 'iam.serviceAccounts.getAccessToken' denied`, revisar que `$REPO` del
paso 1 coincida exactamente con la ruta del repo.

## Deploy manual (sólo emergencias)

`npm run deploy:qa` / `npm run deploy:prod` usan tus credenciales locales
(`npx firebase-tools@15 login`). El canal normal es el CI.
