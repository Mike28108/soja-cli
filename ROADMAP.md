# Roadmap de SOJA

SOJA es un workspace de desarrollo que empieza en la terminal. Este archivo describe **planes**, no funcionalidades ya disponibles. Para el comportamiento implementado, consulta [docs/SOJA.md](docs/SOJA.md); para cambios publicados, consulta [CHANGELOG.md](CHANGELOG.md).

Las versiones son hitos propuestos y pueden ajustarse según lo que aprendamos al usar la herramienta. Cada etapa debe terminar con un flujo usable, persistencia comprobada y documentación actualizada.

## v0.1 — Base local (publicado en v0.1.0)

TUI y CLI, setup, workspaces, proyectos, tareas, comentarios, actividad, filtros y búsqueda. SQLite local funciona sin conexión. `soja task start <id>` ya asigna la tarea al usuario actual y cambia su estado a In Progress; todavía no toca Git.

## v0.2 — Git Workflow local (publicado en v0.2.0)

Objetivo: empezar a trabajar en una tarea desde su repositorio, incluso sin internet.

- Detectar el repositorio Git del directorio actual y usar `projects.repository_path` para asociar el proyecto a una ruta local. Permitir configurar o corregir esa asociación.
- Añadir `soja start <id>` como flujo Git: reutilizar las reglas actuales de `soja task start <id>`, crear o seleccionar una branch derivada del ID, tipo y título, y guardar la branch en la tarea. Mantener `soja task start` como operación de tareas sin Git.
- Mostrar branch actual y estado Git local en el contexto de la tarea; detectar commits locales relacionados con su branch/ID cuando el repositorio lo permita.
- Manejar explícitamente directorios sin Git, rutas inexistentes, cambios sin guardar, branches existentes y fallos de Git. Evitar que la tarea quede marcada como iniciada con una branch guardada que no existe por un error a mitad del flujo.
- Añadir pruebas para nombres de branch y casos de fallo, además de un recorrido manual que cierre y reabra SOJA para comprobar persistencia.
- **Operaciones Git desde la interfaz** (ampliación de alcance acordada el 2026-09-24): commit eligiendo archivos de una lista, merge de la branch de la tarea en su branch base (`--no-ff`), borrado de branch con confirmación (doble si no está mergeada), push y apertura de PR.
- **Log en vivo** de cada comando Git y su salida, y errores con sugerencias concretas (conflictos, branch sin mergear, credenciales, remoto rechazado, sin conexión…).
- **Autenticación delegada:** SOJA no pide ni guarda credenciales. Usa las de Git (SSH, credential helper) y de la CLI `gh`. Si Git necesita pedirlas, SOJA pausa la interfaz para que las introduzcas directamente en Git.

Commit, merge y borrar branch funcionan offline; push y PR necesitan conexión, y el resto de SOJA sigue funcionando sin ella.

**Fuera de v0.2:** API de GitHub propia (GitHub App, OAuth), checks de CI, revisión de PRs dentro de SOJA, servidor, sincronización y chat.

## v0.3 — Backend y colaboración remota (publicado en v0.4.0)

Crear `soja-backend` en **otro repositorio**, con API, autenticación, workspaces y reglas de tareas impuestas por el servidor. La ruta remota será `soja-cli → SOJA API → PostgreSQL`; el cliente no se conecta directamente a PostgreSQL. Mantener el modo local sin cuenta. Numeración decidida: contador por workspace en el servidor, incrementado de forma atómica dentro de la transacción que crea la tarea. Stack decidido: Hono + PostgreSQL (Supabase) + login con GitHub (device flow); diseño en `soja-backend/docs/ARCHITECTURE.md`. La v0.3 no implica todavía trabajo remoto sin conexión.

## v0.4 — Sincronización offline (publicado en v0.4.0)

Conservar SQLite como estado local del cliente remoto, definir una cola de operaciones, sincronización reintentable y resolución visible de conflictos. Separar el ID interno estable del número humano asignado por el servidor. Probar creación y cambios simultáneos desde dos clientes offline, cierre y reapertura, reconexión y conflictos. Protocolo y garantías definidos en `soja-backend/docs/SYNC.md` (último en llegar por campo con aviso, números provisionales, offline solo para tasks y comentarios).

## v0.5 — Chat asociado al trabajo (publicado en v0.5.0)

Canales por workspace, mensajes, respuestas, menciones de usuarios y referencias a tareas. Enlazar tareas con mensajes y crear una tarea desde una conversación. El chat es un dominio propio, separado de `task_comments`, y solo existe en modo remoto.

Decisiones (2026-09-24), con el diseño completo en `soja-backend/docs/CHAT.md`:
- **Canales abiertos** del workspace (`#general` por defecto). Mensajes directos y canales privados quedan para después.
- **Respuestas citadas** en el canal; sin hilos aparte.
- **Tiempo real por WebSocket** mientras SOJA está abierto; también acelera la sincronización de tasks.
- **Sin conexión:** leer lo descargado y enviar en cola (reutiliza la cola de v0.4).
- **Avisos dentro de SOJA:** no leídos por canal y menciones en el header; sin notificaciones del sistema.
- Seguridad: el texto remoto se limpia de secuencias de escape antes de mostrarse en la terminal.

## v0.6 — GitHub, PR y CI (siguiente hito)

Integración autenticada con la API de GitHub para enlazar branches, commits, pull requests y checks con tareas y conversaciones: estado de PRs y CI dentro de SOJA, revisiones, y la evaluación de una GitHub App con permisos mínimos. La apertura básica de PRs con la CLI `gh` se adelantó a v0.2; los flujos Git locales deben seguir funcionando sin GitHub.

## v1.0 — Workspace colaborativo

Consolidar tareas, Git, chat, trabajo remoto y operación sin conexión en una experiencia estable. La fecha y el alcance final se deciden después de validar los hitos anteriores.

## Regla de alcance

No adelantar backend, GitHub ni chat solo porque aparezcan en el roadmap. Al iniciar cada hito, confirmar el comportamiento existente, acotar los cambios y actualizar [docs/SOJA.md](docs/SOJA.md) y [CHANGELOG.md](CHANGELOG.md) conforme se implementen. No crear integraciones vacías ni simular capacidad remota.
