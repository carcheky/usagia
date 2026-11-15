# Usagia — reglas para quien trabaje en este repo

Mismo modelo que `woptimizer`: **conventional commits + semantic-release**, con
`beta` como rama de trabajo y `main` como rama de publicación.

## Ramas

| Rama | Papel |
|---|---|
| `beta` | **Rama de trabajo.** Todo commit del bucle va aquí. |
| `main` | **Rama de publicación.** Solo recibe `beta` por fast-forward. |

```bash
git switch beta      # el bucle trabaja aquí
# ... ciclos ...
git switch main
git merge --ff-only beta
git push origin main
```

> **Regla dura: nunca se empuja un commit del bucle directamente a `main`.**
> `main` es la rama cuya protección bloquea el force-push, y publicar estable
> sin pasar por `beta` es lo que rompe el job `commits` (que mira el rango
> del push).

> Antes de cada `git push`, `git status --porcelain` tiene que salir vacío.

## Releases

La versión **la decide el mensaje de commit**, no nadie a mano:
`fix:` → patch · `feat:` → minor · `BREAKING CHANGE:` → major ·
`docs:`/`chore:`/`ci:`/`refactor:` no publican nada.

Todo ocurre en `.github/workflows/release.yml`:

`commits` (commitlint) → `verify` (humo de la app) → `release`
(semantic-release) → `build-windows` + `build-linux` (electron-builder y
adjuntar los binarios a la release)

```bash
git push origin beta     # -> Release v1.1.0-beta.N, marcada como pre-release
git switch main && git merge --ff-only beta && git push origin main   # -> Release v1.1.0
```

> ⚠️ **Nunca crees tags a mano** ni edites el número de versión:
> `semantic-release` los pone, y un tag manual lo duplica.
> La versión de `package.json` queda en `0.0.0`: la gestiona semantic-release
> y el pipeline se la pasa a electron-builder con
> `--config.extraMetadata.version=`.

## Reglas de la app

- **Cada proveedor se resuelve por cuenta, no por id.** Una "cuenta" es un
  proveedor + un nombre + su credencial + su interruptor, y puede haber
  **varias del mismo proveedor** (una por cuenta de IA). El id de la cuenta es
  la clave de los resultados y de las cachés: si añades un proveedor que
  cachea (Claude, Antigravity), **cachea por `ctx.instance.id`**, o la
  respuesta de una cuenta se le servirá a otra.
- **La app no necesita credenciales propias.** Se resuelven en cascada:
  credencial de la cuenta → variable de entorno → harness DSH
  (`~/.dsh/.credentials.yaml`) → almacenes nativos (Administrador de
  credenciales de Windows, caché cifrada de Claude Desktop). Si añades un
  proveedor, sigue esa cadena.
- **Los porcentajes se normalizan a "usado"**, que es como los muestran todos
  los paneles. La escala es fija por proveedor (`pct100()`), nunca se adivina.
- **La semántica de cada endpoint está en `FINDINGS.md`**, que es la fuente
  única de verdad. Actualízalo cuando descubras algo: lo que hay ahí lo usan
  otras sesiones.
- La app corre en segundo plano y **no debe morir en silencio**: el lanzador
  (`scripts/run.js`) tiene un watchdog que la relanza si Electron muere de
  forma anormal.
- Lo que se toca en la UI se comprueba **ejecutando la app**, no narrando:
  `npm run preview` (tarjeta), `npm run preview:settings` (configuración) y
  `npm test` (modelo de cuentas, Node puro).
