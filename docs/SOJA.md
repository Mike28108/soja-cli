# SOJA — Documentación

**Software Operations & Job Assistant**

> No dashboards. No browser. No bullshit. Just work.

| | |
| --- | --- |
| Versión de la app | **1.4.0** |
| Versión del documento | **1.4.0** (revisión 4) |
| Última actualización | 2026-09-25 |
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

### Estado actual (v1.4.0)

Dos modos. **Local** (predeterminado): todo vive en SQLite en tu máquina, sin cuenta ni servidor. **Remoto**: un equipo comparte workspaces, proyectos y tasks a través de `soja-backend`, con login de GitHub, trabajo sin conexión y **chat del equipo en tiempo real** (ver [§9](#9-modo-remoto-equipo)). En ambos, el flujo Git de v0.2 (ver [§8](#8-flujo-de-trabajo-con-git)) funciona en tu máquina, y con la CLI `gh` SOJA muestra y mergea los pull requests de GitHub con su CI (v0.6). La v1.0 consolida todo: archivar y borrar tasks, llevar el trabajo local al equipo (`soja import-local`), editar proyectos y canales, `$EDITOR`, copias diarias, instalación y actualización desde GitHub Releases, y CI con pruebas de extremo a extremo.

El chat requiere `soja-backend` ≥ 0.3.0. El acceso online requiere aprobación de cuenta en `soja-backend` ≥ 1.1.0; las cuentas nuevas quedan en modo local hasta su aprobación.

---

## 2. Instalación

### Requisitos

- **Node.js 24 o superior**: SOJA usa el módulo nativo `node:sqlite`.
- npm 10 o superior.
- Una terminal con soporte Unicode. Se recomiendan terminales modernas (kitty, WezTerm, iTerm2, Alacritty, GNOME Terminal…).

### Instalar (recomendado)

Cada versión estable se distribuye desde npm:

```bash
npm install --global soja-cli
soja
```

**Actualizar:** `soja update` descarga e instala la última versión de npm (pide confirmación); `soja update --check` solo avisa. SOJA también avisa de versiones nuevas al abrir la interfaz y en `soja --version`, consultando npm como mucho una vez al día. Tus datos y tu configuración no se tocan.

**Cuenta y privacidad:** `soja account delete` revoca tus sesiones y anonimiza tu autoría en contenido compartido. Si eres la única persona propietaria de un workspace, transfiere primero la propiedad. Consulta [el aviso de privacidad](PRIVACY.md) y [la licencia propietaria](../LICENSE).

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

Al ejecutar `soja` por primera vez (cuando no existe sesión):

1. Aparece el **splash** con la identidad de SOJA.
2. Elige **Sign in with GitHub** para acceder a un equipo o **Local mode** para trabajar solo en esta máquina. Modo Local no habilita chat ni datos compartidos.
3. En modo local se hacen tres preguntas:
   - **What's your name?**: tu nombre visible.
   - **Username**: se sugiere a partir del nombre y se puede editar. Minúsculas, números, `.`, `-` o `_`; máximo 32 caracteres.
   - **Workspace name**: por ejemplo, *Bravos Development*.
4. SOJA crea el usuario, el workspace y la membresía (rol `owner`), guarda la configuración y entra directo a **My Work**.

En modo remoto, GitHub es el único proveedor. Una cuenta nueva completa nombre, fecha de nacimiento, país y una carta de interés de hasta 100 caracteres. Mientras espera aprobación, SOJA mantiene el modo local y no descarga workspaces. Una cuenta aprobada entra a su único workspace, elige uno si tiene varios o puede crear el primero. `A` abre las solicitudes pendientes para el CEO; los comandos equivalentes están en `soja access`.

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

### Archivar y borrar

- **Archivar** saca la task de todas las listas y contadores sin perder nada: sigue apareciendo en la búsqueda (`/`, marcada *archived*), en *Archived tasks* (palette) y con `soja task list --archived`. Se restaura igual. Queda en el timeline (`task_archived`, `task_unarchived`) y, en equipo, se sincroniza como cualquier cambio, también sin conexión.
- **Borrar** es definitivo: la task se va con sus comentarios y su timeline, para todo el equipo. Solo los **owners** del workspace pueden hacerlo, y SOJA pide dos confirmaciones (en la CLI, escribir el ID). Su número no se vuelve a usar. En equipo, si el servidor rechaza el borrado (por ejemplo, ya no eres owner), la task vuelve con un aviso.

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

La interfaz se organiza como una aplicación de escritorio (v1.1):

```text
 SOJA▁  Bravos Development › SOJA-12              ✉ 3 @1  ⇄ server · synced  @michael  v1.1.0   ← barra de título
                          ╭─ SOJA-12 · Bug ─────────────────── created 10:59 · updated 2h ago ─╮
 TASKS                    │ Receipt upload not rendering after payment                          │
 ▌My work              5  │  ◐ In Progress   ▰▰▰▰ URGENT                                        │
  All open            12  │ ╭─ Details ─────────────────╮ ╭─ Description ───────────── d edit ─╮ │
  …                       │ │ Project       EnrollBridge │ │ Parents upload the receipt, …      │ │
 CHAT                     │ ╰────────────────────────────╯ ╰────────────────────────────────────╯ │
  #general             3  │ ╭─ Activity ──────────────────────────────────────────────────────╮ │
 PROJECTS                 │ │ 10:59  @michael  › Reproduced on staging …                      │ │
  EnrollBridge         3  │ ╰─────────────────────────────────────────────────────────────────╯ │
                          ╰─────────────────────────────────────────────────────────────────────╯
 TASK   s  status   p  priority   a  assign   c  comment   e  edit   g  git   esc  back     local   ← atajos y estado
 ▄█▀▀▀▀▀▀  ▄█▀▀▀▀█▄        ██  ▄█▀▀▀▀█▄
  ▀▀▀▀▀█▄  ██    ██        ██  ██▄▄▄▄██  No dashboards. No browser. No bullshit. Just work.
 ▄▄▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ██    ██  ▄▄▄ ← marca fija
```

- **Barra de título** con fondo: marca, workspace y dónde estás; a la derecha, mensajes sin leer, estado de la conexión en modo remoto y tu usuario.
- **Barra lateral** (terminales de 110 columnas o más): las vistas de tasks con sus contadores, los canales del chat con no leídos y menciones, y los proyectos. Todo es clicable.
- **Panel principal** con bordes redondeados y el título en el borde; dentro, sub-paneles (Details, Description, Activity…).
- **Footer**: queda separado del panel por una fila de aire. Muestra una fila con la pastilla de modo (`TASKS`, `TASK`, `SELECT`, `CONFIRM`…), los atajos activos dibujados como teclas y el estado local/remoto; tras otra fila de aire, aparece el wordmark ASCII original de tres líneas (el del splash) junto al eslogan. En terminales estrechas, el eslogan se apila debajo del wordmark.
- **Ventanas flotantes** (selectores, formularios, confirmaciones, Git) sobre la pantalla, que sigue visible detrás; un clic fuera las cierra, como `esc`.
- **Avisos** (*toasts*) abajo a la derecha: la confirmación o el error de la última acción durante unos segundos.
- Las pantallas anteriores permanecen montadas: al volver con `esc` conservas la selección que tenías.
- En terminales pequeñas se pliega: sin barra lateral, sin vista previa, el estado se reduce a su glifo, y el detalle apila los paneles (la descripción se oculta si no cabe; `d` la edita igual).

### Mascotas animadas

Las escenas ASCII de `ink-agent-scenes` se muestran al pie del panel principal cuando la terminal tiene al menos 80 columnas y suficiente altura; en terminales menores se ocultan para mantener visible el trabajo. En el detalle, la escena refleja el estado de la task (trabajo, revisión, bloqueo, urgencia, finalización o descanso); mientras carga se usa `clockIn` y ante un error `bugHunt`. En las listas de tasks, refleja la sincronización, una lista vacía, urgencias/bloqueos, revisión, trabajo, limpieza de tareas cerradas o descanso. La escena `syncing` toma prioridad mientras se sincroniza. Las animaciones van a 4 FPS y se pausan en pantallas ocultas; son decorativas y no capturan el teclado.

### Actualizaciones remotas sin saltos

Al terminar una sincronización, SOJA compara qué entidades cambiaron en la réplica. Si no cambió ningún dato, no vuelve a ejecutar las consultas de las pantallas. Si cambiaron tasks, actualiza sus detalles y las listas, contadores y resúmenes de proyecto que dependen de tasks; los cambios de proyectos, miembros o chat refrescan únicamente sus vistas relacionadas. La selección de la task en una lista se conserva si sigue disponible. El detalle usa la identidad interna de la task para permanecer abierto aunque una task provisional reciba su número definitivo. El estado de conexión del footer y la escena de sincronización siguen mostrando el progreso del ciclo.

### Colores y tema

SOJA usa su propia paleta en truecolor (verdes soja, grises cálidos) con una variante **oscura** y otra **clara**. Al abrir, elige según `SOJA_THEME` (`dark` o `light`), luego `COLORFGBG`, y si no, pregunta a la terminal su color de fondo (OSC 11, lo responden kitty, WezTerm, iTerm2, GNOME Terminal, Alacritty, Windows Terminal…); si nadie responde, oscura. En terminales de 256 o 16 colores se degrada sola. Los colores tienen significado: ámbar en progreso, azul review, rojo bloqueado o urgente, verde hecho, violeta PR mergeado.

### Mouse

El teclado sigue siendo lo principal, pero todo responde también al mouse:

- **Clic** en una fila la selecciona; otro clic la abre. Funciona en listas de tasks, proyectos, workspaces, mensajes del chat y opciones de los selectores.
- **Clic** en pestañas, en la barra lateral, en botones de las ventanas y en los campos del detalle (estado, prioridad, proyecto, assignee, requester, branch, PR, descripción) abre lo que los cambia.
- **Rueda** para desplazar listas, el timeline y el chat.
- **Clic fuera** de una ventana la cierra.
- Para **seleccionar texto** y copiarlo, mantén `Shift` mientras arrastras (en la mayoría de terminales), o apaga el mouse.
- **Apagar y encender el mouse** sin reiniciar: `M`, clic en el interruptor `M ● mouse on` al final de la barra de estado, *Mouse off* en la command palette o `soja mouse off` desde la shell. Con el mouse apagado la terminal selecciona y copia texto como siempre y SOJA se usa solo con el teclado; el interruptor muestra `○ mouse off` y `M` lo vuelve a encender. La elección se guarda en `config.json` (`mouse`) y se conserva al reabrir SOJA.

### Splash

Al abrir: wordmark de 3 líneas hecho con medios bloques, gradiente verde soja y un cursor `▄▄▄` parpadeante, centrado, con un spinner mientras carga. Dura 700 ms y cualquier tecla lo salta. La primera vez, el **asistente de configuración** es una tarjeta tipo instalador: pasos numerados, la pregunta actual con su campo, progreso y botones *Back* / *Next*.

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
- `e` edita el proyecto: nombre, descripción, URL del repositorio y carpeta vinculada. La key no cambia (la usan personas y scripts). En equipo, editar requiere conexión.
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

- **Lista de canales** a la izquierda en terminales de 100 columnas o más, con los no leídos (`1`) o las menciones (`@1`). `Ctrl+G` abre el selector de canales desde cualquier foco del chat; en terminales estrechas, `#` desde la lista de mensajes también lo abre.
- **Campo de escritura** abajo, siempre activo al entrar: `enter` envía y `alt+enter` añade una línea. Pegar texto de varias líneas conserva los saltos. `@` + `tab` completa el nombre de un miembro.
- **`tab`** (o `↑` con el campo vacío) pasa a la lista de mensajes, donde `j`/`k` seleccionan y cada tecla actúa sobre el mensaje seleccionado (ver [§6](#6-atajos-de-teclado)). Subir más allá del primer mensaje trae los anteriores del servidor.
- **Estados de un mensaje:** `⋯` pendiente de envío, `(edited)`, *message deleted*. Los que te mencionan se resaltan en amarillo. Una respuesta muestra arriba la cita (`↳ @autor: …`).
- **Leído:** abrir un canal lo marca como leído en todas tus máquinas. El header muestra `✉ 3 · @1` (no leídos · menciones) en las demás pantallas.
- **Crear una task desde un mensaje** (`t`): el título es la primera línea, la descripción cita el mensaje con su autor y canal, el requester es el autor, y SOJA responde en el canal con `→ SOJA-n título`. Funciona sin conexión: la respuesta sale con el número real (`SOJA-42`, no `SOJA-?1`).
- **Canales nuevos:** pulsa `Ctrl+G`, escribe un nombre que no exista y elige *Create #nombre* (requiere conexión). `#general` ya existe por defecto en cada workspace, así que al escribir `general` el selector muestra el canal existente para abrirlo en vez de ofrecer un duplicado. El mismo selector cambia el **tema** del canal actual y lo **archiva** o restaura (owners; `#general` no se archiva).
- Si el servidor rechaza un mensaje (por ejemplo, porque archivaron el canal mientras estabas sin conexión), aparece un aviso sobre el campo de escritura; `!` en la lista de mensajes ofrece **devolverte el texto** al campo o descartar el aviso.

### Ventanas (overlays)

Flotan centradas sobre la pantalla actual, con fondo propio y el título en el borde.

| Ventana | Qué hace |
| --- | --- |
| **Picker** | Lista con `j/k`, `enter`, números `1–9` o clic. En las listas largas (assignee, proyecto, workspace, comandos) se filtra escribiendo en el campo de arriba; las flechas navegan. `✓` marca el valor actual. |
| **Confirmación** | La pregunta, lo que va a pasar y dos botones: *Cancel* (por defecto) y la acción, en rojo si borra algo. `←/→` o `tab` eligen, `enter` confirma lo elegido, `y`/`n` responden directo. |
| **Prompt** | Campo de texto de una línea. Autocompleta con `tab` cuando hay sugerencias (por ejemplo, requesters). |
| **Nueva task** | Formulario: Title, Project, Type, Priority, Assignee y Requested by, con campos rellenos y selectores `‹ valor ›`. `tab`/`↓` cambian de campo, `←/→` (o un clic) cambian el valor, y `enter` crea desde cualquier campo; también los botones *Cancel* / *Create task*. |
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
| `M` | Apagar / encender el mouse (se recuerda) |
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
| `d` | Descripción en tu editor (`$VISUAL`, `$EDITOR` o `vi`): SOJA se aparta mientras editas y guarda al salir; si el editor sale con error, no cambia nada. *Description, one line* en el menú Edit la edita sin salir |
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
| `e` | Editar nombre, descripción o URL |

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
soja task comment <id> [texto|-]    # sin texto abre $EDITOR; - lee stdin
soja task describe <id> [texto|-]   # reemplaza la descripción; sin texto la edita en $EDITOR
soja task archive <id>    # fuera de las listas; soja task list --archived las muestra
soja task restore <id>
soja task delete <id> [--yes]   # definitivo, solo owners; pide escribir el ID
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
soja project edit <key> [--name <n>] [--description <d>] [--url <u>]   # "" borra descripción o URL
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
soja login [--server <url>]        # usa el backend oficial por defecto; --server permite otro
soja access status                 # estado de aprobación y badge CEO si aplica
soja access request                # completar/actualizar perfil y carta (máximo 100 caracteres)
soja access approvals              # lista de solicitudes (CEO)
soja access approve <id>           # aprobar solicitud (CEO)
soja access reject <id>            # rechazar solicitud (CEO)
soja logout
soja mouse [on|off]                # muestra o cambia si la interfaz usa el mouse (también `M` dentro)
soja mode [local|remote]
soja whoami
soja workspace create <nombre>     # en ambos modos; te deja como owner y la activa
soja workspace add <username>      # agrega un developer al workspace activo
soja sync [--dismiss]              # sincroniza ahora y muestra conflictos y rechazos
```

Ver [§9](#9-modo-remoto-equipo).

Una sesión GitHub pendiente o rechazada no habilita el modo remoto. En esta primera etapa el acceso al servidor oficial es solo por solicitud: se revisa en unas 24–48 h y se aprueba si encaja con la etapa del proyecto. Para nuevas cuentas, `soja login` solicita nombre, fecha de nacimiento, país (búsqueda por texto y selección de resultado) y una carta de interés. Hasta aprobarse, se conserva el trabajo local y las peticiones de workspace/chat no están disponibles. Cada aprobación debe ir seguida de la selección de workspace; una cuenta sin membresías no obtiene acceso por el hecho de ser aprobada.

### Chat

```bash
soja chat [#canal]                     # abre la interfaz en el chat (en ese canal)
soja chat send '#general' "Deploy listo"   # envía; en cola si no hay conexión
echo "Build roto en main" | soja chat send ci -   # `-` lee el mensaje de stdin (scripts, hooks)
soja chat log [#canal] [-n 20]         # últimos mensajes (no los marca como leídos)
soja chat channels                     # canales con no leídos y menciones
soja chat new <nombre> [--topic "…"]  # crea un canal (requiere conexión)
soja chat topic <canal> "texto"        # cambia el tema (vacío lo borra)
soja chat archive|unarchive <canal>    # owners; #general no se archiva
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
soja login                              # backend oficial: https://soja-backend-production.up.railway.app
soja login --server https://otro-servidor # servidor alternativo explícito
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

### Llevar tu trabajo local al equipo

Si usaste SOJA en modo local antes de unirte a un servidor, `soja import-local` sube ese historial al workspace activo del servidor (tras `soja login` SOJA lo sugiere):

```bash
soja import-local                 # muestra qué subirá y pide confirmación
soja import-local --from bravos   # otro workspace local (por slug)
soja import-local --yes           # sin preguntar
```

- Sube **proyectos, tasks (también archivadas), comentarios y timeline**, con sus fechas. Tu base local solo se lee: no cambia.
- **Números:** si el workspace del servidor no tiene tasks, se conservan (`SOJA-12` sigue siendo `SOJA-12`, y tus commits `(SOJA-12)` siguen apuntando bien). Si ya tiene, continúan tras la última y SOJA muestra la equivalencia (`SOJA-3 → SOJA-15`).
- **Developers** se asocian por username con los miembros del workspace. Los que no son miembros se listan: su trabajo queda a tu nombre y sus asignaciones vacías (agrégalos antes con `soja workspace add` si quieres conservarlas).
- Un proyecto con el mismo nombre que uno del servidor se reutiliza. Las carpetas de repositorio vinculadas en esta máquina se conservan.
- Es **todo o nada** y no duplica: importar otra vez lo mismo no cambia nada. Solo owners del workspace. Requiere `soja-backend` ≥ 1.0.

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
- **Refresco selectivo:** si una sincronización no trae ni aplica cambios, las consultas de las pantallas no se repiten. Cuando cambia una task se actualizan sus datos, las listas y sus contadores; los cambios de chat, proyectos y miembros refrescan sus propias vistas. Una task nueva pasa de `SOJA-?1` a su número real en segundos si hay conexión, sin reconstruir toda la interfaz.
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
| Copias de la base de datos | `$XDG_DATA_HOME/soja/backups/` | `~/.local/share/soja/backups/` |
| Última consulta de versiones | `$XDG_DATA_HOME/soja/update-check.json` | `~/.local/share/soja/update-check.json` |

### Copias de seguridad

SOJA copia la base de datos que estás usando (la local, o en modo remoto la réplica, con los cambios que aún esperan enviarse) **una vez al día al abrir la interfaz**, y guarda las últimas 7. La copia es consistente aunque SOJA esté en uso (`VACUUM INTO` de SQLite).

```bash
soja backup                     # una copia ahora
soja backup list                # copias de la base de datos del modo actual, la más nueva primero
soja backup restore <nombre>    # la pone en su lugar; antes guarda el estado actual (before-restore)
```

Restaura con SOJA cerrado. En modo remoto, restaurar la réplica solo recupera cambios pendientes: la siguiente sincronización trae lo que tiene el servidor.

Las variables XDG que no son rutas absolutas se ignoran. La base de datos usa modo WAL, así que junto a ella aparecen los archivos `soja.db-wal` y `soja.db-shm`.

### `config.json`

```json
{
  "mode": "local",
  "userId": "<uuid>",
  "workspaceId": "<uuid del workspace activo>",
  "parentFolders": ["/home/tu-usuario/workspace/products", "/home/tu-usuario/workspace/services"],
  "mouse": true,
  "remote": {
    "apiUrl": "https://tu-servidor-soja",
    "userId": "<uuid de tu usuario en el servidor>",
    "workspaceId": "<uuid del workspace activo en el servidor>"
  }
}
```

- Se valida con zod al cargar. Si el JSON está roto o la forma es inesperada, SOJA muestra un error claro y sugiere cómo arreglarlo.
- `parentFolders` (opcional, por defecto `[]`): carpetas que contienen tus repositorios (ver [§8](#8-flujo-de-trabajo-con-git)). Los `config.json` de v0.1, que no tienen este campo, siguen funcionando. Cambiar de workspace conserva la lista.
- `mouse` (opcional, por defecto encendido): si la interfaz usa el mouse en esta máquina. Lo cambian `M`, el interruptor de la barra de estado y `soja mouse on|off`. `SOJA_MOUSE=0` lo apaga para esa ejecución aunque aquí diga `true`.
- `mode` elige de dónde salen los datos: `local` (SQLite, `userId`/`workspaceId`) o `remote` (bloque `remote`). Ambos bloques conviven; `soja mode` cambia entre ellos.
- `remote` lo escribe `soja login`. El token **no** está aquí sino en `credentials.json`. `remote.imports` recuerda las importaciones hechas con `soja import-local` desde esta máquina, para avisar antes de repetirlas.
- Si el workspace activo desaparece, SOJA cambia automáticamente a otro workspace del usuario. Si el usuario desaparece (por ejemplo, tras un reset), vuelve a ejecutar el setup.

### Variables de entorno

| Variable | Efecto |
| --- | --- |
| `SOJA_DEBUG=1` | Muestra stack traces y la cadena de causas de los errores |
| `SOJA_THEME=light` / `dark` | Fuerza la paleta clara u oscura (por defecto se detecta del fondo de la terminal) |
| `SOJA_MOUSE=0` | Arranca la interfaz con el mouse apagado, sin cambiar la preferencia guardada (`M` lo enciende) |
| `VISUAL`, `EDITOR` | Editor para descripciones y comentarios largos (`d`, `soja task describe/comment`); por defecto `vi` |
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
| last_deleted_number | integer | Número más alto de una task borrada; los números nunca se reutilizan (los commits viejos siguen apuntando a su task) |
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
| archived_at | integer | nullable. Archivada: fuera de las listas y de los contadores, visible en la búsqueda |

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
| `task_archived`, `task_unarchived` | `{}` |
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
├── ui/             App.tsx (arranque), Shell.tsx (marco de la app: barras, barra lateral, pantallas, ventanas, avisos),
│   │               app-state.tsx (sesión, navegación, overlays, avisos), copy.ts
│   ├── branding/   brand.ts (única fuente de la identidad), Logo, CompactLogo, Splash
│   ├── theme/      theme.ts (paleta clara/oscura, tonos, glifos), detect.ts (fondo de la terminal)
│   ├── chrome/     TopBar, StatusBar, Sidebar, Toast, context (atajos de la barra de estado, pantalla activa)
│   ├── kit/        Panel, Badge, Keycap, Tabs, Button, Clickable, ScrollBar, Gauge, Spinner
│   ├── mascot/     Escenas ASCII animadas, motor de cuadros y selección por estado de task/vista
│   ├── screens/    Setup, TaskList, Task, Projects, Workspaces, Chat, Help, ScreenFrame
│   ├── overlays/   Picker, Confirm, Prompt, Search, NewTask, Commit, GitRun, GitLog, OverlayFrame, options, types
│   ├── components/ TaskTable, TextInput, TextField, Labels, PullRequestLabel, ConsoleLines, EmptyState, task-columns
│   ├── hooks/      use-query, use-list, use-layout, use-measure, use-terminal-size, use-task-actions, use-flows, use-commands
│   ├── input/      dispatcher (capas de teclado), KeyProvider (teclado + mouse), mouse (SGR, regiones clicables), text-editing, list-navigation
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

### Interfaz tipo aplicación (v1.1)

- **Componentes propios en `ui/kit/`, con InkUI como referencia.** InkUI (shadcn para Ink) inspiró los patrones (paneles con título en el borde, pestañas, *toasts*, spinners, medidores), pero no se usa como dependencia: sus componentes leen el teclado con `useInput` por su cuenta y saltarían el despachador por capas (el que evita que una letra dispare dos atajos a la vez), y traen su propio sistema de colores, mientras SOJA exige que colores y glifos salgan solo de `theme.ts`.
- **Mouse sin librerías:** la terminal envía reportes SGR (`ESC [ < b ; x ; y M`), que Ink entrega a `useInput`; `KeyProvider` los reconoce antes que cualquier atajo, y cada elemento clicable calcula su posición sumando el layout de Yoga hasta la raíz. Las regiones van por capas como el teclado: una ventana abierta captura los clics antes que la pantalla de abajo, y gana la región más pequeña bajo el puntero. Al pasar la terminal a otro programa (editor, Git pidiendo credenciales) el mouse se apaga y se vuelve a encender.
- **Medición propia (`useMeasure`):** `useBoxMetrics` de Ink 7.1 vuelve a renderizar en cada *commit* aunque nada cambie, y con muchos paneles entraba en un bucle; `useMeasure` solo actualiza si el tamaño cambió. Un único listener de tamaño de terminal (`TerminalSizeProvider`) sustituye a los de cada panel.
- **Paneles que recortan, nunca comprimen:** el contenido de un panel conserva su altura natural y se recorta dentro del borde; Yoga, si no, reduce filas a altura 0 y se dibujan unas sobre otras.
- **Refresco selectivo:** `SyncReport` enumera las entidades realmente modificadas; las consultas declaran los temas de datos de los que dependen y solo esos temas se invalidan al sincronizar. El contador de revisión global queda para las mutaciones locales existentes.
- **Mascotas locales:** las escenas y el motor incluidos desde `ink-agent-scenes.zip` viven en `ui/mascot/`; el adaptador usa los tonos de `theme.ts`, pausa las pantallas ocultas y reserva altura solo en terminales amplias.
- **Footer persistente:** el modo y los atajos ocupan la primera fila; el wordmark ASCII del splash y el eslogan ocupan las siguientes. `use-layout.ts` calcula la altura y si van en línea o apilados según el ancho para que el panel principal y la barra lateral no queden debajo del footer.

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
| `npm run test:e2e` | Suite de extremo a extremo: `soja-backend` real (su `test/e2e/server.ts`, con login simulado) + PostgreSQL + la CLI de dos developers. Necesita `DATABASE_URL` (una base local vacía) y `SOJA_BACKEND_DIR` (por defecto `../../services/soja-backend`) |
| `npm run check:domain` | Compara `src/domain/{task,workflow,naming,activity}.ts` con los de `soja-backend`: deben ser idénticos |

### Integración continua

GitHub Actions (`.github/workflows/`):

- **ci.yml**, en cada push a `main` y en cada PR: `check` (lint, tests, build); `domain` (los archivos de dominio compartidos coinciden con `soja-backend`); `e2e` (la suite de extremo a extremo con PostgreSQL). `domain` y `e2e` leen el repositorio privado del backend y necesitan el secret **`SOJA_REPOS_TOKEN`** (un token *fine-grained* con lectura de contenidos de `soja-backend`); sin él fallan explicando qué falta.
- **release.yml**, al subir un tag `vX.Y.Z`: verifica, construye, empaqueta (`npm pack`) y publica el release de GitHub con el paquete y las notas del CHANGELOG.

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
| Interfaz y mouse | `test/ui/mouse.test.tsx`, `test/ui/mouse-input.test.ts` | Clic para seleccionar y abrir, pestañas, rueda, cambiar un campo del detalle con clic, cerrar ventanas con clic fuera, botones de confirmación, un reporte de mouse nunca dispara atajos; lectura SGR, capas y región más pequeña; tema claro/oscuro por `COLORFGBG` y OSC 11 |
| Copias y actualizaciones | `test/application/backup.test.ts`, `test/application/update.test.ts` | Copia diaria que guarda 7, manual, restaurar guardando el estado previo; comparar versiones, consultar GitHub como mucho una vez al día, instalar el paquete del release, silencio sin `gh` |
| Extremo a extremo | `test/e2e/team.e2e.ts` (`npm run test:e2e`, y en CI) | Backend real + PostgreSQL + CLI de dos developers: importar historial local, tasks y chat sin conexión en ambos lados con números únicos al reconectar, archivar y borrar para el otro |
| Importar local → equipo | `test/data/import.test.ts` | Vista previa, importación con números y carpetas conservados, archivadas incluidas, sin duplicar al repetir, sin datos locales |
| Deudas de uso | `test/application/usability.test.ts`, `test/data/chat.test.ts`, `test/data/sync.test.ts` | `$EDITOR` (preferencia, argumentos, editor que falla), renombrar y describir proyectos sin duplicar nombres y en equipo con conexión, tema y archivo de canales |
| Archivar y borrar | `test/application/archive.test.ts`, `test/data/sync.test.ts` | Archivadas fuera de listas y contadores pero en la búsqueda, restaurar y timeline; borrar solo owners y sin reutilizar números; en equipo: archivar offline, borrar para todos, borrado rechazado que devuelve la task |
| Merges externos | `test/git/merge-detection.test.ts` | Branch recién creada (no cuenta), merge manual, fast-forward, branch borrada tras el merge, squash de GitHub, borrada sin merge (aviso y *forget*), una sola task, repos no disponibles; reglas de evidencia |
| Git | `test/git/git-workflow.test.ts` | Vinculación (subcarpetas, `origin`, rutas inválidas), crear, cambiar y recrear branches, `--from`, cambios sin guardar, nombres inválidos, repositorio desaparecido, resolución de repositorio, fallo de Git a mitad del flujo (task intacta), commits relacionados |
| UI (flujos) | `test/ui/app.test.tsx` | Setup completo, abrir task, cambiar estado, crear task, comentar, buscar, filtros y palette, comportamiento de `esc`, iniciar branch con `b`, vincular un repositorio con el selector desde cero, commit eligiendo archivos, merge con confirmación y siguientes pasos, doble confirmación al borrar una branch sin mergear, cierre automático al abrir SOJA tras un merge externo, PR con checks en el detalle y merge del PR desde el menú Git; en modo remoto (`test/ui/remote.test.tsx`), número real tras sincronizar y el chat completo: badge `✉`, enviar, mensaje en vivo, responder y crear una task desde un mensaje |

Los tests usan SQLite en memoria y un reloj determinista (`test/helpers.ts`). Los de Git crean repositorios reales en directorios temporales, con una identidad fija y sin la configuración global del usuario. Estado actual: **207 tests en verde** (más la suite de extremo a extremo). El modo remoto y la sincronización offline se verificaron además de extremo a extremo con `soja-backend` real, PostgreSQL real y dos developers en máquinas distintas: tasks creadas con el servidor caído, reconexión, convergencia, conflicto con aviso y la TUI mostrando `offline · 1 pending`. Solo GitHub estaba simulado. El chat se verificó igual con `soja-backend` 0.3.0: mensajes offline de dos developers (mismo orden en ambos), texto hostil, un mensaje en vivo en la TUI real (pty), task desde un mensaje con respuesta `→ SOJA-1`, backlinks en el detalle y una ráfaga de 35 mensajes (30 enviados, 5 en cola que salieron solos a los 10 s, en orden). En producción (Railway) se comprobó que el WebSocket atraviesa el proxy. `soja import-local` se verificó con el backend real y PostgreSQL: 15 tasks, 4 comentarios y 33 eventos con sus números, un developer no miembro reportado, la task archivada visible como archivada para otro developer y una segunda importación sin duplicados. La lectura de PRs se comprobó contra GitHub real con `gh` 2.100 (formato JSON y PRs mergeados).

---

## 16. Limitaciones conocidas y roadmap

### Limitaciones actuales

- No se pueden borrar proyectos ni editarlos después de crearlos.
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
- Chat: sin mensajes directos, canales privados, hilos, búsqueda ni notificaciones del sistema; los canales archivados se leen pero no aceptan mensajes.
- Los *backlinks* del chat se calculan en tu máquina buscando `SOJA-n` en el texto, así que incluyen mensajes escritos antes de que la task existiera.
- Sin conexión no se pueden crear proyectos ni workspaces ni agregar developers.

- Mouse: no hay arrastrar ni selección con el mouse dentro de SOJA; para copiar texto, `Shift` + arrastrar en la terminal o apaga el mouse con `M`.
- La detección del tema depende de que la terminal responda a OSC 11 o defina `COLORFGBG`; si no, se usa la paleta oscura (`SOJA_THEME=light` la cambia).

### Roadmap propuesto

El plan detallado y sus límites están en [`ROADMAP.md`](../ROADMAP.md). Los hitos previstos son v0.2 Git Workflow local, v0.3 backend y colaboración, v0.4 sincronización offline, v0.5 chat asociado a tareas, v0.6 GitHub/PR/CI, v1.0 consolidación, v1.1 interfaz tipo aplicación y v1.2 actualización selectiva, mascotas animadas y marca fija en el footer.

Publicados: v0.2 (Git), v0.3–v0.4 (modo remoto con sincronización offline + `soja-backend`) en v0.4.0, v0.5 (chat en tiempo real) en v0.5.0, v0.6 (pull requests y CI de GitHub con `gh`) en v0.6.0, v1.0 (consolidación) en v1.0.0 y v1.1 (interfaz tipo aplicación: paneles, paleta clara/oscura, mouse) en v1.1.0. v1.2 (sincronización selectiva, mascotas animadas y marca fija en el footer) y v1.3 (acceso aprobado, perfiles y workspaces) están incluidos en v1.3.0.

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
5. Sube ambos: `git push && git push --tags`. El tag dispara `release.yml` (release de GitHub con el paquete y las notas del CHANGELOG) y `publish.yml` (deja la versión en espera en npm con OIDC y *provenance*; la publicas aprobándola con `npm stage approve` y tu 2FA; ver [NPM_PUBLISH.md](NPM_PUBLISH.md)). No hace falta crear nada a mano. `main` está protegida: el commit de release entra por pull request.

### Contribuciones

El repositorio es público, pero solo los colaboradores aprobados por el propietario pueden abrir pull requests: los demás se cierran solos (`pr-guard.yml`). `main` exige pull request, revisión del propietario (`CODEOWNERS`) y la CI `check` en verde; el propietario puede saltarse la revisión en sus propios PRs (`gh pr merge --admin`). Ver [CONTRIBUTING.md](../CONTRIBUTING.md).

### Reglas de este documento

- Describe el **estado actual**. Lo que se agrega, cambia o elimina se refleja aquí en el mismo commit que lo implementa.
- El historial detallado de cambios va en `CHANGELOG.md`; aquí solo se resume en la tabla siguiente.
- La "Versión del documento" sigue a la versión de la app. La "revisión" aumenta con cada cambio del documento dentro de una misma versión.

### Historial de revisiones

| Doc | App | Fecha | Cambios |
| --- | --- | --- | --- |
| 1.4.0 r4 | 1.4.0 + sin publicar | 2026-09-26 | Interruptor del mouse: `M`, botón en la barra de estado, command palette y `soja mouse on` / `off`; preferencia `mouse` en `config.json` (§5, §6, §7, §10). |
| 1.4.0 r3 | 1.4.0 | 2026-09-26 | Publicación por etapas: `publish.yml` deja cada versión en espera en npm (`npm stage publish`) y el propietario la aprueba con 2FA (§17). |
| 1.4.0 r2 | 1.4.0 | 2026-09-26 | README para usuarios externos: modo local sin cuenta, acceso al modo en equipo por solicitud con revisión en 24–48 h (§7). Tests de UI esperan el frame en lugar de retardos fijos. |
| 1.4.0 r1 | 1.4.0 | 2026-09-25 | Publicación de v1.4.0: instalación y actualizaciones desde npm, `soja account delete`, servidor oficial por defecto, HTTPS obligatorio, repositorio público con PRs solo de colaboradores aprobados (§17 *Contribuciones*), publicación con OIDC y provenance. |
| 1.1.0 r6 | 1.1.0 + v1.2 en desarrollo | 2026-09-25 | §5: una fila de aire entre los atajos del footer y el wordmark. |
| 1.1.0 r5 | 1.1.0 + v1.2 en desarrollo | 2026-09-25 | §5: una fila de separación entre el panel y el footer; §13: altura del layout reserva esa fila. |
| 1.1.0 r4 | 1.1.0 + v1.2 en desarrollo | 2026-09-25 | §5: wordmark ASCII de inicio junto al eslogan en el footer; se explica que `#general` es el canal existente del workspace; §13 altura adaptable del footer. |
| 1.1.0 r3 | 1.1.0 + v1.2 en desarrollo | 2026-09-25 | §5: refresco remoto selectivo, escenas animadas, marca fija en el footer y `Ctrl+G` para selector/creación de canales; §9: sin recarga de consultas cuando no hay cambios; §12 carpeta `ui/mascot/`; §13 decisiones de invalidación, animación y altura del footer. |
| 1.1.0 r2 | 1.1.0 + v1.2 en desarrollo | 2026-09-25 | §5: refresco remoto selectivo, escenas animadas y marca fija en el footer; §9: sin recarga de consultas cuando no hay cambios; §12 carpeta `ui/mascot/`; §13 decisiones de invalidación, animación y altura del footer. |
| 1.1.0 r1 | 1.1.0 | 2026-09-25 | Publicación de v1.1.0 (interfaz tipo aplicación): cabecera, estado actual y roadmap. |
| 0.1.0 r1 | 0.1.0 | 2026-09-24 | Documento inicial: primera milestone completa (TUI, CLI, datos locales, arquitectura). |
| 0.1.0 r2 | 0.1.0 | 2026-09-24 | Roadmap trasladado a archivo propio; §14 alineada con Git local antes de backend, sincronización y chat. |
| 1.0.0 r2 | 1.0.0 + v1.1 sin publicar | 2026-09-25 | §5 reescrita: interfaz tipo aplicación (barras, barra lateral, paneles, ventanas flotantes, avisos), paleta clara/oscura, mouse, asistente tipo instalador; §10 `SOJA_THEME` y `SOJA_MOUSE`; §12 carpetas `chrome/` y `kit/`; §13 decisiones de la interfaz (InkUI como referencia, mouse, medición). |
| 1.0.0 r1 | 1.0.0 | 2026-09-24 | Publicación de v1.0.0: cabecera, estado actual y roadmap. Requiere `soja-backend` ≥ 1.0.0 para importar y borrar. |
| 0.6.0 r5 | 0.6.0 + v1.0 sin publicar | 2026-09-24 | Robustez e instalación: §2 instalar desde GitHub Releases con `gh` y `soja update`; §10 copias diarias y `soja backup`; §14 CI (check, domain, e2e, release), `npm run test:e2e`, `check:domain`; §17 el tag publica el release. |
| 0.6.0 r4 | 0.6.0 + v1.0 sin publicar | 2026-09-24 | §9 *Llevar tu trabajo local al equipo*: `soja import-local` (proyectos, tasks, comentarios y timeline; números conservados o renumerados; developers por username; idempotente; solo owners); sugerencia tras `soja login`; `remote.imports` en la config. |
| 0.6.0 r3 | 0.6.0 + v1.0 sin publicar | 2026-09-24 | Deudas de uso: descripción en `$EDITOR` (`d`), `soja task comment/describe`, editar proyectos (`e` en Proyectos, `soja project edit`), tema y archivo de canales (selector del chat, `soja chat topic/archive`). |
| 0.6.0 r2 | 0.6.0 + v1.0 sin publicar | 2026-09-24 | §4 *Archivar y borrar*: tasks archivadas (fuera de listas y contadores, en la búsqueda, filtro *Archived*) y borrado definitivo solo para owners con doble confirmación; los números no se reutilizan (`workspaces.last_deleted_number`); `soja task archive/restore/delete`, `task list --archived`; eventos `task_archived`/`task_unarchived`; migración `0006`. |
| 0.6.0 r1 | 0.6.0 | 2026-09-24 | Publicación de v0.6.0 (GitHub): cabecera, estado actual y roadmap. |
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
