# Roadmap de SOJA

SOJA es un workspace de desarrollo que empieza en la terminal. Este archivo describe **planes**, no funcionalidades ya disponibles. Para el comportamiento implementado, consulta [docs/SOJA.md](docs/SOJA.md); para cambios publicados, consulta [CHANGELOG.md](CHANGELOG.md).

Las versiones son hitos propuestos y pueden ajustarse según lo que aprendamos al usar la herramienta. Cada etapa debe terminar con un flujo usable, persistencia comprobada y documentación actualizada.

## v0.1 — Base local (actual)

TUI y CLI, setup, workspaces, proyectos, tareas, comentarios, actividad, filtros y búsqueda. SQLite local funciona sin conexión. `soja task start <id>` ya asigna la tarea al usuario actual y cambia su estado a In Progress; todavía no toca Git.

## v0.2 — Git Workflow local (siguiente hito)

Objetivo: empezar a trabajar en una tarea desde su repositorio, incluso sin internet.

- Detectar el repositorio Git del directorio actual y usar `projects.repository_path` para asociar el proyecto a una ruta local. Permitir configurar o corregir esa asociación.
- Añadir `soja start <id>` como flujo Git: reutilizar las reglas actuales de `soja task start <id>`, crear o seleccionar una branch derivada del ID, tipo y título, y guardar la branch en la tarea. Mantener `soja task start` como operación de tareas sin Git.
- Mostrar branch actual y estado Git local en el contexto de la tarea; detectar commits locales relacionados con su branch/ID cuando el repositorio lo permita.
- Manejar explícitamente directorios sin Git, rutas inexistentes, cambios sin guardar, branches existentes y fallos de Git. Evitar que la tarea quede marcada como iniciada con una branch guardada que no existe por un error a mitad del flujo.
- Añadir pruebas para nombres de branch y casos de fallo, además de un recorrido manual que cierre y reabra SOJA para comprobar persistencia.

**Fuera de v0.2:** GitHub API, autenticación, PRs, CI, servidor, sincronización y chat. La integración Git local debe funcionar offline.

## v0.3 — Backend y colaboración remota

Crear `soja-backend` en **otro repositorio**, con API, autenticación, workspaces y reglas de tareas impuestas por el servidor. La ruta remota será `soja-cli → SOJA API → PostgreSQL`; el cliente no se conecta directamente a PostgreSQL. Mantener el modo local sin cuenta. Definir antes de implementar cómo se asignan los números `SOJA-n` cuando varios developers crean tareas. La v0.3 no implica todavía trabajo remoto sin conexión.

## v0.4 — Sincronización offline

Conservar SQLite como estado local del cliente remoto, definir una cola de operaciones, sincronización reintentable y resolución visible de conflictos. Separar el ID interno estable del número humano asignado por el servidor. Probar creación y cambios simultáneos desde dos clientes offline, cierre y reapertura, reconexión y conflictos. Definir el protocolo y sus garantías antes de escribir un motor de sync.

## v0.5 — Chat asociado al trabajo

Canales por workspace, mensajes, respuestas, menciones de usuarios y referencias a tareas. Enlazar tareas con mensajes y crear una tarea desde una conversación. Diseñar el chat como dominio propio, separado de `task_comments`. Empezar por canales; agregar jerarquía de equipos solo si un caso real la requiere. La experiencia offline del chat dependerá de las garantías alcanzadas en v0.4.

## v0.6 — GitHub, PR y CI

Integración autenticada para enlazar branches, commits, pull requests y checks con tareas y conversaciones. Evaluar GitHub App y permisos mínimos al diseñar esta etapa. `soja pr <id>` pertenece aquí, sujeto a la API y permisos disponibles; los flujos Git locales deben seguir funcionando sin GitHub.

## v1.0 — Workspace colaborativo

Consolidar tareas, Git, chat, trabajo remoto y operación sin conexión en una experiencia estable. La fecha y el alcance final se deciden después de validar los hitos anteriores.

## Regla de alcance

No adelantar backend, GitHub ni chat solo porque aparezcan en el roadmap. Al iniciar cada hito, confirmar el comportamiento existente, acotar los cambios y actualizar [docs/SOJA.md](docs/SOJA.md) y [CHANGELOG.md](CHANGELOG.md) conforme se implementen. No crear integraciones vacías ni simular capacidad remota.
