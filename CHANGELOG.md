# Changelog

Todos los cambios relevantes de SOJA se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).
La documentación completa del estado actual está en [`docs/SOJA.md`](docs/SOJA.md).

## [Unreleased]

## [0.4.0] - 2026-09-24

Trabajo en equipo: incluye los hitos **v0.3** (modo remoto con `soja-backend`, login con GitHub) y **v0.4** (trabajo sin conexión con sincronización). No hubo release 0.3.0 separada. Requiere `soja-backend` ≥ 0.2.0.

### Added

- **Trabajo sin conexión en modo remoto (v0.4):** réplica local del workspace. Crear y editar tasks, comentar y el flujo Git funcionan sin red; los cambios se encolan y se envían al reconectar, una sola vez cada uno. Las tasks nuevas aparecen como `SOJA-?1` hasta recibir su número real.
- **Conflictos visibles:** campo por campo gana el último en llegar al servidor, y quien llegó último recibe un aviso con opción de restaurar (`!` en el detalle de la task). Los cambios rechazados por el servidor se deshacen con un aviso.
- `soja sync [--dismiss]`; la CLI sincroniza antes y después de cada comando en modo remoto, y el header de la interfaz muestra `offline · N pending` / `syncing…`.
- **Modo remoto (v0.3):** trabajo en equipo contra `soja-backend`. `soja login --server <url>` (GitHub device flow), `soja logout`, `soja mode [local|remote]`, `soja whoami`. La interfaz y los comandos son los mismos; el header muestra `⇄ servidor`.
- `soja workspace create <nombre>` y `soja workspace add <username>`.
- `config.json` guarda ambos modos a la vez (bloque `remote` con servidor, usuario y workspace); los tokens van en `credentials.json` con permisos `0600`. Las rutas locales de los repositorios viven en la réplica.

### Fixed

- En modo remoto, la interfaz se actualiza en cuanto termina **cualquier** sincronización: una task creada con conexión pasa de `SOJA-?1` a su número real en segundos, sin reabrir SOJA. Antes solo se refrescaba cada 30 s.
- `soja login --server` acepta la URL que se pega tras probar el servidor (`…/v1/health`, barra final) y explica si la dirección no es un servidor SOJA, en lugar de responder *Not signed in*.
- Con un pipe cerrado antes de tiempo (`soja … | head`), SOJA ya no termina de golpe: deja de escribir y completa el comando (en modo remoto, su sincronización).

### Changed

- Contratos de servicio (`application/ports.ts`): la UI y la CLI no dependen de la fuente de datos; el flujo Git ya no accede a SQLite directamente.

## [0.2.0] - 2026-09-24

Flujo de trabajo con Git: branches, commits, merges, push y pull requests desde cada task; todo offline salvo push y PR.

### Added

- **Flujo Git local (v0.2):** `soja start <id> [--from <ref>] [--link]` crea o cambia a la branch de la task, y luego te la asigna, la pasa a In Progress y registra la branch. Git va primero: si falla, la task no cambia.
- `soja project link <key> [ruta]` y `soja project unlink <key>`: vinculan un proyecto a la raíz de un repositorio local, tomando `repository_url` de `origin`. En la TUI, columna REPO en Projects; las rutas escritas a mano aceptan `~`.
- **Estado Git en el detalle de la task** (TUI y `soja task show`): branch y si está activa, cambios sin guardar, y commits relacionados (los que solo existen en la branch o mencionan `SOJA-n` en el mensaje).
- Tecla `b` en el detalle de task: iniciar en su branch con confirmación de lo que hará Git.
- Opción "Branch name" en el menú de edición para registrar o corregir la branch a mano.
- Proyecto por defecto al crear tasks (CLI y TUI) cuando SOJA se ejecuta dentro de un repositorio vinculado.
- **Carpetas padre y selector visual de repositorio:** registras las carpetas que contienen tus repos (por ejemplo `~/workspace/products` y `~/workspace/services`) y, con `r` en Projects, eliges la subcarpeta de una lista filtrable tipo `ls -1` que marca los repos Git y los ya vinculados.
- `soja folders [list|add|remove]` y el comando **Parent folders** en el palette.
- `soja project link ENROLL enrollbridge`: vincula por nombre de subcarpeta.
- **Operaciones Git desde la interfaz** (menú `g` en la task): commit eligiendo archivos (`C`), push, abrir PR con `gh`, merge `--no-ff` en la branch base, abortar merge y borrar branch. Merge, PR y borrado piden confirmación; borrar una branch sin mergear pide dos.
- **Log en vivo** de los comandos Git y su salida, y **errores con sugerencias** (conflictos, sin mergear, credenciales, rechazo del remoto, sin conexión, sin `origin`, identidad de Git, `gh` sin sesión…). Comando **Git log** en el palette.
- **Autenticación delegada:** SOJA usa tus credenciales de Git y `gh`; con `i` pausa la interfaz para que Git las pida en la terminal.
- CLI: `soja commit`, `soja merge [--delete] [--done]`, `soja branch delete [--force]`, `soja push` y `soja pr`, con salida en vivo.
- Eventos de timeline `git_committed`, `git_merged`, `git_branch_deleted`, `git_pushed` y `pr_opened`, y columna `tasks.base_branch` (migración `0001`).
- **Detección de merges hechos fuera de SOJA:** si la branch de una task se mergea con otra herramienta (Claude, Codex, a mano, o en GitHub + pull), SOJA lo detecta al abrirse, al volver a la lista o al abrir la task, y la pasa a **Done** con aviso y evento `git_merge_detected`. Si la branch se borró sin merge, avisa y ofrece recrearla u olvidarla (*Forget branch* en el menú `g`). Funciona 100 % local.
- `soja task list` y `soja task show` también detectan y avisan de esos merges.
- Columna `tasks.branch_start` (migración `0002`): el commit desde el que empezó la branch, para no confundir una branch recién creada con una mergeada.
- `config.json` admite `parentFolders` (compatible con la config de v0.1; se conserva al cambiar de workspace).

### Fixed

- `soja … | head` ya no termina con un error `EPIPE` cuando el pipe se cierra antes de tiempo.
- Separador de §15 en `docs/SOJA.md` que GitHub mostraba como encabezado.

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

[Unreleased]: https://github.com/Mike28108/soja-cli/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Mike28108/soja-cli/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/Mike28108/soja-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Mike28108/soja-cli/releases/tag/v0.1.0
