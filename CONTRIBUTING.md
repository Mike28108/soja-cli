# Contribuir a SOJA

SOJA es software propietario ([LICENSE](LICENSE)). El código es público para que puedas leerlo y verificar el paquete de npm, pero **solo los colaboradores aprobados por el propietario pueden abrir pull requests**:

- Los pull requests de cuentas que no son colaboradoras se cierran automáticamente (`.github/workflows/pr-guard.yml`).
- `main` está protegida: todo cambio entra por pull request, con la revisión del propietario (`.github/CODEOWNERS`) y la CI en verde.

Si quieres colaborar, abre un *issue* o contacta al propietario. Si te aprueba, te invitará como colaborador del repositorio.

## Para colaboradores

1. Crea una branch desde `main`.
2. Sigue [CLAUDE.md](CLAUDE.md) y [docs/SOJA.md](docs/SOJA.md): capas, estilo y documentación versionada (cada cambio actualiza `docs/SOJA.md` y `CHANGELOG.md` en el mismo commit).
3. Antes de abrir el PR: `npm run lint && npm test && npm run build`.
4. Usa tu dirección *noreply* de GitHub en los commits (`git config user.email <id>+<usuario>@users.noreply.github.com`).
