# SOJA — Documentación

**Software Operations & Job Assistant**

> No dashboards. No browser. No bullshit. Just work.

| | |
| --- | --- |
| Versión de la app | **0.5.0** |
| Versión del documento | **0.5.0** (revisión 2) |
| Última actualización | 2026-09-24 |
| Autor | Enmauel.biz |
| Repositorio | `soja-cli` |

Este documento describe el estado **actual** de SOJA. Se actualiza en el mismo cambio que modifica la app (ver [Versionado y mantenimiento](#17-versionado-y-mantenimiento-de-este-documento)). El detalle de qué cambió en cada versión está en [`CHANGELOG.md`](../CHANGELOG.md).

---

## Índice

1. [Qué es SOJA](#1-qué-es-soja)
2. [Instalación](#2-instalación)
3. [Primer uso](#3-primer-uso)
4. [Conceptos](#4-conceptos)
5. [La interfaz (TUI)](#5-la-interfaz-tui)
6. [Atajos de teclado](#6-atajos-de-teclado)
7. [CLI no interactiva](#7-cli-no-interactiva)
8. [Flujo de trabajo con Git](#8-flujo-de-trabajo-con-git)
9. [Modo remoto (equipo)](#9-modo-remoto-equipo)
10. [Configuración y datos locales](#10-configuración-y-datos-locales)
11. [Modelo de datos](#11-modelo-de-datos)
12. [Arquitectura](#12-arquitectura)
13. [Decisiones técnicas](#13-decisiones-técnicas)
14. [Guía de desarrollo](#14-guía-de-desarrollo)
15. [Testing](#15-testing)
16. [Limitaciones conocidas y roadmap](#16-limitaciones-conocidas-y-roadmap)
17. [Versionado y mantenimiento de este documento](#17-versionado-y-mantenimiento-de-este-documento)

---

## 1. Qué es SOJA

SOJA es una herramienta interna de gestión de tareas **exclusiva para equipos de desarrollo**. Funciona en la terminal (React + Ink) y convierte en tareas técnicas trazables las solicitudes que llegan de manera informal: WhatsApp, reuniones, mensajes de otros departamentos.

```text
Solicitud externa → Developer la registra en SOJA → Proyecto → Developer asignado
                  → Trabajo → Review → Done
```

- Los **usuarios** son solo developers.
- Los otros departamentos (Marketing, Finance, Admissions…) no tienen cuenta: aparecen como **requester**, que es metadata de la task.
- No hay web, dashboard ni frontend web. Todo se hace desde el teclado.

### Principios de producto

- *Fast enough to use before you forget the task.*
- Terminal-native, keyboard-first y minimalista, con identidad propia.
- Funcionalidades reales y persistentes; nada de prototipos con datos simulados.

### Estado actual (v0.5.0)

Dos modos. **Local** (predeterminado): todo vive en SQLite en tu máquina, sin cuenta ni servidor. **Remoto**: un equipo comparte workspaces, proyectos y tasks a través de `soja-backend`, con login de GitHub, trabajo sin conexión y **chat del equipo en tiempo real** (ver [§9](#9-modo-remoto-equipo)). En ambos, el flujo Git de v0.2 (ver [§8](#8-flujo-de-trabajo-con-git)) funciona en tu máquina.

El chat requiere `soja-backend` ≥ 0.3.0.

---

## 2. Instalación

### Requisitos

- **Node.js 24 o superior**: SOJA usa el módulo nativo `node:sqlite`.
- npm 10 o superior.
- Una terminal con soporte Unicode. Se recomiendan terminales modernas (kitty, WezTerm, iTerm2, Alacritty, GNOME Terminal…).

### Desde el código fuente

```bash
git clone https://github.com/Mike28108/soja-cli.git
cd soja-cli
npm install
npm run dev          # ejecuta SOJA desde el código fuente
```

### Como comando `soja`

```bash
npm run build
npm link             # instala el binario "soja" globalmente
soja
```

Para desinstalarlo: `npm unlink -g soja-cli`.

> npm 11 puede avisar que bloqueó el script `postinstall` de esbuild. No afecta: `tsx` y `vitest` funcionan igual.

---

## 3. Primer uso

Al ejecutar `soja` por primera vez (cuando no existe configuración):

1. Aparece el **splash** con la identidad de SOJA.
2. Se hacen tres preguntas:
   - **What's your name?**: tu nombre visible.
   - **Username**: se sugiere a partir del nombre y se puede editar. Minúsculas, números, `.`, `-` o `_`; máximo 32 caracteres.
   - **Workspace name**: por ejemplo, *Bravos Development*.
3. SOJA crea el usuario, el workspace y la membresía (rol `owner`), guarda la configuración y entra directo a **My Work**.

En el setup, `enter` avanza y `esc` vuelve al paso anterior.

### Datos de demostración

```bash
npm run db:seed
```

Crea el workspace **Bravos Development** con:

- los developers `michael`, `angel` y `freddy`;
- los proyectos EnrollBridge (`ENROLL`), SPRING, Taskfeeds (`TASK`), Banana Gym (`GYM`) y Mediacore (`MEDIA`);
- 15 tasks con estados, prioridades, tipos, requesters y comentarios variados.

Si ya existe un usuario configurado, el seed lo agrega al workspace demo y le asigna tareas. Se niega a correr si ese workspace ya tiene proyectos.

---

## 4. Conceptos

### Workspace

Un espacio de trabajo aislado (*Bravos Development*, *Personal*, *Freelance*). Cada uno tiene sus propios proyectos, tasks y numeración. Siempre hay un **workspace activo**, que se guarda en la configuración.

Roles actuales: `owner` y `member`.

### Proyecto

Una plataforma o sistema mantenido por el equipo: EnrollBridge, SPRING, Taskfeeds… Cada proyecto tiene un **key** corto (`ENROLL`, `SPRING`, `TASK`):

- Si no se indica, se deriva del nombre: la primera palabra si tiene hasta 6 letras, o si no sus primeras 4.
- Tiene entre 2 y 10 caracteres, empieza por letra y es único dentro del workspace.

Un proyecto puede **vincularse a un repositorio Git local** (`repository_path`); al vincularlo, SOJA toma `repository_url` del remoto `origin` si el proyecto no tenía uno. Ver [§8](#8-flujo-de-trabajo-con-git).

### Task

La entidad central.

- **Identificador humano:** `SOJA-<n>`, secuencial por workspace. Los UUID nunca se muestran en la interfaz.
- **Único campo obligatorio:** el título.

Valores por defecto al crear:

| Campo | Default |
| --- | --- |
| Status | Todo |
| Type | Feature |
| Priority | Medium |
| Assignee | Tú (quien la crea) |
| Project / Requester / Description | Vacíos |

**Tipos:** Bug, Feature, Improvement, Maintenance, Infra, Refactor, Research, Chore.

**Prioridades:**

| Valor | Etiqueta | Color |
| --- | --- | --- |
| `urgent` | URGENT | rojo brillante, negrita |
| `high` | HIGH | rojo |
| `medium` | MED | amarillo |
| `low` | LOW | atenuado |
| `none` | — | atenuado |

**Estados:**

| Valor | Etiqueta | Glifo | Color |
| --- | --- | --- | --- |
| `backlog` | Backlog | ◌ | atenuado |
| `todo` | Todo | ○ | normal |
| `in_progress` | In Progress | ◐ | amarillo |
| `review` | Review | ◎ | cian |
| `blocked` | Blocked | ⊘ | rojo |
| `done` | Done | ✓ | verde |
| `cancelled` | Cancelled | ✕ | atenuado, tachado |

### Reglas de transición de estado

Se permite pasar de cualquier estado a cualquier otro. Las reglas de fechas son:

- Entrar en **In Progress** por primera vez registra `started_at`. Si la task se reanuda, se conserva la fecha original.
- Pasar a **Done** registra `completed_at` y un evento `task_completed`.
- Salir de Done o Cancelled hacia un estado abierto limpia `completed_at` y registra `task_reopened`.
- **Cancelled** no cuenta como completada: `completed_at` queda vacío.

### Agrupaciones de estados

- **Activa:** Todo, In Progress, Review o Blocked. El backlog no cuenta como activo.
- **Abierta:** cualquier estado excepto Done y Cancelled.

### Requester

Texto libre que indica qué departamento o persona originó la solicitud (Marketing, Finance, Admissions, Operations, Management, Baseball Operations…). SOJA recuerda los requesters usados y los ofrece como autocompletado.

### Actividad (timeline)

Cada cambio real genera un evento. Si no cambia nada, no se registra nada. Los eventos y los comentarios forman el **timeline** de la task.

Tipos de evento: `task_created`, `task_updated` (título, descripción, tipo, requester o branch), `status_changed`, `assigned`, `unassigned`, `priority_changed`, `project_changed`, `comment_added`, `task_completed`, `task_reopened`, y los de Git: `git_committed`, `git_merged`, `git_branch_deleted`, `git_pushed`, `pr_opened`, `git_merge_detected`, y los de pull requests en GitHub: `pr_merged`, `pr_checks_failed`.

### Branch sugerida

Mientras una task no tiene branch registrada, SOJA sugiere `<prefijo>/SOJA-<n>-<slug-del-título>` (hasta 5 palabras del título), por ejemplo `fix/SOJA-342-fix-stripe-webhook-duplicate-events`. `soja start` crea esa branch y la registra en la task. El nombre registrado también se puede editar a mano desde el menú `e` (Branch name); editarlo no toca Git.

| Tipo de task | Prefijo |
| --- | --- |
| Bug | `fix` |
| Feature, Improvement | `feat` |
| Chore, Maintenance | `chore` |
| Infra | `infra` |
| Refactor | `refactor` |
| Research | `research` |

---

## 5. La interfaz (TUI)

`soja` sin argumentos abre la interfaz en la *pantalla alternativa* de la terminal, igual que vim o lazygit. Al salir, la terminal queda como estaba.

### Estructura de pantalla

```text
SOJA▁  Bravos Development / EnrollBridge                    @michael  v0.1.0   ← header compacto

<pantalla u overlay activo>

j/k move   enter open   n new   / search   : commands   ? help               ← footer contextual
```

- El **footer** muestra solo los atajos del contexto actual. Durante unos segundos lo reemplaza la confirmación (✓ verde) o el error (✕ rojo) de la última acción.
- Las pantallas anteriores permanecen montadas: al volver con `esc` conservas la selección que tenías.

### Splash

Wordmark de 3 líneas hecho con medios bloques, gradiente verde soja y un cursor `▄▄▄` parpadeante como firma. Dura 700 ms y cualquier tecla lo salta. En terminales de menos de ~45 columnas se muestra el logo compacto `SOJA▁`.

### My Work (Home)

Responde *¿qué tengo que hacer ahora?*

- Tabla con ID, prioridad, proyecto, estado y título. La columna de assignee aparece en los filtros que no son "Mine".
- **Orden:** In Progress, Review, Blocked, Todo, Backlog, Done, Cancelled. Dentro de cada estado, por prioridad y luego las más nuevas primero.
- **Filtros:** Mine, All, Todo, In Progress, Review, Blocked, Done.
  - *Mine* son las tasks abiertas asignadas a ti.
  - *All* son todas las abiertas del workspace.
  - Los filtros de estado abarcan a todos los developers.
- **Pull requests:** una task con PR en GitHub muestra antes del título su número y lo más importante: `#12✓` aprobado (verde) o mergeado (magenta), `#12✕` checks fallando, cambios pedidos o conflictos (rojo), `#12◌` checks corriendo (amarillo), `#12` abierto sin novedades. Sale de un solo `gh pr list` por repositorio, reutilizado durante un minuto (ver [§8](#pull-requests-y-ci-en-github-v06)).
- **Resumen:** `N active · N in progress · N review · N blocked`, con una frase ocasional.
- **Empty states** con algo de personalidad (*"No tasks assigned. You're free. Press n to ruin that."*).

**Diseño responsive:**

| Ancho | Qué se muestra |
| --- | --- |
| ≥ 100 columnas | todo |
| < 100 | sin columna de assignee |
| < 80 | el estado se reduce a su glifo de color |
| < 64 | sin columna de proyecto |

ID, prioridad y título siempre se muestran.

### Detalle de task

- **Cabecera:** ID, tipo, título, estado, prioridad, y la fecha de creación y de última actualización.
- **Campos:** Project, Assignee y Requested by.
- **Branch y Commits** (Git local): la branch de la task con su estado (`● checked out`, `not checked out`, `suggested · b to start`, `missing · b to recreate`), cambios sin guardar del repositorio, y el último commit relacionado con el número de commits adicionales. Si no hay repositorio disponible, se muestra el motivo (por ejemplo, *EnrollBridge has no repository linked*). El estado Git carga aparte, así que el detalle aparece al instante.
- `b` inicia la task en su branch: muestra qué hará en Git (crear, cambiar o quedarse, y vincular el repositorio si hace falta) y pide confirmación.
- **Descripción:** hasta 6 líneas, según la altura disponible.
- **MENTIONED IN CHAT** (modo remoto): los 3 mensajes más recientes del chat que nombran la task (`SOJA-12`), con hora y autor.
- **ACTIVITY:** el timeline con hora, actor y evento. Los comentarios se marcan con `›` y ocupan hasta 3 líneas. Arranca mostrando lo más reciente; `k` sube a lo anterior y `j` baja a lo más nuevo.

### Proyectos

- Lista con KEY, nombre y contadores (activas, en progreso, review, bloqueadas).
- `enter` abre la vista de proyecto: la misma lista de tasks, acotada al proyecto, con descripción, stats y ruta del repositorio si existe.
- `n` crea un proyecto en dos pasos: nombre y luego key, con una sugerencia editable.
- `r` abre el **selector de repositorio**: la lista de subcarpetas de tus carpetas padre, con filtro al escribir (ver [§8](#8-flujo-de-trabajo-con-git)).
- En terminales anchas, la columna REPO muestra la carpeta vinculada.

### Workspaces

- Lista de tus workspaces; el activo lleva `●`.
- Debajo, los developers del workspace activo.
- `enter` cambia de workspace, `n` crea uno nuevo (y te cambia a él) y `a` agrega un developer.

### Chat

Solo en modo remoto (ver [§9](#9-modo-remoto-equipo)). `#` lo abre desde cualquier pantalla; `soja chat #canal` abre SOJA directamente en ese canal.

```text
CHANNELS                  #general  Everything, everyone
▌#general                  18:01  @michael Hola equipo @angel, SOJA-1 falla en CI
 #payments             1   18:02  @angel   hola desde la TUI
[ ] switch  # all                  ↳ @angel: hola desde la TUI
                           18:02  @angel   → SOJA-1 hola desde la TUI
                           18:03  @michael segundo en vivo ⋯
                          › Message #general
```

- **Lista de canales** a la izquierda en terminales de 100 columnas o más, con los no leídos (`1`) o las menciones (`@1`). En terminales estrechas, `#` (desde la lista de mensajes) elige el canal.
- **Campo de escritura** abajo, siempre activo al entrar: `enter` envía y `alt+enter` añade una línea. Pegar texto de varias líneas conserva los saltos. `@` + `tab` completa el nombre de un miembro.
- **`tab`** (o `↑` con el campo vacío) pasa a la lista de mensajes, donde `j`/`k` seleccionan y cada tecla actúa sobre el mensaje seleccionado (ver [§6](#6-atajos-de-teclado)). Subir más allá del primer mensaje trae los anteriores del servidor.
- **Estados de un mensaje:** `⋯` pendiente de envío, `(edited)`, *message deleted*. Los que te mencionan se resaltan en amarillo. Una respuesta muestra arriba la cita (`↳ @autor: …`).
- **Leído:** abrir un canal lo marca como leído en todas tus máquinas. El header muestra `✉ 3 · @1` (no leídos · menciones) en las demás pantallas.
- **Crear una task desde un mensaje** (`t`): el título es la primera línea, la descripción cita el mensaje con su autor y canal, el requester es el autor, y SOJA responde en el canal con `→ SOJA-n título`. Funciona sin conexión: la respuesta sale con el número real (`SOJA-42`, no `SOJA-?1`).
- **Canales nuevos:** en el selector de canales, escribe un nombre que no exista y elige *Create #nombre* (requiere conexión).
- Si el servidor rechaza un mensaje (por ejemplo, porque archivaron el canal mientras estabas sin conexión), aparece un aviso sobre el campo de escritura; `!` en la lista de mensajes ofrece **devolverte el texto** al campo o descartar el aviso.

### Overlays

Ocupan el cuerpo de la pantalla; el header se mantiene.

| Overlay | Qué hace |
| --- | --- |
| **Picker** | Lista con `j/k`, `enter` o números `1–9`. En las listas largas (assignee, proyecto, workspace, comandos) se filtra escribiendo; las flechas navegan. `●` marca el valor actual. |
| **Prompt** | Campo de texto de una línea. Autocompleta con `tab` cuando hay sugerencias (por ejemplo, requesters). |
| **Nueva task** | Formulario rápido: Title, Project, Type, Priority, Assignee y Requested by. `tab`/`↓` cambian de campo, `←/→` cambian el valor, y `enter` crea desde cualquier campo. |
| **Búsqueda** (`/`) | Filtra en cada tecla, por título o por ID (`SOJA-12`, `12`). Incluye las tasks cerradas. |
| **Command palette** (`:` o `Ctrl+K`) | Todas las acciones principales, filtrables escribiendo. |

Desde el picker de asignación puedes escribir un username que no existe y elegir **"Add developer @x and assign"**: lo crea y le asigna la task en un solo paso.

### Comandos del palette

New task, My Tasks, All Tasks, Todo, In Progress, Review, Blocked, Done, Search, Projects, Switch project, New project, Switch workspace, Workspaces, New workspace, Add developer, Parent folders, Help, Quit.

### Edición de campos de texto

Todos los campos de texto admiten estos atajos (estilo readline):

| Teclas | Acción |
| --- | --- |
| `←` / `→` | mover el cursor |
| `Ctrl+←` / `Ctrl+→` | saltar por palabras |
| `Ctrl+A` / `Ctrl+E` | ir al inicio / al final |
| `Ctrl+W` | borrar la palabra anterior |
| `Ctrl+U` | borrar hasta el inicio |
| `Ctrl+K` | borrar hasta el final |

El texto pegado se inserta completo; los saltos de línea se convierten en espacios.

---

## 6. Atajos de teclado

### Globales

| Tecla | Acción |
| --- | --- |
| `j` / `k`, `↓` / `↑` | Mover |
| `g` / `G` | Ir al inicio / al final |
| `Ctrl+D` / `Ctrl+U`, `PgDn` / `PgUp` | Media página |
| `enter` | Abrir / confirmar |
| `esc` | Volver o cerrar el overlay (siempre cierra lo que esté más arriba) |
| `q` | Volver; en Home, salir |
| `n` | Nueva task. Proyecto por defecto: el abierto, o el vinculado al repositorio desde el que se abrió SOJA |
| `/` | Buscar |
| `:` o `Ctrl+K` | Command palette |
| `p` | Proyectos |
| `w` | Workspaces |
| `#` | Chat (modo remoto) |
| `?` | Ayuda |
| `Ctrl+C` | Salir inmediatamente |

### Listas de tasks (Home y proyecto)

| Tecla | Acción |
| --- | --- |
| `h` / `l`, `Tab` / `Shift+Tab`, `←` / `→` | Filtro anterior / siguiente |
| `1`–`7` | Ir directo a un filtro |
| `s` | Cambiar estado de la task seleccionada |
| `a` | Asignar |
| `x` | Marcar Done / reabrir |

### Detalle de task

| Tecla | Acción |
| --- | --- |
| `s` | Estado |
| `p` | Prioridad |
| `a` | Asignar |
| `c` | Comentar |
| `e` | Menú de edición (todos los campos) |
| `d` | Descripción |
| `m` | Mover a otro proyecto |
| `t` | Tipo |
| `r` | Requester |
| `x` | Done / reabrir |
| `b` | Iniciar en su branch Git (equivale a `soja start`) |
| `g` | Menú Git: commit, push, PR, merge, abortar merge, borrar branch, log |
| `C` | Commit eligiendo archivos |
| `j` / `k` | Desplazar el timeline |

### Proyectos

| Tecla | Acción |
| --- | --- |
| `n` | Nuevo proyecto |
| `r` | Elegir el repositorio del proyecto (selector de carpetas) |

### Chat

| Tecla | Acción |
| --- | --- |
| `enter` | Enviar (o guardar la edición) |
| `alt+enter` | Nueva línea |
| `tab` | Completar `@miembro`; si no hay nada que completar, ir a la lista de mensajes |
| `esc` | Cancelar respuesta o edición; si no hay ninguna, volver |
| `j` / `k` | Seleccionar mensaje (en la lista); `k` en el primero trae mensajes anteriores |
| `r` | Responder citando el mensaje |
| `t` | Crear una task desde el mensaje |
| `e` / `d` | Editar / borrar un mensaje tuyo (borrar pide confirmación) |
| `enter` | Abrir la task que nombra el mensaje (`SOJA-n`); si nombra varias, elegir |
| `#` | Elegir o crear canal |
| `[` / `]` | Canal anterior / siguiente |
| `!` | Mensajes no aplicados: devolver el texto o descartar |
| `tab`, `i`, `esc` | Volver al campo de escritura |

### Prioridad de las teclas

Cuando dos contextos usan la misma tecla, gana el más cercano, en este orden: campo de texto > overlay > pantalla > atajo global. Por eso `p` es *prioridad* dentro de una task y *proyectos* en el resto, y las letras escritas en un campo nunca disparan atajos.

---

## 7. CLI no interactiva

Todos los comandos usan los mismos servicios que la interfaz.

- La salida lleva colores solo cuando es una terminal: con pipes o con `NO_COLOR` sale texto plano.
- Los errores van a stderr con código de salida 1.

```text
soja                      Abre la interfaz
soja --help, -h           Ayuda
soja --version, -v        Versión
```

### Tasks

```bash
soja task list [--all | -A] [--status <estado> | -s] [--project <key|nombre> | -p]
soja task create <título…> [opciones]
soja task show <id>
soja task start <id>      # te la asigna y la pasa a In Progress (sin Git)
soja task done <id>
soja task reopen <id>     # de Done o Cancelled a Todo
```

Opciones de `task create`:

| Opción | Corta | Valores |
| --- | --- | --- |
| `--project` | `-p` | key o nombre del proyecto |
| `--type` | `-t` | bug, feature, improvement, maintenance, infra, refactor, research, chore |
| `--priority` | `-P` | none, low, medium (o med), high, urgent |
| `--status` | `-s` | backlog, todo, in_progress (o in-progress), review, blocked, done, cancelled |
| `--assignee` | `-a` | username, `me` o `none` |
| `--requester` | `-r` | texto libre |
| `--description` | `-d` | texto libre |

Si no se indica título y la terminal es interactiva, SOJA lo pregunta. Sin `--project`, si el directorio actual está dentro de un repositorio vinculado a un proyecto, la task se crea en ese proyecto.

`task show` incluye una sección **GIT** con la branch, su estado, los cambios sin guardar y hasta 5 commits relacionados.

Formatos de ID aceptados: `SOJA-12`, `soja-12`, `#12` o `12`.

Alias de subcomandos: `task` = `tasks` = `t`; `list` = `ls`; `create` = `new` = `add`; `show` = `view`.

### Proyectos

```bash
soja project list
soja project create <nombre…> [--key <KEY>] [--description <texto>] [--repo-path <dir>] [--repo-url <url>]
soja project link <key|nombre> [ruta|carpeta]   # por defecto, el directorio actual
soja project unlink <key|nombre>
```

En `project link`, un nombre sin `/` que no existe como carpeta en el directorio actual se busca entre las subcarpetas de tus carpetas padre: `soja project link ENROLL enrollbridge`. Si el nombre existe en más de una carpeta padre, SOJA pide la ruta completa.

### Carpetas padre

```bash
soja folders                        # lista cada carpeta padre y sus subcarpetas (como ls -1)
soja folders add <ruta>             # registra una carpeta padre (acepta ~)
soja folders remove <ruta|nombre>   # la olvida; no borra nada del disco
```

En `soja folders`, `●` marca los repositorios Git y `→ KEY` indica a qué proyecto está vinculado cada uno.

`project list` muestra la ruta vinculada debajo de cada proyecto.

### Git

```bash
soja start <id> [--from <ref>] [--link]
soja commit <id> -m <mensaje> [archivos…] [--all]
soja merge <id> [--delete] [--done] [--yes]
soja branch delete <id> [--force] [--yes]
soja push <id>
soja pr <id> [--yes]
soja pr status <id>                      # estado del PR en GitHub: revisión y checks
soja pr merge <id> [--delete-branch] [--yes]   # merge del PR en GitHub y la task a Done
```

Las operaciones muestran los comandos Git y su salida en vivo (por stderr). `merge`, `branch delete`, `pr` y `pr merge` piden confirmación; sin terminal interactiva exigen `--yes`. `commit` sin archivos ni `--all` lista los archivos cambiados y no hace nada.

Ver [§8](#8-flujo-de-trabajo-con-git).

### Workspaces

```bash
soja workspace list
soja use <slug o nombre>          # equivale a: soja workspace use <…>
```

### Cuenta y modo remoto

```bash
soja login [--server <url>]        # device flow de GitHub; activa el modo remoto
soja logout
soja mode [local|remote]
soja whoami
soja workspace create <nombre>     # en ambos modos; te deja como owner y la activa
soja workspace add <username>      # agrega un developer al workspace activo
soja sync [--dismiss]              # sincroniza ahora y muestra conflictos y rechazos
```

Ver [§9](#9-modo-remoto-equipo).

### Chat

```bash
soja chat [#canal]                     # abre la interfaz en el chat (en ese canal)
soja chat send '#general' "Deploy listo"   # envía; en cola si no hay conexión
echo "Build roto en main" | soja chat send ci -   # `-` lee el mensaje de stdin (scripts, hooks)
soja chat log [#canal] [-n 20]         # últimos mensajes (no los marca como leídos)
soja chat channels                     # canales con no leídos y menciones
soja chat new <nombre> [--topic "…"]  # crea un canal (requiere conexión)
```

`#canal` y `canal` son equivalentes; en la shell, `#` al inicio de una palabra es un comentario, así que usa comillas (`'#general'`) o escribe el nombre sin `#`.

### Herramientas de desarrollo

```bash
soja dev migrate      # aplica migraciones pendientes
soja dev seed         # datos demo (solo en modo local)
soja dev reset [--yes]  # borra la base de datos y la config (pide escribir "reset")
```

### Ejemplos

```bash
soja task create "En EnrollBridge no está cargando el comprobante" -p enroll -t bug -P urgent -r Admissions
soja task list --status blocked
soja task list --all --project spring
soja start SOJA-12            # branch + In Progress
soja task done SOJA-12
soja task list | grep URGENT
```

---

## 8. Flujo de trabajo con Git

Desde v0.2.0. SOJA ejecuta `git` (y la CLI `gh` para los PR) en tu máquina. Vincular, iniciar, commit, merge y borrar branch funcionan **offline**; push y PR necesitan conexión. SOJA nunca hace fetch ni pull por su cuenta.

### Carpetas padre

La mayoría de developers guarda sus repositorios dentro de unas pocas carpetas, por ejemplo:

```text
~/workspace/
├── products/        ← frontends
│   ├── enrollbridge/
│   └── spring-web/
└── services/        ← servicios y backends
    ├── payments-api/
    └── spring-api/
```

Registras solo las **carpetas padre** (`products`, `services`) y SOJA lista sus subcarpetas para que elijas en lugar de escribir rutas. Puedes registrar tantas como quieras.

- Se guardan en `config.json` (`parentFolders`), no en la base de datos, porque son rutas de **esta** computadora.
- La lista muestra solo subcarpetas inmediatas y omite las ocultas (`.idea`, `.cache`…) y los archivos.
- Una carpeta padre que ya no existe aparece como *not found* en lugar de romper la lista.
- **Gestión:** `soja folders add|remove`, el comando **Parent folders** del palette, o **+ Add parent folder…** dentro del selector.

### Vincular un proyecto a su repositorio

**En la interfaz** (recomendado):

1. Pantalla **Projects** (`p`), selecciona el proyecto con `j`/`k` y pulsa `r`.
2. Si todavía no tienes carpetas padre, SOJA te pide la primera (por ejemplo `~/workspace/products`).
3. Aparece el selector con todas las subcarpetas, como `products/enrollbridge`. A la derecha se ve `git`, `git · linked to <Proyecto>` o `not a Git repository` (atenuado, no se puede elegir).
4. Escribe para filtrar (por ejemplo `spr`), elige con `↑`/`↓` y pulsa `enter`.

Al final del selector hay tres acciones: **+ Add parent folder…**, **Type a path…** (escribir una ruta a mano, se acepta `~`) y **Unlink repository** (si el proyecto ya tenía uno).

**En la terminal:**

```bash
soja project link ENROLL enrollbridge          # por nombre, dentro de las carpetas padre
soja project link ENROLL ~/Development/x       # por ruta
cd ~/workspace/products/enrollbridge && soja project link ENROLL   # la carpeta actual
```

Reglas comunes:

- Se guarda la carpeta **raíz** del repositorio, aunque vincules desde una subcarpeta.
- Si el proyecto no tenía `repository_url`, se toma del remoto `origin`.
- Rutas inexistentes o que no son repositorios Git se rechazan con un mensaje claro.

### `soja start <id>`

Es `soja task start` (asignarte la task y pasarla a In Progress) **más** su branch:

1. **Elige el repositorio.** Usa el del proyecto de la task. Si la task no tiene proyecto, usa el repositorio del directorio actual. Si el proyecto no tiene repositorio vinculado y estás dentro de uno, pide `--link` para vincularlo; nunca lo vincula por su cuenta.
2. **Elige la branch.** La registrada en la task, o la sugerida si todavía no tiene. Valida el nombre con `git check-ref-format`.
3. **Ejecuta Git:**

   | Situación | Qué hace |
   | --- | --- |
   | Ya estás en la branch | Nada en Git (`already on`) |
   | La branch existe | `git switch` (`switched to`) |
   | La branch no existe | `git switch --create` desde HEAD o desde `--from <ref>` (`created`, o `recreated` si estaba registrada pero se borró) |

4. **Solo si Git terminó bien**, actualiza la task en una única transacción: assignee, In Progress y branch. En el timeline aparece *linked branch …*.

### Casos que SOJA maneja explícitamente

| Caso | Resultado |
| --- | --- |
| Cambios sin guardar y la branch **ya existe** | Se rechaza: *"… has N uncommitted changes"* y pide hacer commit o stash. La task no cambia. |
| Cambios sin guardar y la branch **es nueva** | Se crea y los cambios se llevan a la branch nueva (comportamiento de `git switch -c`). SOJA lo informa. |
| Proyecto sin repositorio vinculado | Pide `soja project link` o `--link`. |
| Repositorio vinculado que ya no existe | *"…'s repository is gone"*, con indicación para volver a vincularlo. |
| Task sin proyecto fuera de un repositorio | Sugiere ejecutarlo dentro de un repositorio o usar `soja task start` (sin Git). |
| Nombre de branch inválido | Se rechaza antes de tocar Git. |
| Git no instalado o un comando falla | Mensaje de Git resumido; la task no cambia. |
| Git funcionó pero la base de datos falló | Se informa que la branch ya existe; repetir `soja start` es seguro (queda `already on`). |

### Operaciones Git desde la task

En el detalle de una task, `g` abre el **menú Git**:

| Opción | Qué hace | Confirmación |
| --- | --- | --- |
| Start / switch to branch (`b`) | `soja start` (ver arriba) | Muestra lo que hará |
| Commit… (`C`) | Lista de archivos cambiados con casillas (todos marcados; `espacio` alterna, `a` todos/ninguno), luego el mensaje. Añade `(SOJA-n)` si el mensaje no lo menciona. Solo commitea los archivos marcados, aunque otros ya estuvieran en stage. | — |
| Push branch | `git push --set-upstream origin <branch>` | — |
| Open pull request… | Push y luego `gh pr create` hacia la branch base. Título `<título> (SOJA-n)`; en el cuerpo, la descripción, el requester y la referencia. | Sí |
| Merge pull request on GitHub… | `gh pr merge <n> --merge` (merge commit, como el merge local). Antes muestra lo pendiente (checks fallando o corriendo, sin aprobar, cambios pedidos, conflictos). *Merge and delete* además borra la branch en GitHub y aquí. Marca la task Done. | Sí (Cancel por defecto) |
| Merge into base… | Cambia a la branch base y `git merge --no-ff`, con el mensaje `Merge SOJA-n: <título>`. Al terminar ofrece `d` (borrar branch y marcar Done) y `x` (solo Done). | Sí (Cancel por defecto) |
| Abort merge | `git merge --abort` | — |
| Delete branch… | Borra la branch local (si está activa, primero cambia a la base) y la quita de la task. | Sí; si no está mergeada, una **segunda** confirmación |
| Git log | Todo lo que SOJA ejecutó en Git en esta sesión | — |

La **branch base** es la branch desde la que `soja start` creó la de la task (se guarda en la task). Si no se conoce, se usa la branch por defecto (`origin/HEAD`, o `main`/`master`).

Commit exige estar en la branch de la task: si no, SOJA lo avisa para que el commit no caiga en otra branch. Merge y borrar exigen no tener cambios sin guardar.

### Pull requests y CI en GitHub (v0.6)

SOJA lee los pull requests con la **CLI `gh`** de tu máquina, la misma que ya usa para abrirlos: no pide credenciales nuevas y funciona igual en modo local y remoto. Si `gh` no está instalado o no inició sesión, SOJA lo dice en la fila *Pull request* y todo lo demás sigue funcionando.

- **En el detalle de la task**, la fila *Pull request* muestra el número, el estado (`open`, `draft`, `merged`, `closed`), la base, la revisión (`✓ approved`, `✕ changes requested`, `review required`), los checks del último commit (`✓ checks 5/5`, `◌ checks 3/5, 2 running`, `✕ 1 failing: lint`) y si tiene conflictos con la base. Se consulta a GitHub al abrir la task.
- **En las listas**, una marca antes del título (ver [§5](#my-work-home)).
- **Merge desde SOJA:** menú Git → *Merge pull request on GitHub…*, o `soja pr merge <id>`. Hace un merge commit en GitHub, cierra la task y registra `pr_merged`. Si las reglas del repositorio lo impiden (checks obligatorios, aprobaciones, conflictos), SOJA explica por qué y la task sigue abierta. Aprobar, pedir cambios y leer reviews se hace en GitHub.
- **Lo que pasa en GitHub llega solo:** al abrir SOJA, al volver a una lista (como mucho cada 2 minutos), cada 3 minutos con la interfaz abierta, al abrir una task y en `soja pr status`:
  - un PR **mergeado en GitHub** cierra su task aunque nadie haya hecho `pull` (`PR #12 was merged into main on GitHub`). Solo la primera vez: si reabres la task para seguir trabajando, no se vuelve a cerrar;
  - **checks fallidos** quedan en el timeline una vez por commit (`checks failed on PR #12 (a1b2c3d): lint`), con un aviso.
- **En equipo** (modo remoto) esos eventos viajan al servidor como cualquier evento Git, así que todo el equipo ve en el timeline que el PR se mergeó o que el CI falló, lo haya visto quien lo haya visto primero. Requiere `soja-backend` ≥ 0.4.0.
- El texto que viene de GitHub (títulos, nombres de checks) se limpia de secuencias de escape antes de mostrarse, como el resto del texto remoto.

### Merges hechos fuera de SOJA

Flujo típico: SOJA crea la branch (`b`), trabajas en ella con otra herramienta (Claude, Codex, tu editor, un compañero) y el merge se hace fuera de SOJA. SOJA lo detecta solo:

- **Cuándo revisa:** al abrir SOJA, al volver a una lista de tasks (como mucho cada 10 s), al abrir una task, y con `soja task list` y `soja task show`.
- **Qué revisa:** solo las tasks **abiertas** que tienen branch, en tu repositorio local. No hace fetch.

| Lo que encuentra en el repositorio | Resultado |
| --- | --- |
| La branch existe, tiene commits propios y todos están en su base (merge normal o fast-forward) | La task pasa a **Done** |
| En la base hay un commit de merge que nombra la branch o `SOJA-n` (`Merge branch 'fix/SOJA-12-…'`, `Merge pull request #5 from …/fix/SOJA-12-…`), aunque la branch ya se haya borrado | **Done** |
| En la base hay un *squash merge* de GitHub que menciona la task (`… (SOJA-12) (#5)`, como los PR que abre SOJA) | **Done** |
| La branch fue borrada y no hay rastro de merge | La task **no cambia**; el detalle avisa *deleted, no merge found* y ofrece recrearla (`b`) u olvidarla (`g` → *Forget branch*) |

Al cerrar una task así, el timeline registra *merge into main detected (done outside SOJA)* seguido de *completed it*, y el footer lo avisa. Si no estaba terminada, se reabre con `x`.

Para no confundir una branch recién creada (sin trabajo propio) con una mergeada, `soja start` guarda el commit desde el que parte la branch (`branch_start`); solo cuentan los commits posteriores.

**Merges en GitHub:** SOJA los ve cuando traes los cambios a tu máquina (`git pull` o `git fetch` + actualizar `main`). La detección es 100 % local.

### Log en vivo y errores

Cada operación abre una consola que muestra los comandos (`$ git merge …`) y la salida de Git **mientras ocurre**. Al terminar muestra el resultado, o el error con sugerencias concretas y teclas de recuperación:

| Situación detectada | Sugerencia / tecla |
| --- | --- |
| Conflictos de merge | Lista los archivos en conflicto; `a` aborta el merge |
| Branch sin mergear al borrar | `f` borrar igualmente (con confirmación extra) |
| Git necesita credenciales | `i` reintentar de forma interactiva |
| `gh` sin sesión | `i` ejecuta `gh auth login` y reintenta |
| `gh` no instalado | Enlace de instalación |
| El remoto rechazó el push | `git pull --rebase` |
| Sin conexión | Indica que lo local sigue funcionando |
| Sin remoto `origin` | `git remote add origin <url>` |
| Git no sabe quién eres | `git config user.name/email` |
| Cambios que se sobrescribirían | Commit (`C`) o `git stash` |
| El PR ya existe | Muestra su URL |

`r` reintenta cualquier operación fallida.

### Autenticación

SOJA **no pide ni guarda credenciales**. Usa las de Git (claves SSH, credential helper) y las de `gh` (`gh auth login`). Las operaciones se ejecutan primero sin prompts, para que nada quede colgado esperando. Si Git necesita credenciales, la tecla `i` **pausa la interfaz** y ejecuta el comando en la terminal para que Git (o ssh, o gh) te las pida directamente; al terminar, SOJA vuelve donde estabas. En la CLI, `soja push` y `soja pr` se ejecutan directamente en tu terminal, así que Git puede preguntar sin pasos extra.

### Commits relacionados

En el detalle de la task (TUI y `soja task show`), SOJA muestra hasta 10 commits (5 en la CLI) que:

- existen solo en la branch de la task (no en otras branches locales), o
- mencionan la task en el mensaje en cualquier branch local, por ejemplo `Fix receipts (SOJA-16)`. Se ignoran mayúsculas y `SOJA-1` no coincide con `SOJA-12`.

Los commits hechos fuera de SOJA aparecen al reabrir la task o después de cualquier cambio en SOJA.

### Ejemplo completo

```bash
cd ~/workspace/products/enrollbridge
soja project link ENROLL
soja task create "Receipt 500 on large PDFs" -t bug     # proyecto ENROLL por defecto
soja start SOJA-16                                      # branch fix/SOJA-16-… desde main
soja commit SOJA-16 -m "Handle large receipts" --all    # → "Handle large receipts (SOJA-16)"
soja push SOJA-16
soja pr SOJA-16                                         # pregunta y abre el PR con gh
soja merge SOJA-16 --delete --done                      # pregunta, mergea en main, borra y cierra
```

En la interfaz, lo mismo es: abrir la task → `b` → trabajar → `C` → `g` → Push / Open pull request / Merge.

---

## 9. Modo remoto (equipo)

Desde v0.4.0 (incluye los hitos v0.3 y v0.4). Hasta aquí SOJA guarda todo en tu máquina (**modo local**). En **modo remoto**, un equipo comparte workspaces, proyectos y tasks a través de un servidor [`soja-backend`](https://github.com/Mike28108/soja-backend) (repositorio aparte). La interfaz y los comandos son los mismos; solo cambia dónde viven los datos.

```text
soja (tu máquina) ──HTTPS──▶ soja-backend ──▶ PostgreSQL (Supabase)
```

### Empezar

```bash
soja login --server https://tu-servidor-soja
#  1. Open   https://github.com/login/device
#  2. Enter  ABCD-1234        ← apruebas una vez en el navegador
#  ✓ Signed in as @michael

soja workspace create "Bravos Development"   # el primero de tu equipo
soja workspace add angel                     # angel debe haber hecho `soja login` antes
```

- **La URL del servidor** puede pegarse tal cual: `https://host`, `https://host/` o `https://host/v1/health` se entienden igual. Si la dirección no responde como un servidor SOJA, `soja login` lo dice antes de pedir el código.
- **Login con GitHub** (*device flow*, como `gh auth login`): SOJA muestra un código que apruebas en el navegador. SOJA no ve tu contraseña y no guarda tu token de GitHub.
- El token de SOJA se guarda en `~/.config/soja/credentials.json` con permisos `0600`, separado de `config.json`.
- Tu username es tu login de GitHub.

### Cambiar de modo

```bash
soja mode              # muestra el modo actual
soja mode local        # tus datos locales (SQLite), sin cerrar sesión en el servidor
soja mode remote       # vuelve al servidor
soja logout            # revoca la sesión en el servidor y vuelve a local
soja whoami            # usuario, workspace y modo
```

Los dos modos conviven en `config.json`: cambiar de uno a otro no borra nada. En la interfaz, el header muestra `⇄ servidor` cuando estás en modo remoto.

### Qué se comparte y qué no

| Dato | Dónde vive |
| --- | --- |
| Workspaces, miembros, proyectos, tasks, comentarios, actividad | Servidor (lo ve todo el equipo) |
| Branch de cada task y eventos Git (commits, merges, PR…) | Servidor; los reporta la máquina que ejecutó Git |
| Ruta local del repositorio de cada proyecto | **Solo en tu máquina** (en tu réplica local): cada developer tiene el repositorio en su propia carpeta |
| Carpetas padre, URL del servidor, workspace activo | Solo en tu máquina |

Git sigue siendo **local**: `soja start`, commit, merge y push se ejecutan en tu repositorio, y el servidor solo recibe el resultado para el timeline.

### Reglas en el servidor

En modo remoto el servidor aplica las reglas, así que todos los clientes ven lo mismo:

- los números `SOJA-n` (atómicos aunque dos developers creen tasks a la vez);
- una entrada de actividad por cada cambio real;
- las transiciones de estado;
- la validación de miembros y proyectos.

Solo los *owners* agregan developers.

### Trabajar sin conexión (v0.4)

En modo remoto, SOJA guarda una **réplica local** de tu workspace (`~/.local/share/soja/remote/<servidor>.db`). Lees y escribes sobre ella al instante, con o sin red, y SOJA sincroniza con el servidor cuando puede.

| Qué | Sin conexión |
| --- | --- |
| Ver, buscar y filtrar tasks, proyectos y developers | Sí |
| Crear y editar tasks, cambiar estado, asignar, comentar, todo el flujo Git | Sí; se envía al reconectar |
| Crear proyectos o workspaces, agregar developers | No: afectan a todo el equipo y necesitan el servidor |

- **Números provisionales:** una task creada sin conexión aparece como `SOJA-?1`, `SOJA-?2`… y recibe su número real y consecutivo (`SOJA-42`) al sincronizar. Mientras tanto puedes usar `SOJA-?1` en cualquier comando.
- **Cuándo sincroniza:** al abrir SOJA, cada 30 s y poco después de cada cambio en la interfaz; antes y después de cada comando en la CLI; y con `soja sync`. Con la interfaz abierta hay además una **conexión en tiempo real** (ver *Chat*): cuando otra persona cambia algo, el servidor avisa y SOJA sincroniza al momento. Si un cambio se hace mientras otra sincronización está en curso, se envía justo al terminar esa.
- **La vista se actualiza sola** al terminar cada sincronización: una task nueva pasa de `SOJA-?1` a su número real en segundos si hay conexión.
- **Estado:** el header muestra `⇄ servidor · 2 pending`, `offline · 2 pending` o `syncing…`. En la CLI, una línea `⇅ …` avisa si quedaron cambios en cola.
- **Nada se aplica dos veces:** cada cambio viaja con un id único, y el servidor ignora los reintentos.
- **Cerrar SOJA no pierde nada:** la cola vive en la réplica y se envía la próxima vez que haya conexión.

#### Conflictos

Si tú y otra persona cambian **campos distintos** de una task, ambos cambios se conservan. Si cambian **el mismo campo**, gana el último en llegar al servidor, y quien llegó último ve un aviso:

```text
! Your priority change on SOJA-12 replaced a newer value: “urgent”
```

- En la interfaz: en el detalle de la task, `!` abre los avisos con **Restore** (vuelve a poner el valor de la otra persona) o **Dismiss**.
- En la CLI: `soja sync` los lista, y `soja sync --dismiss` los descarta.

Si el servidor **rechaza** un cambio que hiciste sin conexión (por ejemplo, asignar a alguien que ya no está en el workspace), el cambio se deshace y queda un aviso explicando por qué. Una task creada sin conexión que el servidor rechaza desaparece, con su aviso.

El protocolo completo está en `soja-backend/docs/SYNC.md`.

### Chat (v0.5)

Canales abiertos del workspace (todos nacen con `#general`), mensajes con respuestas citadas, menciones (`@angel`) y referencias a tasks (`SOJA-12`). Uso en la interfaz en [§5](#chat), teclas en [§6](#6-atajos-de-teclado) y comandos en [§7](#chat-2).

- **Tiempo real:** con la interfaz abierta, SOJA mantiene una conexión WebSocket (`/v1/live`) con el servidor. Los mensajes de otros aparecen al instante, y cualquier cambio del equipo (tasks, comentarios, proyectos) dispara una sincronización inmediata. El token viaja en el primer mensaje, nunca en la URL. Si la conexión se corta, se reintenta con espera creciente (1 s → 30 s) y, al volver, se sincroniza, así que no se pierde nada. Los comandos de la CLI no abren esta conexión.
- **Sin conexión:** el chat se abre y se lee desde la réplica. Enviar, editar, borrar y marcar como leído se encolan como cualquier cambio (`⋯` hasta que el servidor lo confirma). Los mensajes de varias personas escritos sin conexión quedan en el orden en que llegan al servidor, igual en todas las máquinas. Crear canales y traer mensajes anteriores a la réplica requieren conexión.
- **Reglas del servidor:** solo el autor edita o borra; borrar vacía el texto para todos. Un canal archivado no acepta mensajes. Las menciones y referencias solo cuentan si el miembro o la task existen. Hasta 30 mensajes por persona cada 10 s: si envías más (por ejemplo, al reconectar tras mucho tiempo offline), el resto espera en la cola y sale solo unos segundos después.
- **No leídos y menciones** se calculan en tu máquina a partir de la marca de lectura de cada canal, que solo avanza y se comparte entre tus máquinas.
- El diseño completo está en `soja-backend/docs/CHAT.md`.

### Texto de otras personas en tu terminal

En modo remoto, SOJA muestra texto que escriben otros: títulos, descripciones, comentarios, nombres. Una secuencia de escape ANSI escondida en ese texto podría manipular tu terminal: imitar la salida de SOJA con colores, cambiar el título de la ventana o, en terminales como kitty, **escribir en tu portapapeles**. Por eso SOJA elimina los caracteres de control (salvo saltos de línea y tabuladores) y los caracteres de dirección de texto (*bidi*):

- de **todo** lo que llega del servidor, en un único punto (el cliente HTTP y la conexión en tiempo real comparten el mismo lector de JSON), antes de guardarlo en la réplica, incluidos los mensajes del chat;
- de los **mensajes y autores de commits** que muestra (pueden venir de commits ajenos traídos con `git pull`), de la salida de Git en el log en vivo y de los errores de Git.

Un intento queda visible como texto inofensivo (por ejemplo `[2J`), sin efecto. El servidor, además, rechaza caracteres de control al guardar.

---

## 10. Configuración y datos locales

SOJA sigue la especificación XDG.

| Qué | Ruta | Fallback |
| --- | --- | --- |
| Base de datos | `$XDG_DATA_HOME/soja/soja.db` | `~/.local/share/soja/soja.db` |
| Configuración | `$XDG_CONFIG_HOME/soja/config.json` | `~/.config/soja/config.json` |
| Réplica local de un servidor SOJA (modo remoto) | `$XDG_DATA_HOME/soja/remote/<servidor>.db` | `~/.local/share/soja/remote/<servidor>.db` |
| Tokens de servidores SOJA (modo remoto) | `$XDG_CONFIG_HOME/soja/credentials.json` (permisos `0600`) | `~/.config/soja/credentials.json` |

Las variables XDG que no son rutas absolutas se ignoran. La base de datos usa modo WAL, así que junto a ella aparecen los archivos `soja.db-wal` y `soja.db-shm`.

### `config.json`

```json
{
  "mode": "local",
  "userId": "<uuid>",
  "workspaceId": "<uuid del workspace activo>",
  "parentFolders": ["/home/tu-usuario/workspace/products", "/home/tu-usuario/workspace/services"],
  "remote": {
    "apiUrl": "https://tu-servidor-soja",
    "userId": "<uuid de tu usuario en el servidor>",
    "workspaceId": "<uuid del workspace activo en el servidor>"
  }
}
```

- Se valida con zod al cargar. Si el JSON está roto o la forma es inesperada, SOJA muestra un error claro y sugiere cómo arreglarlo.
- `parentFolders` (opcional, por defecto `[]`): carpetas que contienen tus repositorios (ver [§8](#8-flujo-de-trabajo-con-git)). Los `config.json` de v0.1, que no tienen este campo, siguen funcionando. Cambiar de workspace conserva la lista.
- `mode` elige de dónde salen los datos: `local` (SQLite, `userId`/`workspaceId`) o `remote` (bloque `remote`). Ambos bloques conviven; `soja mode` cambia entre ellos.
- `remote` lo escribe `soja login`. El token **no** está aquí sino en `credentials.json`.
- Si el workspace activo desaparece, SOJA cambia automáticamente a otro workspace del usuario. Si el usuario desaparece (por ejemplo, tras un reset), vuelve a ejecutar el setup.

### Variables de entorno

| Variable | Efecto |
| --- | --- |
| `SOJA_DEBUG=1` | Muestra stack traces y la cadena de causas de los errores |
| `NO_COLOR` / `FORCE_COLOR` | Control de color de la CLI |
| `XDG_DATA_HOME`, `XDG_CONFIG_HOME` | Ubicación de los datos (útil para aislar pruebas) |

---

## 11. Modelo de datos

SQLite, definido en `src/database/schema.ts`. Las migraciones se generan con drizzle-kit en `src/database/migrations/`.

Convenciones:

- IDs de tipo `TEXT` con UUID.
- Fechas `INTEGER` en milisegundos desde epoch.
- Los enums se validan con restricciones `CHECK`.
- Las claves foráneas están activas (`PRAGMA foreign_keys = ON`).

### `users`

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | text PK | |
| username | text | UNIQUE |
| display_name | text | |
| email | text | nullable |
| created_at, updated_at | integer | |

### `workspaces`

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | text PK | |
| name | text | |
| slug | text | UNIQUE; ante un duplicado se agrega `-2`, `-3`… |
| description | text | nullable |
| created_at, updated_at | integer | |

### `workspace_members`

| Columna | Tipo | Notas |
| --- | --- | --- |
| workspace_id | text FK → workspaces | se borra en cascada con el workspace |
| user_id | text FK → users | se borra en cascada con el usuario |
| role | text | CHECK: `owner`, `member` |

Clave primaria: (`workspace_id`, `user_id`).

### `projects`

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | text PK | |
| workspace_id | text FK → workspaces | se borra en cascada con el workspace |
| name | text | |
| key | text | UNIQUE junto con `workspace_id` |
| description | text | nullable |
| repository_url | text | nullable |
| repository_path | text | nullable. Raíz del repositorio Git local vinculado |
| created_at, updated_at | integer | |

### `tasks`

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | text PK | |
| number | integer | UNIQUE junto con `workspace_id`. Se asigna dentro del propio `INSERT` |
| workspace_id | text FK → workspaces | se borra en cascada con el workspace |
| project_id | text FK → projects | nullable; queda en NULL si se borra el proyecto |
| title | text | |
| description | text | nullable |
| type | text | CHECK con los 8 tipos |
| priority | text | CHECK con las 5 prioridades |
| status | text | CHECK con los 7 estados |
| assignee_id | text FK → users | nullable; queda en NULL si se borra el usuario |
| creator_id | text FK → users | |
| requester | text | nullable |
| branch | text | nullable. Branch registrada por `soja start` o editada a mano; se vacía al borrar la branch |
| base_branch | text | nullable. Branch desde la que se creó; destino de merge y PR |
| branch_start | text | nullable. Commit donde empezó la branch; permite detectar merges hechos fuera de SOJA |
| created_at, updated_at | integer | |
| started_at, completed_at | integer | nullable |

Índices: (`workspace_id`, `status`), `assignee_id` y `project_id`.

### `task_comments`

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | text PK | |
| task_id | text FK → tasks | se borra en cascada con la task |
| user_id | text FK → users | |
| body | text | |
| created_at, updated_at | integer | |

### `task_activity`

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | text PK | |
| task_id | text FK → tasks | se borra en cascada con la task |
| user_id | text FK → users | nullable; queda en NULL si se borra el usuario |
| type | text | CHECK con los 16 tipos de evento |
| metadata | text (JSON) | payload tipado según el tipo de evento (ver `src/domain/activity.ts`) |
| created_at | integer | |

Payloads de `metadata`:

| Tipo | Payload |
| --- | --- |
| `status_changed` | `{from, to}` |
| `priority_changed` | `{from, to}` |
| `assigned` | `{from, to}` (ids de usuario) |
| `unassigned` | `{from}` |
| `project_changed` | `{from, to}` (ids de proyecto) |
| `task_updated` | `{field, from, to}`. Para la descripción solo se registra que cambió |
| `comment_added` | `{commentId}` |
| `task_completed` | `{from}` |
| `task_reopened` | `{from, to}` |
| `task_created` | `{}` |
| `git_committed` | `{hash, subject, files}` |
| `git_merged` | `{branch, into, hash}` |
| `git_branch_deleted` | `{branch, merged}` |
| `git_pushed` | `{branch, remote}` |
| `pr_opened` | `{url}` |
| `git_merge_detected` | `{branch, into, hash}` |
| `pr_merged` | `{number, url, into, via}`; `via` es `soja` (merge desde SOJA) o `github` (visto ya mergeado) |
| `pr_checks_failed` | `{number, url, sha, checks}`; uno por commit con checks fallidos |

### Tablas de sincronización (solo en la réplica del modo remoto)

| Tabla | Uso |
| --- | --- |
| `sync_outbox` | Operaciones pendientes de enviar, en orden (`op_id` único, tipo, task, payload, valores base, intentos, último error) |
| `sync_pending_activity` | Eventos del timeline escritos de forma optimista; se reemplazan por los del servidor al confirmarse |
| `sync_state` | Cursor del feed de cambios por workspace, última sincronización y último error |
| `sync_notices` | Avisos de conflictos y rechazos, con el valor sobrescrito para restaurarlo (en el chat, `field = 'chat'` y el texto del mensaje rechazado) |
| `chat_channels` | Canales del workspace (nombre, tema, archivado) |
| `chat_messages` | Mensajes: `seq` (orden del servidor; `null` mientras está pendiente), canal, autor, texto, `reply_to_id`, fechas de creación, edición y borrado |
| `chat_reads` | Hasta qué `seq` leíste cada canal |

En `sync_outbox`, `task_id` es `null` para las operaciones del chat (`message.send`, `message.edit`, `message.delete`, `channel.read`; migración `0004`).

Las tasks creadas sin conexión usan **números negativos** mientras son provisionales (−1 se muestra como `SOJA-?1`). En la réplica las claves foráneas están desactivadas: es una copia del servidor, que es quien impone la integridad.

---

## 12. Arquitectura

### 12.1 Repositorios del producto

SOJA son **dos repositorios Git independientes**, sin monorepo:

```text
soja-cli      ← este repositorio: TUI, CLI, datos locales, cliente del modo remoto
soja-backend  ← auth, usuarios, workspaces, permisos, API, sincronización, chat y tiempo real
```

El cliente **nunca** se conectará directamente a PostgreSQL. El camino será `soja-cli → SOJA API → PostgreSQL/Supabase`.

### 12.2 Capas

```text
cli/   ui/                 Puntos de entrada: comandos y pantallas Ink.
   │                       No conocen SQL ni repositorios.
   ▼
application/services       SessionService, WorkspaceService, ProjectService, TaskService.
   │                       Validación (zod), reglas de negocio, registro de actividad.
   ▼
data/repositories.ts       Interfaces: UserRepository, WorkspaceRepository, ProjectRepository,
   │                       TaskRepository, CommentRepository, ActivityRepository.
   ▼
data/local/*               Implementación actual: Local*Repository (Drizzle).
   ▼
database/                  Esquema, migraciones y cliente node:sqlite.

application/services ──▶ git/types.ts (GitClient) ──▶ git/cli-git.ts (ejecuta `git`)
```

**Contratos de servicio (`application/ports.ts`).** La UI y la CLI dependen de `SessionOperations`, `WorkspaceOperations`, `ProjectOperations`, `TaskOperations`, `GitOperations` y `FolderOperations`. En modo local los implementan los servicios de `application/services/` sobre SQLite. En modo remoto, los servicios de réplica de `data/sync/` reutilizan esos mismos servicios sobre la réplica local (lecturas y escrituras optimistas) y encolan cada escritura; el `SyncEngine` la envía a la API (`data/remote/api-client.ts`) y trae los cambios de otros. `bootstrap.ts` elige según `config.mode`. `GitWorkflowService` depende solo de los contratos de tasks y proyectos, así que funciona igual en ambos modos. El chat tiene su propio contrato, `ChatOperations` (`application/chat.ts`), que solo existe en modo remoto (`services.chat`); lo implementa `data/sync/chat.ts` sobre la réplica. La conexión en tiempo real (`data/remote/live.ts`) solo notifica: los mensajes se envían siempre por la cola, así que online y offline siguen el mismo camino.

Git es un sistema externo, igual que la base de datos: los servicios dependen de la interfaz `GitClient`, y `bootstrap.ts` inyecta la implementación `CliGit`. `GitWorkflowService` coordina Git con `TaskService` y `ProjectService`.

- `domain/` contiene tipos y reglas puras (enums, workflow de estados, nombres, errores). No depende de nada.
- `bootstrap.ts` es la **raíz de composición**: el único archivo que sabe que los repositorios son locales.
- La CLI y la TUI llaman a los mismos métodos. Por ejemplo, `soja task done` y la tecla `x` terminan en `TaskService.complete`.

### 12.3 Estructura de carpetas

```text
src/
├── cli/            index.tsx (entrada, bin), output.ts, runtime.ts
│   └── commands/   task, project, workspace, start, git-ops, folders, account, chat, sync, dev, info, tui, args
├── ui/             App.tsx (arranque), Shell.tsx (header + pila de pantallas + overlay),
│   │               app-state.tsx (sesión, navegación, overlays, avisos), copy.ts
│   ├── branding/   brand.ts (única fuente de la identidad), Logo, CompactLogo, Header, Splash, VersionBadge
│   ├── theme/      theme.ts (colores, glifos y estilos de estado y prioridad)
│   ├── screens/    Setup, TaskList, Task, Projects, Workspaces, Chat, Help, ScreenFrame
│   ├── overlays/   Picker, Prompt, Search, NewTask, OverlayFrame, options, types
│   ├── components/ TaskTable, TextInput, Footer, Labels, EmptyState, task-columns
│   ├── hooks/      use-query, use-list, use-layout, use-task-actions, use-flows, use-commands
│   ├── input/      dispatcher (capas de teclado), KeyProvider, text-editing, list-navigation
│   └── navigation/ routes.ts (pila de pantallas)
├── application/    services/ (session, workspace, project, task, git-workflow, folder), chat.ts, ports.ts, filters.ts, timeline.ts, validation.ts, types.ts
├── git/            types.ts (GitClient, GitError), cli-git.ts (git/gh), console.ts (log en vivo), diagnose.ts (errores → sugerencias), merge-evidence.ts (detección de merges)
├── domain/         task.ts, workflow.ts, activity.ts, entities.ts, chat.ts, naming.ts, errors.ts
├── data/           repositories.ts, local/ (SQLite), remote/ (api-client, live), sync/ (réplica: store, engine, servicios, chat)
├── database/       schema.ts, client.ts, migrate.ts, migrations/
├── config/         paths.ts (XDG), config.ts (zod, modos local/remoto), credentials.ts (tokens 0600), version.ts
├── dev/            seed.ts
├── utils/          errors.ts, text.ts, time.ts
└── bootstrap.ts
test/               domain/, application/, config/, data/, ui/, helpers.ts
```

### 12.4 Modo remoto

El problema previsto en v0.1 se resolvió como se recomendaba: en modo remoto, las reglas que exigen una única fuente de verdad (numeración, actividad, membresías, transiciones) viven en `soja-backend`, que expone una API orientada a comandos (`POST /tasks/:n/changes`, `/start`, `/comments`, `/git-events`…). Los servicios remotos del cliente (`data/remote/services.ts`) son finos: traducen cada operación a una llamada y construyen el timeline localmente a partir de la actividad y los comentarios que devuelve el servidor. Diseño completo en `soja-backend/docs/ARCHITECTURE.md`.

**Deuda conocida:** las reglas puras del dominio (`task.ts`, `workflow.ts`, `naming.ts`, `activity.ts`) están copiadas en ambos repositorios. Si crecen, conviene publicarlas como paquete compartido.

---

## 13. Decisiones técnicas

| Decisión | Motivo |
| --- | --- |
| `node:sqlite` + Drizzle con el driver `sqlite-proxy` | Drizzle estable no tiene driver `node:sqlite`. Así no hay módulos nativos que compilar, y los repositorios son async como lo será un cliente HTTP. |
| TypeScript 6.0 (no 7) | typescript-eslint aún no soporta TS 7. |
| Numeración en el `INSERT` (`MAX(number)+1`) con índice único | Es atómica sin locks adicionales. |
| Transacciones serializadas; las anidadas se unen a la externa (`AsyncLocalStorage`) | Hay una sola conexión, y así se evitan deadlocks cuando un servicio llama a otro. |
| Actividad escrita por los servicios, en la misma transacción que el cambio | Un cambio y su evento se guardan juntos o no se guarda ninguno. |
| El prefijo `SOJA-` es fijo | Lo indica la especificación. Los keys de proyecto son metadata por ahora. |
| Colores ANSI con nombre, en un theme central | Siguen la paleta de la terminal, clara u oscura. Solo el wordmark usa hex. |
| Despachador de teclado por capas | Da un comportamiento de `esc` predecible y permite reutilizar letras según el contexto sin conflictos. |
| Los handlers de teclado se registran en `useLayoutEffect` | Las teclas escritas justo después de abrir un overlay llegan al overlay y no al atajo de abajo. |
| `node:util` (`parseArgs`, `styleText`) en la CLI | Cero dependencias extra, y los colores se desactivan solos cuando la salida no es una terminal. |
| Descripción editable en una sola línea | Es simple y fiable dentro de Ink. `$EDITOR` queda en el roadmap. |
| Splash de 700 ms que se salta con cualquier tecla | Identidad sin frenar al usuario. |
| Git mediante el binario `git` (`execFile`, sin shell, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`) | Sin dependencias; usa la configuración del usuario; nunca queda esperando credenciales; los errores se leen igual en cualquier idioma. |
| En `soja start`, primero Git y después la base de datos | Un fallo de Git nunca deja una task "iniciada" con una branch que no existe. |
| `soja start` reutiliza `TaskService.start` | Las reglas de "tomar una task" viven en un solo lugar, para la CLI y la TUI. |
| Modo remoto detrás de los mismos contratos de servicio | La UI y los comandos no saben de dónde salen los datos; añadir el modo remoto no tocó ninguna pantalla. |
| Texto remoto y de Git limpiado de caracteres de control y *bidi* al entrar | Un compañero (o un token robado) no puede manipular la terminal de otros; un único punto de entrada para los datos del servidor. |
| Réplica local con el mismo esquema y servicios que el modo local | El modo remoto funciona sin conexión y reutiliza reglas ya probadas; solo el `SyncEngine` es nuevo. |
| Números provisionales negativos (`SOJA-?1`) | Sin cambiar el tipo de `number` en todo el código; nunca chocan con números reales. |
| Rutas de repositorio en la réplica (solo en la máquina) | Cada developer tiene el repositorio en su carpeta; el servidor solo comparte la URL. |
| Token de sesión en `credentials.json` (0600), aparte de `config.json` | La configuración se puede compartir o inspeccionar sin exponer credenciales. |
| Merges externos → Done automáticamente, solo con evidencia local | Refleja el trabajo hecho con otras herramientas sin pedir nada; sin red, sin falsos positivos por branches recién creadas (`branch_start`) ni por commits que solo mencionan la task. |
| Credenciales delegadas en Git y `gh`; `i` pausa la TUI (`suspendTerminal` de Ink) | SOJA nunca maneja secretos, y funciona con cualquier configuración (SSH, HTTPS, gestores de credenciales). |
| Comandos sin prompts por defecto (`GIT_TERMINAL_PROMPT=0`, `GH_PROMPT_DISABLED=1`) | Nada queda esperando credenciales dentro de la interfaz; el modo interactivo es explícito. |
| Merge `--no-ff` hacia la branch base registrada | Deja un commit de merge que referencia la task y respeta la branch de la que partió el trabajo. |
| Confirmaciones con "Cancel" preseleccionado | `enter` nunca ejecuta una acción destructiva por accidente. |
| Errores de Git traducidos por patrones (`git/diagnose.ts`), con la salida en inglés forzada (`LC_ALL=C`) | Mensajes y sugerencias consistentes sin importar el idioma del sistema. |
| Carpetas padre en `config.json`, no en la base de datos | Son rutas de cada máquina; en el futuro modo remoto, la base de datos será compartida y las rutas no. |
| El selector detecta repositorios buscando `.git` en cada subcarpeta | Es instantáneo aunque haya muchas carpetas (no ejecuta `git` por cada una). |
| Vincular un repositorio solo con `--link` o una acción explícita | Evita asociar por error el repositorio equivocado (por ejemplo, ejecutar desde otro proyecto). |

---

## 14. Guía de desarrollo

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Ejecuta SOJA desde el código fuente (tsx). Los argumentos van después de `--`: `npm run dev -- task list` |
| `npm run build` | Compila a `dist/` y copia las migraciones |
| `npm start` | Ejecuta `dist/cli/index.js` |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | typecheck + ESLint |
| `npm run db:generate` | Genera una migración a partir de los cambios en `schema.ts` |
| `npm run db:migrate` | Aplica las migraciones (también ocurre en cada arranque) |
| `npm run db:seed` | Datos demo |
| `npm run db:reset` | Borra la base de datos y la config (con confirmación) |

### Probar sin tocar tus datos reales

```bash
XDG_DATA_HOME=/tmp/soja-sandbox XDG_CONFIG_HOME=/tmp/soja-sandbox npm run dev
```

### Cambiar el esquema de base de datos

1. Edita `src/database/schema.ts`.
2. Ejecuta `npm run db:generate -- --name <descripcion>`.
3. Revisa el SQL generado en `src/database/migrations/` y súbelo al repositorio junto con `meta/`.
4. Actualiza la [§11 Modelo de datos](#11-modelo-de-datos) de este documento.

Las migraciones se aplican automáticamente, en una transacción, al abrir SOJA.

### Agregar una funcionalidad (receta)

1. **Dominio:** tipos o reglas puras en `src/domain/`, con sus tests.
2. **Servicio:** el método en `src/application/services/`, con validación zod y actividad si modifica una task. Añade tests en `test/application/`.
3. **Repositorio**, si hace falta un acceso nuevo: primero la interfaz en `data/repositories.ts`, luego la implementación en `data/local/`.
4. **UI:** pantallas y overlays llaman al servicio a través de `useAppState().services`. Las mutaciones van por `run()`, que refresca los datos y muestra la confirmación o el error.
5. **CLI**, si corresponde: el comando en `src/cli/commands/`.
6. **Documentación:** actualiza este archivo y `CHANGELOG.md` (ver [§17](#17-versionado-y-mantenimiento-de-este-documento)).

### Reglas de código

- TypeScript estricto y ESM. Nada de `any`.
- Nada de SQL ni repositorios en componentes.
- Nada de colores sueltos: todos salen de `ui/theme/theme.ts`.
- La identidad (nombre, slogan, ASCII) sale solo de `ui/branding/brand.ts`.
- La versión sale de `package.json`.
- Los errores para el usuario son `SojaError` (o sus subclases), con `message` y un `hint` opcional. Cualquier otro error se considera un bug y se muestra como *"Something went wrong"*.

---

## 15. Testing

Vitest + ink-testing-library. Se prueba **comportamiento**, no píxeles.

| Área | Archivo | Cubre |
| --- | --- | --- |
| Dominio | `test/domain/task.test.ts` | Referencias `SOJA-n`, branch sugerida, orden por urgencia, conteos, keys de proyecto y slugs |
| Workflow | `test/domain/workflow.test.ts` | Transiciones de estado y sus fechas |
| Setup y workspaces | `test/application/session.test.ts` | Primer setup, reutilización, validación, cambio de workspace, miembros |
| Proyectos | `test/application/projects.test.ts` | Keys únicos, duplicados, `resolve`, contadores |
| Tasks | `test/application/tasks.test.ts` | Creación, edición y actividad, transiciones, comentarios y timeline, filtros, búsqueda (con `%` y `_` escapados), aislamiento entre workspaces, requesters |
| Configuración | `test/config/config.test.ts` | Rutas XDG, lectura y escritura, JSON inválido, modo remoto, compatibilidad con config de v0.1 |
| Carpetas padre | `test/application/folders.test.ts` | Agregar, quitar, validar y expandir `~`; listado tipo `ls -1` (sin archivos ni ocultas, con symlinks, repos marcados); carpeta desaparecida; búsqueda por nombre y ambigüedad; se conservan al cambiar de workspace |
| Persistencia | `test/data/persistence.test.ts` | Cerrar y reabrir sobre un archivo SQLite real |
| UI (lógica) | `test/ui/input.test.ts`, `test/ui/layout.test.ts` | Edición de texto, navegación de listas, dispatcher, columnas responsive, pila de navegación, helpers de texto y tiempo |
| Operaciones Git | `test/git/git-operations.test.ts`, `test/git/diagnose.test.ts` | Commit de archivos elegidos (nuevos, borrados, renombrados), rama incorrecta y validaciones; merge `--no-ff` en la base registrada, cambios sin guardar, conflictos con abort; borrar (mergeada, sin mergear con force, cambiando de branch); push a un remoto real local con log; PR con título y cuerpo; diagnóstico de 11 tipos de error; parser de `git status -z` |
| Seguridad de terminal | `test/security.test.ts` | Secuencias hostiles (limpiar pantalla, título, portapapeles OSC 52, colores, C1, *bidi*) eliminadas del texto del servidor, de la réplica tras sincronizar, de commits ajenos, del log de Git y de los errores; saltos de línea, tabuladores y Unicode normal intactos |
| Sincronización offline | `test/data/sync.test.ts` (+ servidor simulado `fake-soja-server.ts`) | Números provisionales que se vuelven reales, dos developers creando offline, campos combinados y conflicto en el mismo campo con aviso, reintentos sin duplicados tras errores del servidor, rechazo que elimina la task y explica, ediciones en cola visibles tras un pull, cerrar y reabrir con cola pendiente, abrir offline desde la réplica, operaciones que requieren conexión |
| Chat | `test/data/chat.test.ts` (+ servidor y WebSocket simulados) | Mensajes offline pendientes que llegan en orden, no leídos y menciones, marcas de lectura entre máquinas que no retroceden, editar y borrar solo lo propio (también offline), mensaje rechazado que devuelve el texto, límite de envío con reintento en orden, task desde un mensaje con respuesta renumerada, canales solo online, mensajes en tiempo real, sincronización al recibir `changes.available`, reconexión y token rechazado; un cambio hecho durante una sincronización se envía al terminarla |
| Pull requests | `test/git/pull-requests.test.ts` (+ `gh` simulado en `fake-gh.ts`) | Lectura del JSON de `gh` (checks de CheckRun y StatusContext, revisión, texto hostil), PR de la task o por qué no hay (sin branch, sin PR, `gh` sin sesión o sin instalar), checks fallidos una vez por commit, PR mergeado en GitHub que cierra la task una sola vez, una llamada a `gh` por repositorio para las listas, merge con borrado de branch, borradores, PRs ya mergeados, cambios sin guardar y reglas del repositorio |
| Merges externos | `test/git/merge-detection.test.ts` | Branch recién creada (no cuenta), merge manual, fast-forward, branch borrada tras el merge, squash de GitHub, borrada sin merge (aviso y *forget*), una sola task, repos no disponibles; reglas de evidencia |
| Git | `test/git/git-workflow.test.ts` | Vinculación (subcarpetas, `origin`, rutas inválidas), crear, cambiar y recrear branches, `--from`, cambios sin guardar, nombres inválidos, repositorio desaparecido, resolución de repositorio, fallo de Git a mitad del flujo (task intacta), commits relacionados |
| UI (flujos) | `test/ui/app.test.tsx` | Setup completo, abrir task, cambiar estado, crear task, comentar, buscar, filtros y palette, comportamiento de `esc`, iniciar branch con `b`, vincular un repositorio con el selector desde cero, commit eligiendo archivos, merge con confirmación y siguientes pasos, doble confirmación al borrar una branch sin mergear, cierre automático al abrir SOJA tras un merge externo, PR con checks en el detalle y merge del PR desde el menú Git; en modo remoto (`test/ui/remote.test.tsx`), número real tras sincronizar y el chat completo: badge `✉`, enviar, mensaje en vivo, responder y crear una task desde un mensaje |

Los tests usan SQLite en memoria y un reloj determinista (`test/helpers.ts`). Los de Git crean repositorios reales en directorios temporales, con una identidad fija y sin la configuración global del usuario. Estado actual: **180 tests en verde**. El modo remoto y la sincronización offline se verificaron además de extremo a extremo con `soja-backend` real, PostgreSQL real y dos developers en máquinas distintas: tasks creadas con el servidor caído, reconexión, convergencia, conflicto con aviso y la TUI mostrando `offline · 1 pending`. Solo GitHub estaba simulado. El chat se verificó igual con `soja-backend` 0.3.0: mensajes offline de dos developers (mismo orden en ambos), texto hostil, un mensaje en vivo en la TUI real (pty), task desde un mensaje con respuesta `→ SOJA-1`, backlinks en el detalle y una ráfaga de 35 mensajes (30 enviados, 5 en cola que salieron solos a los 10 s, en orden). En producción (Railway) se comprobó que el WebSocket atraviesa el proxy. La lectura de PRs se comprobó contra GitHub real con `gh` 2.100 (formato JSON y PRs mergeados).

---

## 16. Limitaciones conocidas y roadmap

### Limitaciones actuales

- La descripción se edita en una sola línea dentro de la TUI; no hay integración con `$EDITOR`.
- No se pueden borrar tasks ni proyectos, ni editar proyectos después de crearlos.
- La CLI no tiene comando para comentar (la TUI sí).
- El estado Git del detalle no se refresca en vivo: los commits hechos fuera de SOJA aparecen al reabrir la task o tras otro cambio.
- `soja start` no hace fetch: `--from origin/main` usa lo último que descargaste. SOJA tampoco hace pull.
- Borrar una branch borra solo la local; la del remoto queda (bórrala desde el PR o con `git push origin --delete <branch>`).
- Los conflictos de merge se resuelven en tu editor; SOJA los lista y permite abortar.
- Los PR requieren la CLI `gh`. No hay webhooks: lo que pasa en GitHub se ve al abrir la task o en la siguiente consulta periódica (cada 3 minutos con SOJA abierto). Aprobar y comentar reviews se hace en GitHub.
- La detección de merges externos no reconoce un *rebase and merge* de GitHub (no deja commit de merge ni conserva los commits de la branch); en ese caso, cierra la task con `x`.
- Las tasks que ya tenían branch antes de esta versión no tienen `branch_start`; para ellas solo cuenta un commit de merge o un squash que las mencione.
- El prefijo `SOJA-` es el mismo para todos los workspaces.
- La búsqueda es por subcadena del título o por ID; no es difusa ni busca en la descripción.
- En modo local no hay autenticación: los developers son registros locales.
- El tiempo real solo existe con la interfaz abierta; la CLI sincroniza antes y después de cada comando.
- Chat: sin mensajes directos, canales privados, hilos, búsqueda ni notificaciones del sistema; no se pueden archivar canales ni cambiar su tema desde SOJA (el servidor ya lo permite).
- Los *backlinks* del chat se calculan en tu máquina buscando `SOJA-n` en el texto, así que incluyen mensajes escritos antes de que la task existiera.
- Sin conexión no se pueden crear proyectos ni workspaces ni agregar developers.
- No se migran datos del modo local a un servidor.

### Roadmap propuesto

El plan detallado y sus límites están en [`ROADMAP.md`](../ROADMAP.md). Los hitos previstos son v0.2 Git Workflow local, v0.3 backend y colaboración, v0.4 sincronización offline, v0.5 chat asociado a tareas, v0.6 GitHub/PR/CI y v1.0 consolidación. Son propuestas: esta documentación describe lo que **ya funciona** en v0.1.0.

Publicados: v0.2 (Git), v0.3–v0.4 (modo remoto con sincronización offline + `soja-backend`) en v0.4.0, y v0.5 (chat en tiempo real por WebSocket) en v0.5.0. Siguiente hito: v0.6, integración con la API de GitHub (PR y CI).

**Fuera de alcance hasta nuevo aviso:** interfaz web, mobile, integraciones con WhatsApp o Slack, telemetría, billing.

---

## 17. Versionado y mantenimiento de este documento

### Versionado de la app

SOJA usa [Versionado Semántico](https://semver.org/lang/es/). La versión vive **solo** en `package.json`; la app la lee de ahí.

| Cambio | Incremento (mientras sea 0.x) |
| --- | --- |
| Funcionalidad nueva o cambio incompatible (CLI, config, esquema sin migración) | `0.MINOR.0` |
| Corrección o mejora interna | `0.x.PATCH` |

Desde la 1.0 se aplica SemVer estricto (MAJOR para cambios incompatibles).

### Cómo se publica una versión

1. Actualiza `package.json` (`npm version <patch|minor> --no-git-tag-version`).
2. En `CHANGELOG.md`, mueve lo que está en **Unreleased** a la nueva versión, con fecha.
3. En este documento, actualiza la tabla de cabecera y el historial de revisiones.
4. Haz commit (`release: vX.Y.Z`) y crea el tag `vX.Y.Z`.
5. Sube ambos: `git push && git push --tags`.

### Reglas de este documento

- Describe el **estado actual**. Lo que se agrega, cambia o elimina se refleja aquí en el mismo commit que lo implementa.
- El historial detallado de cambios va en `CHANGELOG.md`; aquí solo se resume en la tabla siguiente.
- La "Versión del documento" sigue a la versión de la app. La "revisión" aumenta con cada cambio del documento dentro de una misma versión.

### Historial de revisiones

| Doc | App | Fecha | Cambios |
| --- | --- | --- | --- |
| 0.1.0 r1 | 0.1.0 | 2026-09-24 | Documento inicial: primera milestone completa (TUI, CLI, datos locales, arquitectura). |
| 0.1.0 r2 | 0.1.0 | 2026-09-24 | Roadmap trasladado a archivo propio; §14 alineada con Git local antes de backend, sincronización y chat. |
| 0.5.0 r2 | 0.5.0 + v0.6 sin publicar | 2026-09-24 | §8 *Pull requests y CI en GitHub*: estado del PR y checks en el detalle y las listas, merge del PR desde SOJA, PR mergeado en GitHub cierra la task, checks fallidos en el timeline; `soja pr status/merge`; eventos `pr_merged` y `pr_checks_failed` (migración `0005`). |
| 0.5.0 r1 | 0.5.0 | 2026-09-24 | Publicación de v0.5.0 (chat): cabecera, estado actual y roadmap como publicados. |
| 0.4.1 r2 | 0.4.1 + v0.5 sin publicar | 2026-09-24 | Chat del equipo: §5 pantalla, §6 teclas, §7 `soja chat`, §9 tiempo real y reglas, §11 tablas `chat_*` y `task_id` opcional en la cola (migración `0004`), §12 `ChatOperations` y `live.ts`, tests, limitaciones. Una sincronización pedida durante otra ya no se pierde. |
| 0.4.1 r1 | 0.4.1 | 2026-09-24 | §9: texto de otras personas limpiado antes de mostrarse en la terminal (seguridad); decisiones y tests. |
| 0.4.0 r1 | 0.4.0 | 2026-09-24 | Publicación de v0.4.0 (hitos v0.3 y v0.4): cabecera, estado actual, §9 y roadmap como publicados. |
| 0.2.0 r5 | 0.2.0 + v0.3/v0.4 sin publicar | 2026-09-24 | §9: la vista se actualiza al terminar cualquier sincronización. |
| 0.2.0 r4 | 0.2.0 + v0.3/v0.4 sin publicar | 2026-09-24 | §9: `soja login` acepta la URL completa (p. ej. con `/v1/health`) y valida que sea un servidor SOJA. |
| 0.2.0 r3 | 0.2.0 + v0.3/v0.4 sin publicar | 2026-09-24 | §9: trabajo sin conexión (réplica, números provisionales, conflictos, `soja sync`); tablas de sincronización; config remota con `userId`; arquitectura `data/sync/`. |
| 0.2.0 r2 | 0.2.0 + v0.3 sin publicar | 2026-09-24 | Nueva §9 *Modo remoto (equipo)* (secciones siguientes renumeradas); `soja login/logout/mode/whoami`, `workspace create/add`; config con modos local/remoto y `credentials.json`; contratos de servicio y `data/remote/`. |
| 0.2.0 r1 | 0.2.0 | 2026-09-24 | Publicación de v0.2.0: cabecera, estado actual y §8 describen el flujo Git como publicado. |
| 0.1.0 r6 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Detección de merges hechos fuera de SOJA (→ Done), aviso y *Forget branch* para branches borradas sin merge, columna `branch_start` y evento `git_merge_detected` (migración `0002`). |
| 0.1.0 r5 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Operaciones Git desde la task (commit con selección de archivos, push, PR, merge, abort, borrar branch), log en vivo, errores con sugerencias, autenticación delegada; comandos CLI `commit`, `merge`, `branch delete`, `push`, `pr`; columna `base_branch` y 5 eventos nuevos. |
| 0.1.0 r4 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Carpetas padre y selector visual de repositorio (§8), `soja folders`, `project link` por nombre, `parentFolders` en la config (§9). |
| 0.1.0 r3 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Nueva §8 *Flujo de trabajo con Git* (secciones siguientes renumeradas); `soja start`, `project link/unlink`, estado Git en el detalle, tecla `b` y `r`; tests y decisiones de Git; corregido el separador de §15. |
