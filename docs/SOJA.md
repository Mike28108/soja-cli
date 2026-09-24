# SOJA — Documentación

**Software Operations & Job Assistant**

> No dashboards. No browser. No bullshit. Just work.

| | |
| --- | --- |
| Versión de la app | **0.1.0** |
| Versión del documento | **0.1.0** (revisión 2) |
| Última actualización | 2026-09-24 |
| Autor | Enmauel.biz |
| Repositorio | `soja-cli` |

Este documento describe el estado **actual** de SOJA. Se actualiza en el mismo cambio que modifica la app (ver [Versionado y mantenimiento](#15-versionado-y-mantenimiento-de-este-documento)). El detalle de qué cambió en cada versión está en [`CHANGELOG.md`](../CHANGELOG.md).

---

## Índice

1. [Qué es SOJA](#1-qué-es-soja)
2. [Instalación](#2-instalación)
3. [Primer uso](#3-primer-uso)
4. [Conceptos](#4-conceptos)
5. [La interfaz (TUI)](#5-la-interfaz-tui)
6. [Atajos de teclado](#6-atajos-de-teclado)
7. [CLI no interactiva](#7-cli-no-interactiva)
8. [Configuración y datos locales](#8-configuración-y-datos-locales)
9. [Modelo de datos](#9-modelo-de-datos)
10. [Arquitectura](#10-arquitectura)
11. [Decisiones técnicas](#11-decisiones-técnicas)
12. [Guía de desarrollo](#12-guía-de-desarrollo)
13. [Testing](#13-testing)
14. [Limitaciones conocidas y roadmap](#14-limitaciones-conocidas-y-roadmap)
15. [Versionado y mantenimiento de este documento](#15-versionado-y-mantenimiento-de-este-documento)

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

### Estado actual (v0.1.0)

Local-first. Todo vive en un archivo SQLite en la máquina del developer y no hay backend ni sincronización. La arquitectura ya está preparada para un futuro `soja-backend` (ver [§10.4](#104-evolución-hacia-modo-remoto)).

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

Los proyectos también guardan `repository_path` y `repository_url`, pensados para la futura integración con Git.

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

Tipos de evento: `task_created`, `task_updated` (título, descripción, tipo o requester), `status_changed`, `assigned`, `unassigned`, `priority_changed`, `project_changed`, `comment_added`, `task_completed`, `task_reopened`.

### Branch sugerida

Cada task muestra la branch que generaría el futuro `soja start`: `<prefijo>/SOJA-<n>-<slug-del-título>`, por ejemplo `fix/SOJA-342-fix-stripe-webhook-duplicate-events`.

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
- **Campos:** Project, Assignee, Requested by y Branch (o la branch sugerida).
- **Descripción:** hasta 6 líneas, según la altura disponible.
- **ACTIVITY:** el timeline con hora, actor y evento. Los comentarios se marcan con `›` y ocupan hasta 3 líneas. Arranca mostrando lo más reciente; `k` sube a lo anterior y `j` baja a lo más nuevo.

### Proyectos

- Lista con KEY, nombre y contadores (activas, en progreso, review, bloqueadas).
- `enter` abre la vista de proyecto: la misma lista de tasks, acotada al proyecto, con descripción, stats y ruta del repositorio si existe.
- `n` crea un proyecto en dos pasos: nombre y luego key, con una sugerencia editable.

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

New task, My Tasks, All Tasks, Todo, In Progress, Review, Blocked, Done, Search, Projects, Switch project, New project, Switch workspace, Workspaces, New workspace, Add developer, Help, Quit.

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
| `n` | Nueva task (dentro de un proyecto, la crea en ese proyecto) |
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
| `j` / `k` | Desplazar el timeline |

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
soja task start <id>      # te la asigna y la pasa a In Progress
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

Si no se indica título y la terminal es interactiva, SOJA lo pregunta.

Formatos de ID aceptados: `SOJA-12`, `soja-12`, `#12` o `12`.

Alias de subcomandos: `task` = `tasks` = `t`; `list` = `ls`; `create` = `new` = `add`; `show` = `view`.

### Proyectos

```bash
soja project list
soja project create <nombre…> [--key <KEY>] [--description <texto>] [--repo-path <dir>] [--repo-url <url>]
```

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
soja task start SOJA-12 && soja task done SOJA-12
soja task list | grep URGENT
```

---

## 8. Configuración y datos locales

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
  "workspaceId": "<uuid del workspace activo>"
}
```

- Se valida con zod al cargar. Si el JSON está roto o la forma es inesperada, SOJA muestra un error claro y sugiere cómo arreglarlo.
- `"mode": "remote"` se reconoce, pero se rechaza con el mensaje *"Remote mode is not available in this version of SOJA"*. Queda reservado para el futuro (`{ "mode": "remote", "apiUrl": "…" }`).
- Si el workspace activo desaparece, SOJA cambia automáticamente a otro workspace del usuario. Si el usuario desaparece (por ejemplo, tras un reset), vuelve a ejecutar el setup.

### Variables de entorno

| Variable | Efecto |
| --- | --- |
| `SOJA_DEBUG=1` | Muestra stack traces y la cadena de causas de los errores |
| `NO_COLOR` / `FORCE_COLOR` | Control de color de la CLI |
| `XDG_DATA_HOME`, `XDG_CONFIG_HOME` | Ubicación de los datos (útil para aislar pruebas) |

---

## 9. Modelo de datos

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
| repository_path | text | nullable |
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
| branch | text | nullable |
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
| type | text | CHECK con los 10 tipos de evento |
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

---

## 10. Arquitectura

### 10.1 Repositorios del producto

SOJA son **dos repositorios Git independientes**, sin monorepo:

```text
soja-cli      ← este repositorio: TUI, CLI, datos locales, futuro cliente remoto
soja-backend  ← futuro: auth, usuarios, workspaces, permisos, API, realtime
```

El cliente **nunca** se conectará directamente a PostgreSQL. El camino será `soja-cli → SOJA API → PostgreSQL/Supabase`.

### 10.2 Capas

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
```

- `domain/` contiene tipos y reglas puras (enums, workflow de estados, nombres, errores). No depende de nada.
- `bootstrap.ts` es la **raíz de composición**: el único archivo que sabe que los repositorios son locales.
- La CLI y la TUI llaman a los mismos métodos. Por ejemplo, `soja task done` y la tecla `x` terminan en `TaskService.complete`.

### 10.3 Estructura de carpetas

```text
src/
├── cli/            index.tsx (entrada, bin), output.ts, runtime.ts
│   └── commands/   task, project, workspace, dev, info, tui, args
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
├── application/    services/, filters.ts, timeline.ts, validation.ts, types.ts
├── domain/         task.ts, workflow.ts, activity.ts, entities.ts, naming.ts, errors.ts
├── data/           repositories.ts, local/
├── database/       schema.ts, client.ts, migrate.ts, migrations/
├── config/         paths.ts (XDG), config.ts (zod), version.ts
├── dev/            seed.ts
├── utils/          errors.ts, text.ts, time.ts
└── bootstrap.ts
test/               domain/, application/, config/, data/, ui/, helpers.ts
```

### 10.4 Evolución hacia modo remoto

**Problema arquitectónico conocido.** Hoy `TaskService` es dueño de reglas que, con varios usuarios, debe imponer el servidor: la numeración de tasks, el registro de actividad y la validación de membresías. Un `RemoteTaskRepository` que solo replicara el CRUD actual duplicaría esas reglas en el cliente y confiaría en que cada cliente escriba la actividad honestamente.

**Camino recomendado:**

1. `soja-backend` expone una API por comandos: crear task, aplicar cambios, comentar, completar. El servidor asigna los números y escribe la actividad.
2. `data/remote/` implementa los repositorios contra esa API. Las operaciones con reglas se delegan al backend, que devuelve la entidad actualizada.
3. `bootstrap.ts` elige la implementación según `config.mode`.
4. La UI y la CLI no cambian: solo dependen de los servicios.

---

## 11. Decisiones técnicas

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

---

## 12. Guía de desarrollo

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
4. Actualiza la [§9 Modelo de datos](#9-modelo-de-datos) de este documento.

Las migraciones se aplican automáticamente, en una transacción, al abrir SOJA.

### Agregar una funcionalidad (receta)

1. **Dominio:** tipos o reglas puras en `src/domain/`, con sus tests.
2. **Servicio:** el método en `src/application/services/`, con validación zod y actividad si modifica una task. Añade tests en `test/application/`.
3. **Repositorio**, si hace falta un acceso nuevo: primero la interfaz en `data/repositories.ts`, luego la implementación en `data/local/`.
4. **UI:** pantallas y overlays llaman al servicio a través de `useAppState().services`. Las mutaciones van por `run()`, que refresca los datos y muestra la confirmación o el error.
5. **CLI**, si corresponde: el comando en `src/cli/commands/`.
6. **Documentación:** actualiza este archivo y `CHANGELOG.md` (ver [§15](#15-versionado-y-mantenimiento-de-este-documento)).

### Reglas de código

- TypeScript estricto y ESM. Nada de `any`.
- Nada de SQL ni repositorios en componentes.
- Nada de colores sueltos: todos salen de `ui/theme/theme.ts`.
- La identidad (nombre, slogan, ASCII) sale solo de `ui/branding/brand.ts`.
- La versión sale de `package.json`.
- Los errores para el usuario son `SojaError` (o sus subclases), con `message` y un `hint` opcional. Cualquier otro error se considera un bug y se muestra como *"Something went wrong"*.

---

## 13. Testing

Vitest + ink-testing-library. Se prueba **comportamiento**, no píxeles.

| Área | Archivo | Cubre |
| --- | --- | --- |
| Dominio | `test/domain/task.test.ts` | Referencias `SOJA-n`, branch sugerida, orden por urgencia, conteos, keys de proyecto y slugs |
| Workflow | `test/domain/workflow.test.ts` | Transiciones de estado y sus fechas |
| Setup y workspaces | `test/application/session.test.ts` | Primer setup, reutilización, validación, cambio de workspace, miembros |
| Proyectos | `test/application/projects.test.ts` | Keys únicos, duplicados, `resolve`, contadores |
| Tasks | `test/application/tasks.test.ts` | Creación, edición y actividad, transiciones, comentarios y timeline, filtros, búsqueda (con `%` y `_` escapados), aislamiento entre workspaces, requesters |
| Configuración | `test/config/config.test.ts` | Rutas XDG, lectura y escritura, JSON inválido, modo remoto |
| Persistencia | `test/data/persistence.test.ts` | Cerrar y reabrir sobre un archivo SQLite real |
| UI (lógica) | `test/ui/input.test.ts`, `test/ui/layout.test.ts` | Edición de texto, navegación de listas, dispatcher, columnas responsive, pila de navegación, helpers de texto y tiempo |
| UI (flujos) | `test/ui/app.test.tsx` | Setup completo, abrir task, cambiar estado, crear task, comentar, buscar, filtros y palette, comportamiento de `esc` |

Los tests usan SQLite en memoria y un reloj determinista (`test/helpers.ts`). Estado en v0.1.0: **73 tests en verde**.

---

## 14. Limitaciones conocidas y roadmap

### Limitaciones (v0.1.0)

- La descripción se edita en una sola línea dentro de la TUI; no hay integración con `$EDITOR`.
- No se pueden borrar tasks ni proyectos, ni editar proyectos después de crearlos.
- La CLI no tiene comando para comentar (la TUI sí).
- El prefijo `SOJA-` es el mismo para todos los workspaces.
- La búsqueda es por subcadena del título o por ID; no es difusa ni busca en la descripción.
- En modo local no hay autenticación: los developers son registros locales.
- Sin sincronización ni colaboración en tiempo real (fuera de alcance en v0.1).

### Roadmap propuesto

El plan detallado y sus límites están en [`ROADMAP.md`](../ROADMAP.md). Los hitos previstos son v0.2 Git Workflow local, v0.3 backend y colaboración, v0.4 sincronización offline, v0.5 chat asociado a tareas, v0.6 GitHub/PR/CI y v1.0 consolidación. Son propuestas: esta documentación describe lo que **ya funciona** en v0.1.0.

Para v0.2, `soja task start <id>` ya asigna y pasa a In Progress. El nuevo `soja start <id>` agregará el flujo de branch Git local y seguirá funcionando sin internet. El backend, la sincronización, el chat y GitHub permanecen en hitos posteriores.

**Fuera de alcance hasta nuevo aviso:** interfaz web, mobile, integraciones con WhatsApp o Slack, telemetría, billing.
---

## 15. Versionado y mantenimiento de este documento

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
