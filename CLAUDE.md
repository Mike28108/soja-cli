# SOJA — guía para agentes

Lee `docs/SOJA.md` antes de cambiar código: es la documentación viva del proyecto.

## Documentación versionada (obligatorio)

Todo cambio de comportamiento, comandos, atajos, configuración, esquema o arquitectura
se refleja **en el mismo commit** en:

1. `docs/SOJA.md`: la sección afectada y la fila del historial de revisiones (sube la revisión `rN`).
2. `CHANGELOG.md`: una entrada bajo `## [Unreleased]` (Added / Changed / Fixed / Removed).

Al publicar una versión, sigue §15 de `docs/SOJA.md`: sube la versión en `package.json`,
mueve Unreleased a la versión nueva con fecha, actualiza la cabecera de `docs/SOJA.md`,
y haz commit `release: vX.Y.Z` con el tag `vX.Y.Z`.

## Reglas del código

- Capas: `ui/` y `cli/` → `application/services` → `data/repositories.ts` → `data/local` → `database/`.
  Nada de SQL ni repositorios en componentes o comandos.
- La CLI y la TUI usan los mismos servicios; no dupliques lógica.
- Colores y glifos solo desde `src/ui/theme/theme.ts`; la identidad solo desde `src/ui/branding/brand.ts`.
- TypeScript estricto, sin `any`. Los errores para el usuario son `SojaError` con `message` y `hint`.
- Cambios de esquema: edita `src/database/schema.ts` y ejecuta `npm run db:generate -- --name <x>`.
- `soja-cli` y `soja-backend` son repositorios separados. El cliente nunca habla directo con Postgres.

## Verificación antes de terminar

`npm run lint && npm test && npm run build`
