# SOJA — Documentación

**Software Operations & Job Assistant**

> No dashboards. No browser. No bullshit. Just work.

| | |
| --- | --- |
| Versión de la app | **0.2.0** |
| Versión del documento | **0.2.0** (revisión 1) |
| Última actualización | 2026-09-24 |
| Autor | Enmauel.biz |
| Repositorio | `soja-cli` |

Este documento describe el estado **actual** de SOJA. Se actualiza en el mismo cambio que modifica la app (ver [Versionado y mantenimiento](#16-versionado-y-mantenimiento-de-este-documento)). El detalle de qué cambió en cada versión está en [`CHANGELOG.md`](../CHANGELOG.md).

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
9. [Configuración y datos locales](#9-configuración-y-datos-locales)
10. [Modelo de datos](#10-modelo-de-datos)
11. [Arquitectura](#11-arquitectura)
12. [Decisiones técnicas](#12-decisiones-técnicas)
13. [Guía de desarrollo](#13-guía-de-desarrollo)
14. [Testing](#14-testing)
15. [Limitaciones conocidas y roadmap](#15-limitaciones-conocidas-y-roadmap)
16. [Versionado y mantenimiento de este documento](#16-versionado-y-mantenimiento-de-este-documento)

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

### Estado actual (v0.2.0)

Local-first. Todo vive en un archivo SQLite en la máquina del developer y no hay backend ni sincronización. Incluye el flujo Git de v0.2 (ver [§8](#8-flujo-de-trabajo-con-git)), que funciona sin conexión salvo push y PR. La arquitectura ya está preparada para un futuro `soja-backend` (ver [§11.4](#114-evolución-hacia-modo-remoto)).

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

Tipos de evento: `task_created`, `task_updated` (título, descripción, tipo, requester o branch), `status_changed`, `assigned`, `unassigned`, `priority_changed`, `project_changed`, `comment_added`, `task_completed`, `task_reopened`, y los de Git: `git_committed`, `git_merged`, `git_branch_deleted`, `git_pushed`, `pr_opened`, `git_merge_detected`.

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
```

Las operaciones muestran los comandos Git y su salida en vivo (por stderr). `merge`, `branch delete` y `pr` piden confirmación; sin terminal interactiva exigen `--yes`. `commit` sin archivos ni `--all` lista los archivos cambiados y no hace nada.

Ver [§8](#8-flujo-de-trabajo-con-git).

### Workspaces

```bash
soja workspace list
soja use <slug o nombre>          # equivale a: soja workspace use <…>
```

### Herramientas de desarrollo

```bash
soja dev migrate      # aplica migraciones pendientes
soja dev seed         # datos demo
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
| Merge into base… | Cambia a la branch base y `git merge --no-ff`, con el mensaje `Merge SOJA-n: <título>`. Al terminar ofrece `d` (borrar branch y marcar Done) y `x` (solo Done). | Sí (Cancel por defecto) |
| Abort merge | `git merge --abort` | — |
| Delete branch… | Borra la branch local (si está activa, primero cambia a la base) y la quita de la task. | Sí; si no está mergeada, una **segunda** confirmación |
| Git log | Todo lo que SOJA ejecutó en Git en esta sesión | — |

La **branch base** es la branch desde la que `soja start` creó la de la task (se guarda en la task). Si no se conoce, se usa la branch por defecto (`origin/HEAD`, o `main`/`master`).

Commit exige estar en la branch de la task: si no, SOJA lo avisa para que el commit no caiga en otra branch. Merge y borrar exigen no tener cambios sin guardar.

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

## 9. Configuración y datos locales

SOJA sigue la especificación XDG.

| Qué | Ruta | Fallback |
| --- | --- | --- |
| Base de datos | `$XDG_DATA_HOME/soja/soja.db` | `~/.local/share/soja/soja.db` |
| Configuración | `$XDG_CONFIG_HOME/soja/config.json` | `~/.config/soja/config.json` |

Las variables XDG que no son rutas absolutas se ignoran. La base de datos usa modo WAL, así que junto a ella aparecen los archivos `soja.db-wal` y `soja.db-shm`.

### `config.json`

```json
{
  "mode": "local",
  "userId": "<uuid>",
  "workspaceId": "<uuid del workspace activo>",
  "parentFolders": ["/home/tu-usuario/workspace/products", "/home/tu-usuario/workspace/services"]
}
```

- Se valida con zod al cargar. Si el JSON está roto o la forma es inesperada, SOJA muestra un error claro y sugiere cómo arreglarlo.
- `parentFolders` (opcional, por defecto `[]`): carpetas que contienen tus repositorios (ver [§8](#8-flujo-de-trabajo-con-git)). Los `config.json` de v0.1, que no tienen este campo, siguen funcionando. Cambiar de workspace conserva la lista.
- `"mode": "remote"` se reconoce, pero se rechaza con el mensaje *"Remote mode is not available in this version of SOJA"*. Queda reservado para el futuro (`{ "mode": "remote", "apiUrl": "…" }`).
- Si el workspace activo desaparece, SOJA cambia automáticamente a otro workspace del usuario. Si el usuario desaparece (por ejemplo, tras un reset), vuelve a ejecutar el setup.

### Variables de entorno

| Variable | Efecto |
| --- | --- |
| `SOJA_DEBUG=1` | Muestra stack traces y la cadena de causas de los errores |
| `NO_COLOR` / `FORCE_COLOR` | Control de color de la CLI |
| `XDG_DATA_HOME`, `XDG_CONFIG_HOME` | Ubicación de los datos (útil para aislar pruebas) |

---

## 10. Modelo de datos

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

---

## 11. Arquitectura

### 11.1 Repositorios del producto

SOJA son **dos repositorios Git independientes**, sin monorepo:

```text
soja-cli      ← este repositorio: TUI, CLI, datos locales, futuro cliente remoto
soja-backend  ← futuro: auth, usuarios, workspaces, permisos, API, realtime
```

El cliente **nunca** se conectará directamente a PostgreSQL. El camino será `soja-cli → SOJA API → PostgreSQL/Supabase`.

### 11.2 Capas

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

Git es un sistema externo, igual que la base de datos: los servicios dependen de la interfaz `GitClient`, y `bootstrap.ts` inyecta la implementación `CliGit`. `GitWorkflowService` coordina Git con `TaskService` y `ProjectService`.

- `domain/` contiene tipos y reglas puras (enums, workflow de estados, nombres, errores). No depende de nada.
- `bootstrap.ts` es la **raíz de composición**: el único archivo que sabe que los repositorios son locales.
- La CLI y la TUI llaman a los mismos métodos. Por ejemplo, `soja task done` y la tecla `x` terminan en `TaskService.complete`.

### 11.3 Estructura de carpetas

```text
src/
├── cli/            index.tsx (entrada, bin), output.ts, runtime.ts
│   └── commands/   task, project, workspace, start, folders, dev, info, tui, args
├── ui/             App.tsx (arranque), Shell.tsx (header + pila de pantallas + overlay),
│   │               app-state.tsx (sesión, navegación, overlays, avisos), copy.ts
│   ├── branding/   brand.ts (única fuente de la identidad), Logo, CompactLogo, Header, Splash, VersionBadge
│   ├── theme/      theme.ts (colores, glifos y estilos de estado y prioridad)
│   ├── screens/    Setup, TaskList, Task, Projects, Workspaces, Help, ScreenFrame
│   ├── overlays/   Picker, Prompt, Search, NewTask, OverlayFrame, options, types
│   ├── components/ TaskTable, TextInput, Footer, Labels, EmptyState, task-columns
│   ├── hooks/      use-query, use-list, use-layout, use-task-actions, use-flows, use-commands
│   ├── input/      dispatcher (capas de teclado), KeyProvider, text-editing, list-navigation
│   └── navigation/ routes.ts (pila de pantallas)
├── application/    services/ (session, workspace, project, task, git-workflow, folder), filters.ts, timeline.ts, validation.ts, types.ts
├── git/            types.ts (GitClient, GitError), cli-git.ts (git/gh), console.ts (log en vivo), diagnose.ts (errores → sugerencias), merge-evidence.ts (detección de merges)
├── domain/         task.ts, workflow.ts, activity.ts, entities.ts, naming.ts, errors.ts
├── data/           repositories.ts, local/
├── database/       schema.ts, client.ts, migrate.ts, migrations/
├── config/         paths.ts (XDG), config.ts (zod), version.ts
├── dev/            seed.ts
├── utils/          errors.ts, text.ts, time.ts
└── bootstrap.ts
test/               domain/, application/, config/, data/, ui/, helpers.ts
```

### 11.4 Evolución hacia modo remoto

**Problema arquitectónico conocido.** Hoy `TaskService` es dueño de reglas que, con varios usuarios, debe imponer el servidor: la numeración de tasks, el registro de actividad y la validación de membresías. Un `RemoteTaskRepository` que solo replicara el CRUD actual duplicaría esas reglas en el cliente y confiaría en que cada cliente escriba la actividad honestamente.

**Camino recomendado:**

1. `soja-backend` expone una API por comandos: crear task, aplicar cambios, comentar, completar. El servidor asigna los números y escribe la actividad.
2. `data/remote/` implementa los repositorios contra esa API. Las operaciones con reglas se delegan al backend, que devuelve la entidad actualizada.
3. `bootstrap.ts` elige la implementación según `config.mode`.
4. La UI y la CLI no cambian: solo dependen de los servicios.

---

## 12. Decisiones técnicas

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

## 13. Guía de desarrollo

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
4. Actualiza la [§10 Modelo de datos](#10-modelo-de-datos) de este documento.

Las migraciones se aplican automáticamente, en una transacción, al abrir SOJA.

### Agregar una funcionalidad (receta)

1. **Dominio:** tipos o reglas puras en `src/domain/`, con sus tests.
2. **Servicio:** el método en `src/application/services/`, con validación zod y actividad si modifica una task. Añade tests en `test/application/`.
3. **Repositorio**, si hace falta un acceso nuevo: primero la interfaz en `data/repositories.ts`, luego la implementación en `data/local/`.
4. **UI:** pantallas y overlays llaman al servicio a través de `useAppState().services`. Las mutaciones van por `run()`, que refresca los datos y muestra la confirmación o el error.
5. **CLI**, si corresponde: el comando en `src/cli/commands/`.
6. **Documentación:** actualiza este archivo y `CHANGELOG.md` (ver [§16](#16-versionado-y-mantenimiento-de-este-documento)).

### Reglas de código

- TypeScript estricto y ESM. Nada de `any`.
- Nada de SQL ni repositorios en componentes.
- Nada de colores sueltos: todos salen de `ui/theme/theme.ts`.
- La identidad (nombre, slogan, ASCII) sale solo de `ui/branding/brand.ts`.
- La versión sale de `package.json`.
- Los errores para el usuario son `SojaError` (o sus subclases), con `message` y un `hint` opcional. Cualquier otro error se considera un bug y se muestra como *"Something went wrong"*.

---

## 14. Testing

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
| Merges externos | `test/git/merge-detection.test.ts` | Branch recién creada (no cuenta), merge manual, fast-forward, branch borrada tras el merge, squash de GitHub, borrada sin merge (aviso y *forget*), una sola task, repos no disponibles; reglas de evidencia |
| Git | `test/git/git-workflow.test.ts` | Vinculación (subcarpetas, `origin`, rutas inválidas), crear, cambiar y recrear branches, `--from`, cambios sin guardar, nombres inválidos, repositorio desaparecido, resolución de repositorio, fallo de Git a mitad del flujo (task intacta), commits relacionados |
| UI (flujos) | `test/ui/app.test.tsx` | Setup completo, abrir task, cambiar estado, crear task, comentar, buscar, filtros y palette, comportamiento de `esc`, iniciar branch con `b`, vincular un repositorio con el selector desde cero, commit eligiendo archivos, merge con confirmación y siguientes pasos, doble confirmación al borrar una branch sin mergear, cierre automático al abrir SOJA tras un merge externo |

Los tests usan SQLite en memoria y un reloj determinista (`test/helpers.ts`). Los de Git crean repositorios reales en directorios temporales, con una identidad fija y sin la configuración global del usuario. Estado actual: **142 tests en verde**.

---

## 15. Limitaciones conocidas y roadmap

### Limitaciones actuales

- La descripción se edita en una sola línea dentro de la TUI; no hay integración con `$EDITOR`.
- No se pueden borrar tasks ni proyectos, ni editar proyectos después de crearlos.
- La CLI no tiene comando para comentar (la TUI sí).
- El estado Git del detalle no se refresca en vivo: los commits hechos fuera de SOJA aparecen al reabrir la task o tras otro cambio.
- `soja start` no hace fetch: `--from origin/main` usa lo último que descargaste. SOJA tampoco hace pull.
- Borrar una branch borra solo la local; la del remoto queda (bórrala desde el PR o con `git push origin --delete <branch>`).
- Los conflictos de merge se resuelven en tu editor; SOJA los lista y permite abortar.
- Los PR requieren la CLI `gh`. El estado de PRs y CI dentro de SOJA queda para v0.6.
- La detección de merges externos no reconoce un *rebase and merge* de GitHub (no deja commit de merge ni conserva los commits de la branch); en ese caso, cierra la task con `x`.
- Las tasks que ya tenían branch antes de esta versión no tienen `branch_start`; para ellas solo cuenta un commit de merge o un squash que las mencione.
- El prefijo `SOJA-` es el mismo para todos los workspaces.
- La búsqueda es por subcadena del título o por ID; no es difusa ni busca en la descripción.
- En modo local no hay autenticación: los developers son registros locales.
- Sin sincronización ni colaboración en tiempo real (fuera de alcance en v0.1).

### Roadmap propuesto

El plan detallado y sus límites están en [`ROADMAP.md`](../ROADMAP.md). Los hitos previstos son v0.2 Git Workflow local, v0.3 backend y colaboración, v0.4 sincronización offline, v0.5 chat asociado a tareas, v0.6 GitHub/PR/CI y v1.0 consolidación. Son propuestas: esta documentación describe lo que **ya funciona** en v0.1.0.

El flujo Git de v0.2 está publicado (ver [§8](#8-flujo-de-trabajo-con-git)). El backend, la sincronización, el chat y GitHub permanecen en hitos posteriores.

**Fuera de alcance hasta nuevo aviso:** interfaz web, mobile, integraciones con WhatsApp o Slack, telemetría, billing.

---

## 16. Versionado y mantenimiento de este documento

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
| 0.2.0 r1 | 0.2.0 | 2026-09-24 | Publicación de v0.2.0: cabecera, estado actual y §8 describen el flujo Git como publicado. |
| 0.1.0 r6 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Detección de merges hechos fuera de SOJA (→ Done), aviso y *Forget branch* para branches borradas sin merge, columna `branch_start` y evento `git_merge_detected` (migración `0002`). |
| 0.1.0 r5 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Operaciones Git desde la task (commit con selección de archivos, push, PR, merge, abort, borrar branch), log en vivo, errores con sugerencias, autenticación delegada; comandos CLI `commit`, `merge`, `branch delete`, `push`, `pr`; columna `base_branch` y 5 eventos nuevos. |
| 0.1.0 r4 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Carpetas padre y selector visual de repositorio (§8), `soja folders`, `project link` por nombre, `parentFolders` en la config (§9). |
| 0.1.0 r3 | 0.1.0 + v0.2 sin publicar | 2026-09-24 | Nueva §8 *Flujo de trabajo con Git* (secciones siguientes renumeradas); `soja start`, `project link/unlink`, estado Git en el detalle, tecla `b` y `r`; tests y decisiones de Git; corregido el separador de §15. |
