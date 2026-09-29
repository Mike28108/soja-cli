# Roadmap de SOJA

SOJA es un workspace de desarrollo que empieza en la terminal. Este archivo describe **planes**, no funcionalidades ya disponibles. Para el comportamiento implementado, consulta [docs/SOJA.md](docs/SOJA.md); para cambios publicados, consulta [CHANGELOG.md](CHANGELOG.md).

Las versiones son hitos propuestos y pueden ajustarse según lo que aprendamos al usar la herramienta. Cada etapa debe terminar con un flujo usable, persistencia comprobada y documentación actualizada.

## v1.9 — Variables de entorno cifradas (publicado en v1.9.0)

Decidido (2026-09-28): compartir variables de entorno de un proyecto con los devs del workspace, incluidas las de producción, sin que el servidor pueda leerlas y sin archivos `.env`. Solo en modo remoto.

- **Cifrado de extremo a extremo.** Cada dispositivo genera sus claves (X25519 para cifrar, Ed25519 para firmar); la privada nunca sale de la máquina. Cada bóveda (proyecto + entorno: `development`, `staging`, `production`) tiene una clave AES-256-GCM que se envuelve para cada dispositivo con acceso. El servidor guarda solo texto cifrado, sobres y claves públicas.
- **Firmas.** Cada valor y cada sobre van firmados por un dispositivo de un owner; el cliente rechaza lo que no esté firmado por un dispositivo confiable. Un servidor comprometido no puede leer ni inyectar variables. Las huellas de los dispositivos se fijan la primera vez (TOFU) y un cambio bloquea hasta confirmarlo.
- **Sin `.env`, en ningún entorno.** Mientras SOJA está abierto, un agente local descifra las variables en memoria. En la carpeta de un repositorio vinculado al proyecto, `soja run [-e staging] -- <comando>` arranca el proceso con las variables, pidiéndolas al agente por un socket local (0600). Al cerrar SOJA, o al vencer o revocarse el acceso, el agente borra las variables y **detiene los procesos** que arrancó.
- **Acceso con caducidad.** Los owners leen y escriben todo; un dev recibe acceso por entorno durante 3, 7 o 30 días. La caducidad la aplica el servidor. Solo los owners dan acceso a `production`; un miembro con acceso puede darlo a `development` y `staging`. Los devs no escriben variables.
- **Revocar y rotar.** Quitar o vencer un acceso marca la bóveda para rotación: el cliente de un owner genera una clave nueva y vuelve a cifrar todo, y SOJA lista las credenciales que esa persona pudo ver para rotarlas en su proveedor.
- **Historial** de quién escribió, compartió, revocó, rotó y descargó cada bóveda.
- **Nombres peligrosos bloqueados** (`LD_PRELOAD`, `NODE_OPTIONS`, `PATH`, `DYLD_*`…), porque permiten ejecutar código.
- **Límites documentados.** Quien tiene acceso puede ver los valores desde su propio proceso mientras dura; el diseño evita copias en disco, uso fuera de SOJA y uso tras la fecha límite, pero no que una persona decidida los copie. Los nombres de las variables no se cifran.

Criterios de cierre: pruebas de ataque (servidor que cambia claves o sobres, valores manipulados o sin firma, dispositivo nuevo sin confirmar, acceso vencido o revocado, miembro de otro workspace), RLS en todas las tablas nuevas, revisión de seguridad independiente antes de publicar, y documentación y changelog en ambos repositorios.

## v1.8 — Proyectos con múltiples repositorios (publicado en v1.8.0)

Una sola unidad de producto puede abarcar repositorios independientes de frontend, backend y uno o más servicios. Cada task puede identificar el repositorio donde se realizará el trabajo y SOJA debe enviar Git a la copia local correspondiente.

- [x] Definir varios repositorios por proyecto con nombre/rol y URL compartidos, manteniendo las rutas locales fuera del backend.
- [x] Elegir el repositorio al crear una task, o cambiarlo en su detalle; habilitar creación por CLI.
- [x] Resolver las operaciones Git contra la ruta enlazada al repositorio asignado y permitir registrar rutas por máquina.
- [x] Sincronizar identidad de repositorios y asignación de task, validando en servidor la relación proyecto/workspace.
- [x] Desplegar la migración de backend antes de usar el enrutamiento de repositorio en workspaces online.
- [x] Añadir guía de migración del flujo de proyectos existentes y validar el ciclo completo en local y remoto.

## v1.6 — Finanzas, rendimiento e ingreso externo de tickets (en implementación)

Alcance solicitado (2026-09-26). Se implementa primero en modo remoto, donde existen workspaces con varios usuarios; el modo local conserva finanzas y métricas personales sin comparativas entre miembros. Base del flujo financiero, designados y API remota añadida. Pendiente cerrar auditoría de rechazos, validación de despliegue y criterios de cierre. La pantalla de finanzas ya contempla la carga y workspaces sin tickets remunerados.

### 1. Modelo de tickets remunerados y finanzas

- Cada ticket indica si es **remunerado**; los tickets nuevos y los datos migrados quedan como no remunerados por defecto. Un ticket remunerado tiene precio, moneda del workspace y autoría del cambio. Usar unidades monetarias exactas (minor units o `numeric`), nunca `float`.
- Distinguir importe **devengado en SOJA** de pago efectivamente liquidado: pasar un ticket remunerado a `DONE` registra el devengo, no confirma una transferencia bancaria. El evento guarda el precio vigente al cerrar, quién lo aprobó, fecha y moneda; es idempotente con operaciones de sync.
- Mantener un ledger auditable para cierres, reaperturas, correcciones y ajustes, sin duplicar ingresos al reintentar una sync. Un precio editado después del cierre no reescribe el historial: necesita un ajuste explícito de un designado.
- Cada persona puede configurar su salario base y periodicidad en el workspace. Se muestra solo a esa persona; queda fuera de ingresos por tickets, totales y todas las comparativas entre miembros. El panel separa salario base de importes devengados por tickets.
- Primera versión: una moneda ISO 4217 por workspace; no convertir monedas. Elegir moneda y periodicidad del salario al configurar finanzas.

### 2. Permisos de designados y flujo de cierre

- El owner puede designar y retirar una o varias personas por workspace. El permiso se valida en el backend para rutas normales y operaciones de sync; ocultar botones en TUI no cuenta como control de acceso.
- Designados pueden establecer o cambiar el precio de tickets de otras personas y cerrar tickets ajenos. El resto puede trabajar en sus tickets remunerados y moverlos a `REVIEW`; solo un designado puede aprobarlos y pasarlos a `DONE`, lo que crea el devengo. Los tickets no remunerados conservan el cierre normal de su responsable; cerrar tickets ajenos requiere ser designado.
- Registrar en el timeline quién cambió precio, designación y estado, con validación de workspace y prevención de acciones retroactivas no autorizadas.

### 3. Panel de finanzas y rendimiento en terminal

- Añadir un apartado de finanzas y desempeño en la TUI con gráficos compactos de terminal, reutilizando tema, accesibilidad de teclado y adaptación a terminales estrechas.
- Finanzas: importe devengado por tickets remunerados en `DONE`, desglose por persona/proyecto y evolución temporal. Las comparativas entre miembros excluyen siempre salarios base y consideran solo tickets remunerados cerrados.
- Rendimiento: incluir tickets de todo tipo; mostrar volumen, abiertos/en curso y antigüedad de los tickets aún abiertos. El promedio de cierre usa el tiempo desde creación hasta `DONE`, excluye cancelados y desglosa por la persona responsable al cerrar; reaberturas no deben duplicar tickets ni devengos.
- Mostrar comparativas solo cuando haya al menos dos miembros elegibles en el workspace, siempre acotadas al workspace activo. Definir en la UI periodo y fórmulas visibles; mostrar un estado vacío si faltan datos.
- Backend entrega agregados acotados por workspace y actor; la réplica offline señala frescura y no presenta devengos pendientes como confirmados.

### 4. API de entrada y aplicaciones con Supabase

- Cada proyecto puede habilitar/exportar/revocar su propia integración desde SOJA: en Projects, `i` configura origins/roles/issuer, genera llave RSA, registra la clave pública y guarda un `.env` protegido junto con OpenAPI 3.1; el backend ofrece rotación/revocación y aplica límites/idempotencia. La plantilla de Edge Function está documentada.
- Contrato: `POST` crea un ticket pendiente de revisión del owner; define campos, límites, errores, idempotencia (`Idempotency-Key`), respuesta con identificador y estado, rate limits y versión. `GET` exporta una tabla paginada con todos los tickets del proyecto, aprobación, estado de trabajo, comentarios y asignación. La API nunca acepta precio o `DONE` del formulario externo: esas decisiones quedan sujetas a permisos internos.
- Autorizar por roles de la aplicación de origen: al configurar/exportar la integración, el owner selecciona qué roles pueden abrir tickets para ese proyecto (allowlist; denegar por defecto). La configuración fija el proyecto/workspace destino; el formulario no puede elegir ni cambiar el destino.
- En la configuración, documentar el origen del rol (claim concreto del JWT verificado o consulta de autorización en la Edge Function), y permitir mapear los nombres de la app a roles normalizados de la integración. Guardar allowlist y mapeo en la configuración de esa integración; rol ausente, desconocido o no permitido se deniega por defecto. Ofrecer una vista previa/validación de la configuración antes de activarla.
- Las aplicaciones externas mantienen su propia base Supabase y continúan usando Supabase Auth/RLS para sus usuarios. El navegador invoca una **Edge Function** de esa aplicación; esta valida sesión y dominio `Origin`, rechaza usuarios anónimos y llama a SOJA desde el servidor. La función guarda el secreto de integración en Supabase Secrets; no se conecta directamente a la base de SOJA ni expone secretos en frontend.
- La Edge Function obtiene el rol desde una fuente confiable de la app (claim de acceso gestionado por servidor o consulta autorizada a su base), lo mapea a un identificador de rol acordado y SOJA comprueba ese rol contra la allowlist del proyecto. Si SOJA no puede verificar directamente ese rol como claim confiable del JWT, la Edge Function debe enviar una aserción de autorización firmada, de vida corta y ligada a issuer, `sub`, integración/proyecto, rol y expiración; definir claves públicas, rotación y revocación en el contrato. No confiar en un rol enviado en el body ni en `user_metadata` editable por el usuario; tampoco confundir el claim `role` de Postgres/Supabase con el rol de negocio de la app. Si la app usa otros nombres/jerarquías, debe configurar el mapeo explícito; solo roles permitidos pueden crear.
- SOJA verifica credencial por proyecto, identidad Supabase autenticada (issuer y `sub` válidos; no anónima), proyecto/dominio registrado y permisos. El dominio se aplica como allowlist/CORS y defensa contra uso desde otros sitios, no como autenticación por sí sola: llamadas servidor-a-servidor y clientes fuera del navegador requieren credencial verificable.
- Las solicitudes deben quedar asociadas a una identidad real: guardar issuer y subject del remitente, sin aceptar un `userId` arbitrario del payload. Definir durante el diseño cómo se vincula esa identidad externa al requester visible en SOJA y qué perfil mínimo se conserva.
- Respuesta de autorización: `401` para sesión/token inválido o anónimo y `403` para rol faltante/no permitido; no crear el ticket en esos casos. Registrar motivo, integración, proyecto y actor en auditoría sin persistir tokens ni secretos.
- Si la app primero persiste el formulario en su Supabase, usar una Edge Function/webhook con reintentos e idempotencia; no intentar una transacción distribuida entre ambas bases. La respuesta de SOJA incluye el `taskId` para guardar la asociación en la app externa.

### Orden de entrega y criterios de cierre

1. ADR de reglas de dinero, moneda/periodicidad, identidad externa, privacidad y efectos de reapertura; cerrar la decisión de autenticación no-anónima antes de fijar el contrato.
2. Migraciones local/backend, ledger y designados; aplicar autorización también a sync y API, con auditoría de cambios.
3. Métricas agregadas por workspace y vistas/gráficos de terminal; validar cálculos, privacidad salarial, tiempos, cierres, reaperturas y datos offline.
4. API versionada por proyecto, exportación OpenAPI/JSON Schema y plantilla Edge Function; probar dominios válidos/inválidos, JWT anónimo, rol permitido/denegado/ausente, manipulación de rol, afirmaciones expiradas, credenciales rotadas, reintentos y abuso/rate limit.
5. Actualizar `docs/SOJA.md`, documentación del backend, guía de integración Supabase y changelogs en cada entrega; despliegue coordinado con versión compatible del backend.

**Decisiones confirmadas (2026-09-26):** validar el JWT de Supabase Auth de la app de origen y rechazar explícitamente usuarios anónimos. Guardar su identidad externa como requester; no se requiere que esa persona ya tenga cuenta SOJA/GitHub. Las integraciones permitirán configurar una allowlist de roles de negocio para autorizar quién puede abrir tickets; el destino queda asociado a la integración/proyecto y no lo determina cada petición.

**Avance de implementación (2026-09-26):** finanzas, salario privado, designados, reglas de sync/ledger, panel de comparativas y asistente `i` de intake están implementados en cliente/backend. Las solicitudes externas esperan aprobación del owner y se ocultan de listas, búsqueda, detalle, contadores, finanzas y sync hasta aprobarse; el rechazo las marca Cancelled. `GET /v1/intake/{integrationId}/tickets` expone a los roles permitidos todos los tickets del proyecto con aprobación, estado, comentarios y asignación. El backend verifica identidad no anónima, issuer, aserción RS256, rol allowlisted, origin exacto, idempotencia y replay. Contrato y Edge Function: `soja-backend/docs/PROJECT_INTAKE_API.md`. Falta validar integración en despliegue y completar criterios de cierre.

- **Corrección de validación de roles:** aceptar etiquetas de rol con espacios y caracteres Unicode tanto en el diálogo del cliente como en el backend (p. ej. `Super Administrador`).
- **Secrets de Supabase:** nombres personalizados de Edge Function no pueden empezar con `SUPABASE_`; exportar issuer con prefijo `SOJA_`.

## v1.7 — Finanzas personales, perfil y atajos configurables (en desarrollo)

Ampliación solicitada (2026-09-27). Requiere cambios coordinados en `soja-cli` y `soja-backend`; la configuración de nómina y el historial financiero siguen siendo privados para la persona autenticada y acotados al workspace activo.

- **Calendario de nómina:** junto al salario y su periodo, permitir guardar una regla de cobro mensual: un día del mes (incluido último día del mes) o dos fechas, el día 15 y el último día calendario. Mostrar próxima fecha de pago y el total estimado del próximo ciclo. Si el calendario es semimensual, dividir el monto mensual configurado en dos importes iguales y sumar los devengos de tickets asignados a ese ciclo. Usar la zona horaria local guardada por la persona para evitar cortes de fecha del servidor. Las reglas describen el calendario esperado y no afirman que un pago se haya liquidado.
- **Historial de ingresos por tickets:** consultar el ledger personal y listar tasks remuneradas cerradas con fecha, identificador/título, importe, moneda y nómina a la que se asignaron. Mostrar ajustes y reversiones como eventos separados, con ingresos positivos en verde y reversiones claramente distinguibles; no mezclar salario base con este historial. La asignación a nómina debe ser determinista e idempotente, sin duplicar ni mover ingresos ya liquidados.
- **Configuración de teclado:** añadir una vista de ajustes que permita reasignar atajos de navegación global y guardarlos en la configuración local del usuario. Detectar y explicar conflictos, ofrecer restaurar valores predeterminados y respetar los campos de texto, diálogos y atajos reservados. Las acciones específicas de task, chat y otras pantallas conservan sus atajos actuales.
- **Perfil propio:** dar acceso visible desde la interfaz al perfil remoto del usuario para consultar y editar los campos personales permitidos. En v1.6.3 el encabezado solo muestra `@usuario` y el badge CEO; esta versión añade el acceso al perfil. La API existente `GET/PUT /v1/profile` mantiene privada la fecha de nacimiento.
- **Contrato y datos:** extender salario personal con la regla de fechas de nómina y devolver historial del ledger filtrado por beneficiario. Implementado en el backend con `member_payroll_settings`, `payroll_date` y `PUT /finance/payroll`; falta validar aislamiento por usuario/workspace, fechas de fin de mes y año bisiesto, pagos semimensuales, reversiones/ajustes y compatibilidad de clientes antiguos.

**Decisiones confirmadas (2026-09-27):** la nómina del 15 y último día divide el salario mensual en dos pagos iguales; cada ingreso por ticket se suma a la siguiente nómina programada; una task cerrada en la misma fecha de pago entra en ese ciclo; la primera versión solo permite personalizar atajos globales.

## v1.5 — Repositorio al día y modo teclado (en desarrollo)

Alcance solicitado (2026-09-26). Adelantado en v1.5.0: apagar y encender el mouse sin reiniciar (`M`, interruptor en la barra de estado, command palette y `soja mouse on|off`). El resto sigue pendiente y saldrá en versiones 1.5.x/1.6.

- **Saber si vas atrasado:** en el detalle de la task y en la línea del proyecto, mostrar cuántos commits va la branch **detrás y por delante** de su base remota (`origin/main`) y de su upstream, por ejemplo `↓3 main · ↑1`. Las cuentas salen de lo último descargado, así que SOJA muestra cuándo fue el último *fetch* y, si es viejo o nunca se hizo, lo indica con la acción a seguir.
- **Fetch:** `f` en el menú Git y `soja fetch [proyecto]` ejecutan `git fetch --prune`. Opcionalmente, un fetch en segundo plano mientras SOJA está abierto (configurable y desactivable), sin pedir nunca credenciales (`GIT_TERMINAL_PROMPT=0`); si Git necesita autenticarse, se avisa y el fetch se hace a mano. El fetch no toca tus archivos ni tus branches.
- **Pull:** *Pull* en el menú Git y `soja pull [SOJA-n]` traen los cambios de la branch actual con `git pull --rebase` (en la branch base, `--ff-only`). Con cambios sin commitear, SOJA se detiene y lo explica antes de tocar nada. Log en vivo, conflictos listados con la opción de abortar (`git rebase --abort`) y errores con sugerencias, como el resto de operaciones Git.
- **Actualizar la branch con main:** acción *Update from main* que rebasa (o mezcla, según configuración) la branch de la task sobre la base recién descargada, con confirmación.
- **Merges detectados antes:** tras un fetch o pull, la detección local de merges (tasks a Done) se ejecuta de inmediato.

- **Modo teclado:** diagnosticar primero qué atajos fallan y en qué terminales (con un diagnóstico de teclas, `soja keys`, que muestra lo que recibe SOJA), y corregir la causa. Además, apagar y encender el mouse sin reiniciar (`:mouse off`, guardado en la configuración, equivalente a `SOJA_MOUSE=0`): con el mouse apagado la terminal recupera su selección y copia normales.
- **Línea de comandos estilo Vim:** `:` acepta comandos escritos con autocompletado (`:pull`, `:fetch`, `:open SOJA-12`, `:filter blocked`, `:mouse off`, `:q`), además de la búsqueda difusa de la command palette actual. Los campos de texto siguen siendo un modo de inserción del que `esc` siempre sale, para que ninguna letra se confunda con un atajo.

Criterios de cierre: contadores detrás/delante verificados contra repositorios de prueba con remoto local, pull/rebase con conflictos y con cambios sin commitear, ningún proceso de fondo que pida credenciales, lista de atajos verificada con y sin mouse en al menos kitty, GNOME Terminal y la terminal de VS Code, y documentación y changelog actualizados.

## v1.4 — Distribución y seguridad (publicado en v1.4.0)

- Distribución propietaria en npm con trusted publishing OIDC, *provenance* y artefactos sin source maps. El repositorio fuente pasa a ser público (licencia propietaria); solo los colaboradores aprobados abren pull requests.
- Endurecer sesiones, transporte HTTPS, límites del login público, eliminación de cuentas con autoría anonimizada y CI sin credenciales persistentes.
- La primera versión se publica a mano (npm solo permite un trusted publisher en paquetes existentes); después, cada tag publica solo. Pendiente: revisión legal de la licencia y del aviso de privacidad.

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

## v0.6 — GitHub, PR y CI (publicado en v0.6.0)

Integración autenticada con la API de GitHub para enlazar branches, commits, pull requests y checks con tareas y conversaciones: estado de PRs y CI dentro de SOJA, revisiones, y la evaluación de una GitHub App con permisos mínimos. La apertura básica de PRs con la CLI `gh` se adelantó a v0.2; los flujos Git locales deben seguir funcionando sin GitHub.

Decisiones (2026-09-24):
- **Conexión con la CLI `gh` de cada developer**, la misma que ya abre PRs: sin credenciales nuevas en SOJA ni en el backend, y funciona en modo local y remoto. Sin webhooks: el estado se consulta al abrir la task y periódicamente con la interfaz abierta. Una GitHub App con webhooks queda fuera de v0.6.
- **Ver y hacer merge:** estado del PR, revisión y checks en el detalle y en la lista; merge del PR en GitHub desde SOJA (con confirmación), que cierra la task. Aprobar, pedir cambios y leer reviews siguen en GitHub.
- **Compartido con el equipo** en modo remoto a través del timeline: PR mergeado en GitHub (cierra la task aunque nadie haga pull) y checks fallidos por commit. Requiere eventos nuevos en `soja-backend`.

## v1.0 — Workspace colaborativo (publicado en v1.0.0)

Consolidar tareas, Git, chat, trabajo remoto y operación sin conexión en una experiencia estable. La fecha y el alcance final se deciden después de validar los hitos anteriores.

Prioridades acordadas (2026-09-24), todas dentro de v1.0:
- **Instalación fácil:** publicar en npm (`npm i -g soja-cli`) y avisar de versiones nuevas.
- **Deudas de uso:** descripción con `$EDITOR`, comentar desde la CLI, archivar tasks, editar proyectos, tema y archivo de canales.
- **Pasar datos local → equipo:** migrar tasks y proyectos del modo local a un servidor.
- **Robustez:** dominio compartido entre cliente y backend, copias de la réplica, pruebas de carga del servidor y E2E automatizados en CI.

Decisiones (2026-09-24):
- **Instalación desde GitHub Releases con `gh`:** cada release adjunta el paquete y se instala con el `gh` del equipo; el código sigue privado. SOJA avisa de versiones nuevas consultando el último release.
- **Dominio:** copias en ambos repos con un chequeo en CI que falla si se desalinean.
- **Quitar tasks:** archivar (reversible, sincronizado) y borrado definitivo solo para owners, con doble confirmación.
- **Migración local → equipo:** proyectos, tasks, comentarios y timeline con fechas; conserva los números si el workspace está vacío y, si no, renumera mostrando la equivalencia. Developers asociados por username.

## v1.1 — Interfaz (publicado en v1.1.0)

Solo interfaz: pulir la TUI hasta que casi parezca una aplicación gráfica, sin funciones nuevas. Referencias: Codex, lazygit, k9s, btop, instaladores y Charm; InkUI como referencia de patrones (no como dependencia: sus componentes leen el teclado por su cuenta y saltarían el despachador por capas, y traen sus propios colores).

Decisiones (2026-09-25):
- **Paneles tipo aplicación:** barra superior y barra de estado con fondo, barra lateral con vistas, chat y proyectos con contadores, panel principal con pestañas, vista previa de la task seleccionada, fila seleccionada rellena. Se pliega en terminales pequeñas.
- **Paleta propia de SOJA** en truecolor (verdes soja, grises cálidos), con variantes clara y oscura detectadas del terminal, y degradación automática a 256/16 colores.
- **Mouse:** clic para seleccionar, abrir, cambiar de pestaña y elegir en menús; rueda para desplazar. El teclado sigue siendo lo principal.
- Ventanas flotantes (selectores, formularios, confirmaciones) sobre la pantalla, avisos tipo *toast*, spinners y estados de carga.

## v1.2 — Interfaz reactiva y mascotas (en desarrollo)

Pulir la respuesta visual de la interfaz y darle más personalidad, manteniendo la sincronización y la navegación estables. Alcance acordado (2026-09-25):

- **Actualización selectiva tras sincronizar:** si el ciclo no aplica ni trae cambios, no vuelve a consultar datos de la interfaz. Si hay cambios, refresca solo los datos afectados y sus dependencias visibles: por ejemplo, una task nueva actualiza la lista correspondiente y los contadores relacionados; un cambio de task actualiza esa task, y no el resto de las pantallas. Conservar selección, scroll y overlays abiertos siempre que sigan siendo válidos. Las mutaciones locales ya actualizan la réplica al instante; este refresco selectivo se aplica a los cambios que llegan o se confirman al sincronizar.
- **Mascotas animadas** con las escenas incluidas en `ink-agent-scenes.zip`, integradas con la paleta de SOJA y sin tomar control del teclado. En una task, la escena acompaña su estado (trabajo, bloqueo/bug, prioridad urgente o finalización); fuera de una task, representa el estado de la vista o de la app (por ejemplo, sincronización, lista vacía o descanso). Se muestran en una zona contextual al pie del panel principal; al sincronizar, la escena de sincronización tiene prioridad temporal. Respetar el tamaño natural de las escenas (hasta 78 columnas y 15 filas), y ocultarlas o reducirlas en terminales donde resten espacio útil.
- **Marca fija en el footer:** mostrar siempre el wordmark ASCII original de tres líneas que aparece en el splash de SOJA, con el eslogan a su lado a la izquierda del footer; apilar el eslogan en terminales estrechas y conservar los atajos y el indicador de modo/conexión.

La sincronización sigue siendo en segundo plano y los cambios nuevos deben reflejarse sin reiniciar la navegación ni recargar pantallas no relacionadas. Las animaciones son decorativas: no bloquean acciones ni sustituyen los estados y avisos accesibles por texto.

## v1.3 — Acceso aprobado y perfiles (desplegado en v1.3.0)

Decisión añadida (2026-09-25): el cliente usa la URL pública del backend oficial como valor predeterminado tanto en la pantalla inicial como en `soja login`; `--server <url>` permite usar una instancia distinta. La URL es pública y no contiene credenciales.

Rediseñar la entrada a SOJA y el alta de cuentas remotas, coordinando `soja-cli` con `soja-backend`. El modo local seguirá disponible sin cuenta ni capacidades colaborativas. El backend continuará siendo la autoridad para autenticar usuarios, aprobar el acceso y aislar los datos por membresía de workspace.

Alcance solicitado (2026-09-25):

- **Inicio de sesión y modo local:** cuando no haya una sesión remota válida y exista conexión, mostrar en la pantalla inicial las opciones *Iniciar sesión con GitHub* y *Modo local*. GitHub será el único proveedor de autenticación remota. Entrar al modo local no activa chat ni datos compartidos.
- **Solicitud de acceso:** un usuario autenticado por GitHub que aún no tenga aprobación podrá conservar una sesión restringida y enviar/revisar su solicitud de invitación, con una carta de interés de hasta 100 caracteres y un país. Mientras esté pendiente o rechazada, no entrará al modo Online ni podrá consultar o modificar workspaces, miembros, tasks, proyectos o chat. La API solo permitirá las acciones de cuenta necesarias para la propia solicitud y perfil; la identidad autenticada y la autorización de acceso son estados distintos.
- **Aprobación del CEO:** una vista administrativa de solicitudes pendientes estará disponible solo para la cuenta GitHub `@mike28108`. Aprobar habilita el acceso a SOJA; rechazar lo mantiene bloqueado. La identidad CEO se vinculará a un identificador de GitHub estable, no solo al username mutable. Mostrar un badge exclusivo de CEO en su perfil.
- **Perfiles:** añadir perfiles remotos con campos acordados, asociados a la identidad GitHub. Mostrar el país en el perfil y usar una lista seleccionable alimentada por REST Countries. Mantener las solicitudes y perfiles fuera de las rutas públicas y limitar las acciones administrativas al CEO.
- **Workspaces:** después de aprobar la cuenta, entrar directamente si hay un solo workspace; mostrar un selector obligatorio antes de entrar si hay más de uno. Permitir cambiar de workspace dentro de SOJA. Si no pertenece a ninguno, explicar cómo crear uno o pedir que un owner lo agregue.
- **Aislamiento:** cada petición y cada canal de tiempo real seguirá comprobando membresía; aprobar una cuenta no concede membresía ni acceso implícito a workspaces ajenos. La vista CEO de solicitudes no debe ampliar su acceso a los datos de esos workspaces. Preservar como aprobadas las cuentas existentes al migrar el esquema.
- **Despliegue:** preparar variables de backend para identificar de forma segura al CEO y, si se consulta REST Countries desde el backend, guardar su credencial solo en Railway. Resolver disponibilidad/fallback de la lista de países antes de depender de un servicio externo durante el registro.

Implementado y validado en ambos repositorios: el backend añade estados de acceso, perfil privado, solicitudes, rutas de revisión CEO y protección de las rutas de workspace/WebSocket; la TUI y CLI ofrecen login/local, perfil, selección de workspace y revisión CEO. El backend v1.1.0 está desplegado en Railway y la CLI v1.3.0 está publicada en GitHub Releases. CI pasó pruebas unitarias, e2e, lint y build. El selector de países usa REST Countries v3.1 como alternativa cuando falta la clave v5.

Criterios de cierre cumplidos: cambios coordinados de esquema, API, autorización y pantallas iniciales; migración que preserva las cuentas existentes; pruebas de aislamiento/autorización; y documentación y changelog actualizados en ambos repositorios.

## Regla de alcance

No adelantar backend, GitHub ni chat solo porque aparezcan en el roadmap. Al iniciar cada hito, confirmar el comportamiento existente, acotar los cambios y actualizar [docs/SOJA.md](docs/SOJA.md) y [CHANGELOG.md](CHANGELOG.md) conforme se implementen. No crear integraciones vacías ni simular capacidad remota.
