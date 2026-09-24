# Changelog

Todos los cambios relevantes de SOJA se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).
La documentación completa del estado actual está en [`docs/SOJA.md`](docs/SOJA.md).

## [Unreleased]

### Changed

- Se agregó `ROADMAP.md` y se alinearon `CLAUDE.md` y la documentación con el plan de Git local en v0.2, backend remoto en v0.3, sincronización en v0.4, chat en v0.5 y GitHub/PR/CI en v0.6.

## [0.1.0] - 2026-09-24

Primera milestone: SOJA usable de punta a punta, local-first.

### Added

- **Identidad:** wordmark original de 3 líneas con gradiente verde soja y cursor como firma, splash de arranque, header compacto y theme central de colores y glifos.
- **Primer uso:** setup en tres pasos (nombre, username, workspace) que crea el usuario, el workspace y la membresía `owner`.
- **My Work:** tasks priorizadas por estado y prioridad, filtros (Mine, All, Todo, In Progress, Review, Blocked, Done), resumen de estados y empty states con personalidad.
- **Tasks:** IDs humanos `SOJA-n` por workspace; creación rápida en la que solo el título es obligatorio; edición de título, descripción, proyecto, tipo, prioridad, estado, assignee y requester.
- **Workflow de estados:** registro de `started_at` y `completed_at`, y reapertura de tasks cerradas.
- **Comentarios y actividad:** un evento por cambio real, en un timeline que mezcla eventos y comentarios.
- **Proyectos:** lista con contadores y vista por proyecto; keys derivadas automáticamente; `repository_path` y `repository_url`.
- **Workspaces:** múltiples workspaces, cambio de workspace persistido en la configuración y alta de developers.
- **Navegación:** búsqueda en vivo por título o ID, command palette (`:` / `Ctrl+K`), atajos estilo Vim, `esc` predecible y ayuda (`?`).
- **Terminal:** layout responsive según el ancho y la altura.
- **CLI no interactiva:** `task list|create|show|start|done|reopen`, `project list|create`, `workspace list`, `use`, `--help` y `--version`.
- **Herramientas de desarrollo:** `dev migrate|seed|reset` y los scripts `db:*` (seed con datos demo de Bravos Development).
- **Persistencia:** SQLite local vía `node:sqlite` + Drizzle, con migraciones automáticas, restricciones CHECK y claves foráneas.
- **Configuración:** rutas XDG y `config.json` validado con zod (modo `remote` reservado).
- **Errores:** mensajes amigables sin stack traces; `SOJA_DEBUG=1` para ver el detalle.
- **Calidad:** 73 tests (dominio, servicios, configuración, persistencia, flujos de UI con ink-testing-library), TypeScript estricto y ESLint.

[Unreleased]: https://github.com/Mike28108/soja-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Mike28108/soja-cli/releases/tag/v0.1.0
