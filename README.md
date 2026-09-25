# SOJA

```
▄█▀▀▀▀▀▀  ▄█▀▀▀▀█▄        ██  ▄█▀▀▀▀█▄
 ▀▀▀▀▀█▄  ██    ██        ██  ██▄▄▄▄██
▄▄▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ██    ██ ▄▄▄
```

**Software Operations & Job Assistant** · v0.6.0 · by Enmauel.biz

> No dashboards. No browser. No bullshit. Just work.

SOJA es un gestor de tareas para equipos de desarrollo que vive en la terminal. Convierte las solicitudes que llegan por WhatsApp, reuniones o mensajes en tareas técnicas trazables en segundos, sin salir de la shell.

- **Terminal-native:** interfaz TUI con React + Ink, manejada por completo con el teclado y con atajos estilo Vim.
- **Rápido:** para crear una task basta el título.
- **Trazable:** cada cambio queda en el timeline de la task, junto a los comentarios.
- **Local-first:** tus datos viven en SQLite en tu máquina. En equipo, `soja login` conecta con [`soja-backend`](https://github.com/Mike28108/soja-backend) y sigue funcionando sin conexión.
- **Chat del equipo** (modo remoto): canales en tiempo real junto al trabajo, con menciones, referencias `SOJA-12` y tasks creadas desde un mensaje. `#` lo abre.
- **Git-aware:** branch, commit, push, PR y merge desde la task, con log en vivo y errores con sugerencias. Ve el estado de cada PR y su CI en GitHub y hace el merge sin salir de la terminal. Usa tus credenciales de Git y `gh`.
- **Scriptable:** una CLI no interactiva que usa los mismos servicios que la interfaz.

## Instalar

Requiere **Node.js 24+** y la [CLI `gh`](https://cli.github.com) con acceso a este repositorio:

```bash
gh release download --repo Mike28108/soja-cli --pattern 'soja-cli-*.tgz' --dir /tmp/soja
npm install -g /tmp/soja/soja-cli-*.tgz
soja
```

`soja update` instala versiones nuevas (SOJA avisa cuando hay una).

## Desde el código

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
soja folders add ~/workspace/products   # carpetas donde viven tus repos
soja project link ENROLL enrollbridge   # o en la TUI: p → r → elegir de la lista
soja start SOJA-12               # crea/cambia a su branch Git y la pasa a In Progress
soja commit SOJA-12 -m "Fix" --all
soja pr SOJA-12                  # push + pull request con gh
soja merge SOJA-12 --delete --done
```

## Documentación

- 📘 **[docs/SOJA.md](docs/SOJA.md)**: la documentación completa (conceptos, interfaz, atajos, CLI, configuración, modelo de datos, arquitectura y guía de desarrollo).
- 📝 **[CHANGELOG.md](CHANGELOG.md)**: los cambios de cada versión.
- 🗺️ **[ROADMAP.md](ROADMAP.md)**: próximos hitos, empezando por Git local en v0.2.

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
