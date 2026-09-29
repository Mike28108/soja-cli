# SOJA — guía para agentes

Lee `docs/SOJA.md` antes de cambiar código: es la documentación viva del proyecto.
Lee [`ROADMAP.md`](ROADMAP.md) antes de planificar una nueva etapa: contiene los hitos propuestos y sus límites. El roadmap no describe funcionalidades implementadas; verifica el estado real en `docs/SOJA.md` y el código.

## Documentación versionada (obligatorio)

Todo cambio de comportamiento, comandos, atajos, configuración, esquema o arquitectura
se refleja **en el mismo commit** en:

1. `docs/SOJA.md`: la sección afectada y la fila del historial de revisiones (sube la revisión `rN`).
2. `CHANGELOG.md`: una entrada bajo `## [Unreleased]` (Added / Changed / Fixed / Removed).

Al publicar una versión, sigue §17 de `docs/SOJA.md`: sube la versión en `package.json`,
mueve Unreleased a la versión nueva con fecha, actualiza la cabecera de `docs/SOJA.md`,
y haz commit `release: vX.Y.Z` con el tag `vX.Y.Z`.

## Reglas del código

- Capas: `ui/` y `cli/` → `application/services` → `data/repositories.ts` → `data/local` → `database/`.
  Nada de SQL ni repositorios en componentes o comandos.
- La CLI y la TUI usan los mismos servicios; no dupliques lógica.
- Colores y glifos solo desde `src/ui/theme/theme.ts`; la identidad solo desde `src/ui/branding/brand.ts`.
- TypeScript estricto, sin `any`. Los errores para el usuario son `SojaError` con `message` y `hint`.
- Cambios de esquema: edita `src/database/schema.ts` y ejecuta `npm run db:generate -- --name <x>`.
- `soja-cli` y `soja-backend` son repositorios separados. El cliente nunca habla directo con Postgres.

## Alcance de la próxima etapa

- Publicado: v0.2 (Git) y v0.3–v0.4 (modo remoto, `soja-backend`, sincronización offline) en v0.4.0.
- Publicado: v0.5 (chat en tiempo real) en v0.5.0, con `soja-backend` 0.3.0 desplegado. El chat es un dominio propio (`ChatOperations`, solo en modo remoto), separado de `task_comments`; sus operaciones viajan por la misma cola de sincronización y el WebSocket solo notifica.
- El backend está desplegado en Railway con PostgreSQL en Supabase. Toda tabla nueva del backend activa RLS (su test lo exige).
- Publicado: v0.6 (PRs y CI de GitHub con la CLI `gh`, sin credenciales propias) en v0.6.0, con `soja-backend` 0.4.0.
- Publicado: v1.0 (archivar/borrar, `soja import-local`, deudas de uso, copias, instalación con `gh` y `soja update`, CI con E2E) en v1.0.0, con `soja-backend` 1.0.0.
- Publicado: v1.1, solo interfaz, en v1.1.0 (ver `ROADMAP.md`): marco tipo aplicación, paleta propia clara/oscura, mouse. Componentes en `ui/kit/` y `ui/chrome/`; nunca `useInput` directo en componentes (todo pasa por `KeyProvider`). Los tags `vX.Y.Z` publican el release con su paquete (`release.yml`).
- Publicado: v1.4 (npm con OIDC y provenance, `soja account delete`, HTTPS obligatorio) en v1.4.0, con `soja-backend` 1.2.0. El repositorio es público con licencia propietaria: solo colaboradores aprobados abren PRs y `main` exige PR; nunca pongas secretos en el cliente. Usa el email noreply de GitHub en los commits.
- Publicado: interruptor del mouse (adelanto de v1.5) en v1.5.0. `publish.yml` solo deja la versión en espera en npm (`npm stage publish`); el propietario la aprueba con `npm stage approve` y 2FA.
- Publicado: v1.9 (variables de entorno cifradas de extremo a extremo, `soja run`, `soja env`) en v1.9.0, con `soja-backend` 1.5.0. Contrato en `soja-backend/docs/ENV.md`; nunca uses material que el servidor envía sin verificarlo contra lo fijado localmente (`src/env/trust.ts`).
- Antes de cambiar el alcance de un hito, actualiza `ROADMAP.md` y mantén `docs/SOJA.md` como descripción del estado implementado.

## Verificación antes de terminar

`npm run lint && npm test && npm run build`
