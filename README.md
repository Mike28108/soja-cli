# SOJA

```
▄█▀▀▀▀▀▀  ▄█▀▀▀▀█▄        ██  ▄█▀▀▀▀█▄
 ▀▀▀▀▀█▄  ██    ██        ██  ██▄▄▄▄██
▄▄▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ██    ██ ▄▄▄
```

**Software Operations & Job Assistant** · v0.1.0 · by Enmauel.biz

> No dashboards. No browser. No bullshit. Just work.

SOJA es un gestor de tareas para equipos de desarrollo que vive en la terminal. Convierte las solicitudes que llegan por WhatsApp, reuniones o mensajes en tareas técnicas trazables en segundos, sin salir de la shell.

- **Terminal-native:** interfaz TUI con React + Ink, manejada por completo con el teclado y con atajos estilo Vim.
- **Rápido:** para crear una task basta el título.
- **Trazable:** cada cambio queda en el timeline de la task, junto a los comentarios.
- **Local-first:** tus datos viven en SQLite en tu máquina. Está preparado para un futuro backend (`soja-backend`).
- **Scriptable:** una CLI no interactiva que usa los mismos servicios que la interfaz.

## Inicio rápido

Requiere **Node.js 24+**.

```bash
git clone https://github.com/Mike28108/soja-cli.git
cd soja-cli
npm install
npm run dev              # la primera vez te hace 3 preguntas y listo
```

¿Quieres verlo con datos? `npm run db:seed` y luego `npm run dev`.

Para tener el comando `soja` en tu sistema:

```bash
npm run build && npm link
```

## Uso en 30 segundos

| Tecla | Acción |
| --- | --- |
| `j` / `k` · `enter` · `esc` | moverse · abrir · volver |
| `n` | nueva task |
| `/` | buscar |
| `:` o `Ctrl+K` | command palette |
| `h` / `l` o `1`–`7` | cambiar filtro |
| `s` · `p` · `a` · `c` · `e` · `x` | estado · prioridad · asignar · comentar · editar · done |
| `?` · `q` | ayuda · salir |

```bash
soja task create "Fix Stripe webhook" --project enroll --priority high --requester Finance
soja task list --all
soja task start SOJA-12
soja task done SOJA-12
```

## Documentación

- 📘 **[docs/SOJA.md](docs/SOJA.md)**: la documentación completa (conceptos, interfaz, atajos, CLI, configuración, modelo de datos, arquitectura y guía de desarrollo).
- 📝 **[CHANGELOG.md](CHANGELOG.md)**: los cambios de cada versión.

## Desarrollo

```bash
npm run dev        # ejecutar desde el código fuente
npm test           # tests (Vitest)
npm run lint       # typecheck + ESLint
npm run build      # compilar a dist/
npm run db:seed    # datos demo
npm run db:reset   # borrar los datos locales (pide confirmación)
```

Stack: TypeScript · React · Ink · `node:sqlite` · Drizzle ORM · Zod · Vitest.

---

Uso interno. © Enmauel.biz
