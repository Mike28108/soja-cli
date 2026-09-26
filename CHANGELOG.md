# Changelog

Todos los cambios relevantes de SOJA se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).
La documentación completa del estado actual está en [`docs/SOJA.md`](docs/SOJA.md).

## [Unreleased]

### Added

- v1.6 en implementación: tickets remunerados con precios en unidades monetarias menores, designados por workspace, paso a Review cuando un miembro termina un ticket pago, ledger de devengos y reversión al reabrir, panel TUI de finanzas/rendimiento y salario base privado. El backend valida permisos también en operaciones de sync.
- En Workspaces, owner puede alternar designados con `Tab` + `d` o `soja workspace designate <usuario>` (`--remove` revoca); `$` en el detalle configura el precio del ticket; `f` abre Finanzas, `c` configura moneda y `s` el salario personal.
- Desde Projects, `i` configura/rota o revoca el intake por proyecto y exporta un `.env` privado bajo el directorio de configuración (llave RSA 3072 y secreto, directorio `0700`, archivos `0600`, sin sobrescritura) más el contrato OpenAPI; el backend valida issuer, origin, rol permitido, aserción RS256 e idempotencia. Plantilla de Supabase Edge Function en `soja-backend/docs/PROJECT_INTAKE_API.md`.
- Las solicitudes externas quedan pendientes hasta que el owner las apruebe o rechace en Projects → `i` → Review pending tickets. Solo las aprobadas entran en las listas, búsquedas, contadores, finanzas y sync normal de SOJA; las rechazadas quedan Cancelled.
- El contrato de integración expone `GET /v1/intake/{integrationId}/tickets` con paginación, decisión de aprobación, estado de trabajo, comentarios con autor y asignación para todos los tickets del proyecto. Solo usuarios autenticados con roles permitidos para esa integración pueden consultar la tabla completa.

## [1.5.1] - 2026-09-26

### Fixed

- `soja update` y el aviso de versión nueva fallaban con *npm registry returned 406*: pedían al registro de npm un formato que el documento `/latest` no sirve. Ahora piden JSON normal. Desde 1.4.0 o 1.5.0 hay que actualizar una vez a mano con `npm install --global soja-cli@latest`; después `soja update` funciona.

## [1.5.0] - 2026-09-26

Interruptor del mouse (adelantado del hito v1.5) y publicación en npm con aprobación 2FA.

### Added

- **Interruptor del mouse:** `M` (en cualquier pantalla), un botón `M ● mouse on` al final de la barra de estado, *Mouse off / on* en la command palette y `soja mouse on|off` apagan o encienden el mouse sin reiniciar SOJA. Con el mouse apagado la terminal vuelve a seleccionar y copiar texto normalmente. La elección se recuerda en `config.json` (`mouse`); `SOJA_MOUSE=0` sigue apagándolo solo para esa ejecución.

### Changed

- **Publicación por etapas en npm:** `publish.yml` ya no publica directamente; deja la versión en espera (`npm stage publish`, con *provenance*) y solo sale a npm cuando el propietario la aprueba con 2FA (`npm stage approve`). El Trusted Publisher solo tiene permiso para dejarla en espera.
- El README ya no es de uso interno: explica el modo local sin cuenta y que, en esta primera etapa, el modo en equipo se habilita por solicitud tras `soja login`, revisada en unas 24–48 h.

### Fixed

- Tests de interfaz que fallaban a veces con la máquina cargada (por ejemplo durante `npm publish`): ahora esperan a que la pantalla muestre el resultado en lugar de una pausa fija.
- Los tests de interfaz dependían del tamaño de la terminal donde se ejecutaban (la de pruebas no declara filas y Ink tomaba las del terminal real): ahora usan siempre 100×24, como en CI.

## [1.4.0] - 2026-09-25

Distribución por npm y seguridad (hito v1.4). Requiere `soja-backend` ≥ 1.2.0 para `soja account delete`.

### Added

- **Instalación con `npm install --global soja-cli`.** Las actualizaciones (`soja update` y el aviso diario) consultan el registro de npm; ya no hace falta `gh` ni acceso al repositorio.
- **`soja account delete`:** revoca todas tus sesiones, borra tu perfil y tu solicitud y anonimiza tu autoría en el contenido compartido. Si eres el único miembro de un workspace del que eres owner, primero hay que transferirlo.
- `soja login` y la pantalla de bienvenida usan el backend oficial por defecto; `soja login --server <url>` elige otro.
- Aviso de privacidad (`docs/PRIVACY.md`), licencia propietaria (`LICENSE`), guía de publicación (`docs/NPM_PUBLISH.md`) y de contribución (`CONTRIBUTING.md`).
- **Repositorio público con contribuciones controladas:** solo los colaboradores aprobados por el propietario pueden abrir pull requests (los demás se cierran automáticamente); `main` exige PR con revisión del propietario y CI en verde.

### Security

- El cliente rechaza servidores remotos sin HTTPS (HTTP solo en localhost) y URLs con usuario o contraseña. En el backend (1.2.0), las sesiones vencen a los 30 días y el login público tiene límites por IP.
- La publicación en npm usa *Trusted Publishing* (OIDC) con *provenance*: el paquete se construye y valida en un job sin permisos de publicación, y otro job publica ese mismo archivo, sin tokens de larga duración. El paquete no incluye *source maps*.
- CI sin credenciales persistidas en el checkout y acciones externas fijadas por SHA; Dependabot semanal para npm y GitHub Actions.
- `esbuild` (dependencia transitiva de desarrollo) fijado a una versión corregida; `npm audit` sin vulnerabilidades conocidas.

## [1.3.0] - 2026-09-25

### Added

- **Acceso remoto aprobado:** el login de GitHub crea una sesión separada del permiso Online. Las cuentas nuevas completan nombre, fecha de nacimiento, país y una carta de hasta 100 caracteres; quedan en modo local hasta aprobación. `soja access status|request|approvals|approve|reject` consulta y administra solicitudes; solo el ID GitHub CEO configurado puede aprobar.
- **Selección de workspace al entrar:** cuando una cuenta aprobada pertenece a varios workspaces, `soja login` pide elegir uno antes de activar el modo remoto.
- **Inicio de cuenta en la TUI:** ofrece GitHub o Modo Local, recoge el perfil con un selector de países buscable y reanuda Online después de autenticar; la vista `A` lista y resuelve solicitudes para el CEO. Su badge se muestra junto al usuario.

- **Chat:** `Ctrl+G` abre el selector de canales incluso con el foco en el compositor; permite cambiar o crear un canal sin pasar primero a la lista de mensajes.
- **Mascotas animadas** integradas desde `ink-agent-scenes`, con colores de SOJA y escenas por estado de task, lista y sincronización. Se muestran al pie del panel en terminales amplias y se pausan cuando la pantalla queda oculta.
- **Marca persistente en el footer:** wordmark ASCII original de tres líneas (el del splash) junto al eslogan, bajo la fila de modo, atajos y conexión; la altura y disposición se adaptan al ancho de la terminal.
- Se añadió una fila de aire entre el panel y el footer, y otra entre los atajos del footer y el wordmark.

### Changed

- La sincronización remota invalida consultas por entidad y dependencia: los ciclos sin cambios no recargan datos; los cambios de tasks, proyectos, miembros y chat actualizan las vistas relacionadas. La selección de la task se conserva si sigue en la lista, y el detalle sigue la identidad estable cuando una task recibe su número definitivo.

## [1.1.0] - 2026-09-25

Interfaz tipo aplicación (hito v1.1). Solo interfaz: los comandos, los datos y el servidor no cambian.

### Added

- **Marco de aplicación:** barra de título y barra de estado con fondo (pastilla de modo y atajos dibujados como teclas), barra lateral con las vistas de tasks y sus contadores, canales del chat y proyectos (desde 110 columnas), paneles con bordes redondeados y título en el borde, avisos flotantes (*toasts*).
- **Ventanas flotantes** sobre la pantalla (que sigue visible detrás): selectores con campo de filtro y selección rellena, confirmaciones con botones (*Cancel* por defecto; rojo si borra), formulario de nueva task con campos rellenos y selectores `‹ valor ›`, búsqueda, commit con casillas `☑`, log de Git como consola.
- **Paleta propia** en truecolor con variantes oscura y clara, detectadas del fondo de la terminal (OSC 11, `COLORFGBG`) o elegidas con `SOJA_THEME`; se degrada a 256/16 colores.
- **Mouse:** clic para seleccionar y otro para abrir, pestañas, barra lateral, botones y campos del detalle clicables, rueda para desplazar, clic fuera cierra una ventana. `SOJA_MOUSE=0` lo desactiva; `Shift` + arrastrar selecciona texto.
- Lista de tasks con pestañas, medidor de prioridad (`▰▰▰▱`), estado como etiqueta de color, barra de desplazamiento y **vista previa** de la task seleccionada.
- Detalle de task en paneles (Details, Description, Activity, Mentioned in chat), con estado y prioridad clicables.
- Proyectos con barra de progreso, workspaces con miembros, ayuda como rejilla de paneles con una sección de mouse, chat con colores por autor, menciones resaltadas y compositor enmarcado.
- Asistente de primera configuración tipo instalador (pasos, progreso, *Back*/*Next*) y splash centrado con spinner.

### Fixed

- La paleta de comandos *All Tasks*, *Archived tasks* y demás vistas cambiaba la ruta pero no la lista.
- Un contexto largo de una ventana (por ejemplo, los avisos antes de mergear un PR) ya no se pierde: se muestra bajo el título.

### Removed

- Header y footer de una línea (los reemplazan la barra de título, la barra de estado y los avisos).

### Fixed

- La suite E2E no detenía de verdad el servidor en CI (`npx` dejaba vivo el proceso hijo), así que la parte sin conexión no probaba nada. Ahora el servidor corre en su propio grupo de procesos, se detiene entero, y el test falla si sigue respondiendo.

## [1.0.0] - 2026-09-24

Consolidación (hito v1.0). Para importar datos locales y borrar tasks en equipo requiere `soja-backend` ≥ 1.0.0.

### Added

- **Archivar tasks:** desde el menú Edit (`e`) o `soja task archive|restore <id>`. Salen de las listas y los contadores, siguen en la búsqueda y en *Archived tasks* (palette) o `soja task list --archived`. En equipo se sincroniza, también sin conexión.
- **Borrar tasks para siempre** (solo owners): menú Edit con dos confirmaciones, o `soja task delete <id>` escribiendo el ID. Se van los comentarios y el timeline, para todo el equipo; si el servidor lo rechaza, la task vuelve con un aviso. Requiere `soja-backend` con soporte de borrado.

- **Descripción en tu editor:** `d` abre `$VISUAL`/`$EDITOR` (o `vi`) con la descripción y SOJA se aparta mientras editas; *Description, one line* sigue en el menú Edit.
- `soja task comment <id> [texto|-]` y `soja task describe <id> [texto|-]`: sin texto abren `$EDITOR`, `-` lee stdin.
- **Editar proyectos:** `e` en Proyectos o `soja project edit <key> --name/--description/--url` (la key no cambia; en equipo requiere conexión).
- **Canales:** tema y archivo desde el selector del chat, `soja chat topic <canal> <texto>` y `soja chat archive|unarchive <canal>`.

- **`soja import-local`:** lleva al servidor tus proyectos, tasks (también archivadas), comentarios y timeline del modo local, con fechas. Conserva los números si el workspace está vacío o muestra la equivalencia si renumera; asocia developers por username y avisa de los que no son miembros; conserva los vínculos de carpetas; no duplica si se repite. Tras `soja login`, SOJA lo sugiere si hay datos locales. Requiere `soja-backend` ≥ 1.0.

- **Instalación desde GitHub Releases** con `gh` (el código sigue privado) y **`soja update`** (`--check` solo avisa). SOJA avisa de versiones nuevas al abrir la interfaz y en `soja --version`, consultando GitHub como mucho una vez al día. Cada tag publica el release con su paquete (`release.yml`).
- **Copias de seguridad:** una diaria al abrir la interfaz (se guardan 7) de la base en uso (local o réplica), `soja backup`, `soja backup list` y `soja backup restore <nombre>` (guarda antes el estado actual).
- **CI:** lint, tests y build en cada push y PR; chequeo de que el dominio compartido coincide con `soja-backend` (`npm run check:domain`); suite de extremo a extremo con backend real y PostgreSQL (`npm run test:e2e`). Los dos últimos necesitan el secret `SOJA_REPOS_TOKEN`.

### Fixed

- Los tests de Git dependían de la identidad global de Git de la máquina (los commits que hace SOJA la usaban) y fallaban en una máquina limpia. Ahora todo Git en los tests usa una identidad fija y ignora la configuración global (`test/setup.ts`); lo detectó el primer CI.

### Changed

- Los números de tasks borradas no se reutilizan en modo local (`workspaces.last_deleted_number`; migración `0006`, que también añade `tasks.archived_at`).
- `confirm` de la CLI se comparte entre comandos (`cli/prompt.ts`).

## [0.6.0] - 2026-09-24

GitHub en SOJA (hito v0.6), a través de la CLI `gh`. En modo remoto, requiere `soja-backend` ≥ 0.4.0 para compartir los eventos de PR.

### Added

- **Estado del pull request en la task:** número, estado, revisión, checks del último commit y conflictos, leídos con `gh` al abrir la task.
- **Marca de PR en las listas** (`#12✓`, `#12✕`, `#12◌`), con una sola consulta a GitHub por repositorio cada minuto.
- **Merge del PR en GitHub desde SOJA:** menú Git → *Merge pull request on GitHub…* o `soja pr merge <id> [--delete-branch]`. Muestra antes lo pendiente (checks, aprobación, conflictos), hace un merge commit, opcionalmente borra la branch y marca la task Done.
- **Lo que pasa en GitHub llega a SOJA:** un PR mergeado en GitHub cierra su task (una sola vez) y los checks fallidos quedan en el timeline una vez por commit, con aviso. En equipo, todos los ven.
- `soja pr status <id>` y la línea de PR en `soja task show`.
- Eventos `pr_merged` y `pr_checks_failed` (migración `0005`).
- Errores de `gh` explicados: repositorio fuera de GitHub, sin conexión con GitHub, reglas del repositorio que bloquean el merge, conflictos del PR.

## [0.5.0] - 2026-09-24

Chat del equipo en tiempo real (hito v0.5). Requiere `soja-backend` ≥ 0.3.0 para el chat; con servidores anteriores, el resto del modo remoto sigue funcionando.

### Added

- **Chat del equipo (v0.5, modo remoto):** canales abiertos por workspace (`#general` por defecto), mensajes con respuestas citadas, menciones `@usuario` y referencias `SOJA-n`. `#` abre el chat desde cualquier pantalla: lista de canales con no leídos, campo de escritura siempre activo (`enter` envía, `alt+enter` nueva línea, `@` + `tab` completa), y en la lista de mensajes `r` responde, `t` crea una task desde el mensaje (con respuesta automática `→ SOJA-n`), `e`/`d` edita o borra lo tuyo y `enter` abre la task mencionada.
- **Tiempo real:** con la interfaz abierta, una conexión WebSocket trae los mensajes al instante y sincroniza en cuanto el equipo cambia algo (también tasks). Se reconecta sola y sincroniza al volver.
- **Chat sin conexión:** se lee desde la réplica; enviar, editar, borrar y marcar como leído van a la cola (`⋯` pendiente). Si el servidor pide esperar (límite de 30 mensajes cada 10 s), el resto sale solo poco después, en orden.
- Header con `✉ 3 · @1` (no leídos · menciones); marcas de lectura compartidas entre tus máquinas.
- Detalle de task: sección **MENTIONED IN CHAT** con los mensajes que la nombran.
- CLI: `soja chat [#canal]`, `soja chat send <canal> <texto|->` (`-` lee de stdin, para scripts y hooks), `soja chat log`, `soja chat channels`, `soja chat new`.
- Un mensaje rechazado por el servidor deja un aviso y permite recuperar el texto (`!` en el chat).

### Changed

- Réplica del modo remoto: tablas `chat_channels`, `chat_messages`, `chat_reads`, y `task_id` opcional en `sync_outbox` (migración `0004`).

### Fixed

- Un cambio hecho mientras otra sincronización estaba en curso podía esperar hasta la siguiente (hasta 30 s); ahora se envía justo al terminar la actual.
- Cerrar SOJA ya no deja sincronizaciones programadas que fallaban tras cerrar la réplica.

## [0.4.1] - 2026-09-24

### Security

- **El texto de otras personas ya no puede manipular tu terminal.** En modo remoto, un título, descripción, comentario o nombre con secuencias de escape ANSI podía imitar la salida de SOJA, cambiar el título de la ventana o escribir en el portapapeles (OSC 52), y en la CLI llegaba a la terminal sin filtro. Ahora se eliminan los caracteres de control y *bidi* de todo lo que llega del servidor, de los mensajes y autores de commits, del log de Git y de sus errores. Se recomienda actualizar a todo el equipo.

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

[Unreleased]: https://github.com/Mike28108/soja-cli/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/Mike28108/soja-cli/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/Mike28108/soja-cli/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/Mike28108/soja-cli/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Mike28108/soja-cli/compare/v1.1.0...v1.3.0
[0.4.1]: https://github.com/Mike28108/soja-cli/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Mike28108/soja-cli/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/Mike28108/soja-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Mike28108/soja-cli/releases/tag/v0.1.0
