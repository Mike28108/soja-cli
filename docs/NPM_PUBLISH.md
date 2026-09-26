# Publicar SOJA en npm

El paquete es [`soja-cli`](https://www.npmjs.com/package/soja-cli). El código fuente es público en GitHub bajo una licencia propietaria ([LICENSE](../LICENSE)).

## Primera publicación (una sola vez, a mano)

npm solo permite configurar un *Trusted Publisher* en un paquete que ya existe, así que la primera versión se publica desde una máquina con la cuenta propietaria:

```bash
git checkout main && git pull
npm login                 # cuenta propietaria del paquete, con 2FA
npm publish --access public
```

`prepublishOnly` corre lint, tests y build antes de publicar.

Luego, en npmjs.com → `soja-cli` → **Settings → Trusted Publisher → GitHub Actions**:

- Organization or user: `Mike28108`
- Repository: `soja-cli`
- Workflow filename: `publish.yml`
- Environment: vacío
- Permisos: **npm stage publish** (solo dejar versiones en espera, no publicarlas)

Y en **Settings → Publishing access**, elige *Require two-factor authentication and disallow bypass 2fa tokens*.

Con eso, ni el workflow ni un token robado pueden publicar solos: el workflow deja la versión **en espera** (*staged publishing*) y solo sale a npm cuando la cuenta propietaria la aprueba con 2FA.

## Versiones siguientes (automático)

Sube la versión en `package.json` y `package-lock.json`, mueve el changelog y haz commit `release: vX.Y.Z` en `main` (por PR). Al subir el tag `vX.Y.Z`:

- `release.yml` crea el release de GitHub con el paquete adjunto;
- `publish.yml` valida (lint, tests, build, que el tag coincida con la versión), empaqueta sin *source maps* en un job sin permisos de publicación y deja ese mismo archivo en espera en npm desde otro job, con OIDC (sin tokens de larga duración) y *provenance* (npm registra desde qué commit y workflow se construyó). Si la versión ya está en npm, no hace nada.

Después apruébala tú (necesita npm ≥ 11.17 y tu 2FA):

```bash
npm stage list soja-cli          # muestra la versión en espera y su id
npm stage approve <stage-id>     # la publica
```

El resumen del run de `publish.yml` en GitHub recuerda estos comandos. Si algo no cuadra, `npm stage reject <stage-id>` la descarta.

## Qué implica que sea público

El JavaScript del paquete y el código fuente del repositorio los puede leer cualquiera. La licencia limita lo que se puede hacer con ellos (instalar y usar; no redistribuir, modificar ni publicar versiones propias sin permiso), pero no los oculta. Nunca pongas secretos en el cliente: todo lo sensible vive en el backend y en sus variables de entorno.
