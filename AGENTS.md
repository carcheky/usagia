# Usagia — reglas para quien trabaje en este repo

Mismo modelo que `woptimizer`: **conventional commits + releases automáticas**, con
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

> **Regla más dura todavía: `main` solo la fusiona el usuario.** Publicar una
> versión estable es su decisión, no la de ninguna sesión ni la de ningún
> agente. Una sesión trabaja en `beta`, hace `git push origin beta` (eso sí
> genera pre-releases, que es lo normal) y **no toca `main`**: ni la fusiona,
> ni la crea, ni la empuja, ni cambia la rama por defecto del repo. Si cree
> que toca publicar una estable, no la publica: lo dice y lo decide él.

> Antes de cada `git push`, `git status --porcelain` tiene que salir vacío.

## Releases

La versión **la decide el mensaje de commit**, no nadie a mano:
`fix:` → patch · `feat:` → minor · `BREAKING CHANGE:` → major ·
`docs:`/`chore:`/`ci:`/`refactor:` no publican nada.

Todo ocurre en `.github/workflows/release.yml`:

`commits` (commitlint) → `verify` (humo de la app) → `release`
(`scripts/release.js`: numera, redacta el changelog y crea la release) →
`build-windows` + `build-linux` (electron-builder y adjuntar los binarios a
la release)

```bash
git push origin beta     # -> Release v1.0.0-beta.NNNN (cuatro digitos), pre-release
git switch main && git merge --ff-only beta && git push origin main   # -> Release v1.0.0
```

> ⚠️ **Nunca crees tags a mano** ni edites el número de versión:
> `scripts/release.js` los pone, y un tag manual lo duplica.
> La versión de `package.json` queda en `0.0.0`: la pone el script y el
> pipeline se la pasa a electron-builder con `--config.extraMetadata.version=`.
>
> **El changelog es de la app, no del repo.** Un cambio del pipeline, de la
> documentación o de las pruebas va como `ci:`, `docs:` o `test:`: no publica
> release ni aparece en ninguna. Solo `feat:`, `fix:` y `perf:` son de la app.

## Reglas de la app

- **Cada proveedor se resuelve por cuenta, no por id.** Una "cuenta" es un
  proveedor + un nombre + su credencial + su interruptor, y puede haber
  **varias del mismo proveedor** (una por cuenta de IA). El id de la cuenta es
  la clave de los resultados y de las cachés: si añades un proveedor que
  cachea (Claude, Antigravity), **cachea por `ctx.instance.id`**, o la
  respuesta de una cuenta se le servirá a otra.
- **La cuota de Claude solo se consulta con un token OAuth** (`sk-ant-oat…`).
  Una clave API (`sk-ant-api…`) no vale: la app la descarta y lo avisa en la
  nota de la tarjeta, para que no tapee la sesión local.
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

## Varias sesiones en el mismo repo

Puede haber **más de una sesión de DSH trabajando en este repo a la vez** (por
ejemplo, una revisando el código y otra documentando). DSH **no** permite
mensajear entre sesiones raíz distintas: `send_message` solo funciona dentro
del mismo árbol de subagentes. El canal real es el repo.

- **Al empezar, lee `STATUS.md`**: dice qué hizo la otra sesión, qué está a
  medias y qué ficheros tiene reservados.
- **Un fichero, un dueño.** Antes de tocar `README.md`, `FINDINGS.md`,
  `AGENTS.md` o `STATUS.md`, comprueba que ninguna otra sesión los está
  editando (`git status --porcelain` y el log del repo).
- **`STATUS.md` se fusiona, no se sobrescribe.** Si al abrirlo la cabecera
  dice que otra sesión lo está escribiendo, **incorpora su contenido** (lo que
  sepa y tú no) en vez de replacearlo. Si dos sesiones escriben a la vez, gana
  la que mergea.
- **Reserva antes de editar**: anota tu fichero en la tabla *Sesiones activas*
  de `STATUS.md` antes de tocarlo, para que las demás no lo toquen.
- **No commitees trabajo ajeno.** Si hay commits sin pushear de otra sesión,
  déjalos tal cual y anótalos en `STATUS.md`.
- **Actualiza `STATUS.md` al terminar**, con la fecha y lo que cambió.
- Lo que se descubre de un endpoint o de una cuota va a `FINDINGS.md`; lo que
  es estado del proyecto, a `STATUS.md`. No se mezclan.
