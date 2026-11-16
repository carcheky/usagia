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
  `npm test` (todas las suites, Node puro).

## Pruebas: la red de seguridad (no se gasta contexto en re-verificar)

`npm test` (= `node scripts/test.js`) lanza **todas** las suites
`scripts/test-*.js`, cada una en su propio proceso de Node, **sin Electron,
sin red y sin credenciales de la máquina** (HOME falso + `fetch` simulado,
ver `scripts/test-lib.js`). Tarda un segundo. Es lo que ejecuta el job
`verify` del pipeline, así que **nada se publica si una suite falla**.

> **Regla dura: un `fix:` o un `feat:` sin su prueba no se commitea.**
> Antes de arreglar algo, escribe la prueba que lo reproduce (en rojo) y
> luego arréglalo (en verde). Así el siguiente que toque ese código no tiene
> que volver a entender el bug: la suite se lo dice. Un cambio que rompe una
> prueba existente **no se arregla cambiando la prueba** salvo que el
> comportamiento esperado haya cambiado a propósito, y entonces se dice en
> el commit.

| Suite | Qué fija | Cuándo tocarla |
|---|---|---|
| `test-parsers.js` | Funciones puras: `pct100` (la regresión 1 % vs 100 %), `sortMetrics`, `parseUsage` de Claude, `parseSummary` de Antigravity, helpers de DeepSeek, `availability` (color del icono), `tooltip` (incluido el marcador del hover) | Al cambiar cómo se convierte una respuesta en métricas o el criterio del icono |
| `test-providers.js` | `fetchUsage` de los **cuatro** proveedores con `fetch` simulado: cascada de candidatos de Claude (401 → siguiente, 429 → parar, caché por cuenta, clave API ignorada, respaldo local en `warning`), Bearer de Antigravity (JSON pegado → `access_token`, refresco y caché), bucket `general` de Minimax, saldo + autonomía + cabecera de DeepSeek, errores de red/API | Al tocar `src/main/providers/*` o `http.js` |
| `test-credentials.js` | La cascada con **ficheros reales** en un HOME falso: variables de entorno, `~/.dsh/.credentials.yaml`, `~/.claude/.credentials.json` (con `expiresAt`), `~/.antigravity/auth.json` | Al añadir una fuente de credenciales o cambiar un formato |
| `test-accounts.js` | Varias cuentas por proveedor, ids estables y únicos, credencial por cuenta, guardar/leer, fallo de disco | Al tocar `instances.js` o `config.js` |
| `test-local.js` | `summary.js` (cabecera de la fila y menú), `jsonl-tokens` (respaldo de Claude), `script-path` (el `app.asar.unpacked` de `beta.3`), `hover.inside`, normalización de `config`, `settings.sanitizeAccounts/snapshot/test` | Al tocar cualquiera de esos módulos |
| `test-renderer.js` | `src/renderer/card.js` con un DOM mínimo: sin barra sin porcentaje, barra llena con lo consumido (saldo al revés), reinicio junto a su barra, punto con el tono de la cuota, `+N más`, `max-height`, pie | Al tocar la tarjeta |
| `test-release.js` | `scripts/release.js`: clasificación de commits, qué publica, versión base, numeración `beta.NNNN`, changelog | Al tocar el pipeline de releases |
| `test-updates.js` | `src/main/updates.js`: parseo y comparación de versiones (semver y betas), canales `auto`/`stable`/`beta`, qué es "más nueva", búsqueda con `fetch` simulado y errores de red | Al tocar la búsqueda de actualizaciones o los canales |
| `test-package.js` | `build.files`/`asarUnpack`: los `.ps1` viajan desempaquetados, el renderer va en el paquete | Al tocar `package.json` → `build` |
| `test-docs.js` | Documentación: enlaces relativos vivos, todo documento de `docs/` enlazado desde `docs/README.md`, cabecera (`Para quién`/`Responde a`/`Verificado`), tope de 300 líneas (el historial exento), índice de secciones al día en `STATUS.md`/`FINDINGS.md` y **cobertura de recetas** (toda tarea del README tiene fila) | Al añadir o mover documentos, al cambiar un título enlazado desde otro sitio, o al añadir una sección al README |

Fuera de `npm test`, porque hace red de verdad: `npm run test:ci-env`
(simula el runner de CI sin credenciales y sondea los proveedores).

**Cómo añadir una suite:** crea `scripts/test-<nombre>.js` con
`scripts/test-lib.js` (`t.fakeHome()` antes de cargar `src/`, `t.check()`,
`t.mockFetch()`, `t.finish()`). Se descubre sola: no hay que tocar
`package.json` ni el pipeline.

**Lo que NO cubren las pruebas** (hay que mirarlo con la app en marcha):
la colocación de la ventana (`card.position`), el sondeo del icono por UI
Automation (`hover.getTrayAnchor`), los `.ps1` y el watchdog de
`scripts/run.js`. Si tocas eso, `npm run preview` y una pasada a mano.

## Documentación: la regla de oro

Lo que se aprende trabajando **no se queda en la conversación**: se documenta en
`docs/`, en un formato que sirva igual a un humano y a un agente. El índice es
[docs/README.md](docs/README.md) y el método (qué se carga en cada tarea, dónde va
cada cosa, cómo se mantiene) está en [docs/METODOLOGIA.md](docs/METODOLOGIA.md).

- **Un dato, un sitio**: endpoint o cuota medida → `FINDINGS.md`; estado del
  proyecto → `STATUS.md`; historial ya cerrado → [docs/historial.md](docs/historial.md);
  regla de trabajo → este fichero; uso de la app → `README.md`; decisión durable →
  `docs/decisions/`; método → `docs/`. No se copia lo que ya dice otro documento: se
  enlaza.
- **Carga selectiva**: antes de abrir nada, la receta de la tarea
  ([§4](docs/METODOLOGIA.md#4-recetas-qué-cargar-según-la-tarea)). Los documentos
  largos (`STATUS.md`, `FINDINGS.md`, `docs/historial.md`) se leen **por secciones**:
  llevan una **tabla de secciones** al principio (H2 → línea) y se regenera con
  `node scripts/docs-metrics.js --fix <fichero>`. Nunca enteros.
- **La skill `usagia-docs`** (en `.agents/skills/` y en el perfil DSH) es el disparador:
  dice qué leer y dónde escribir. Su cuerpo apunta al índice; no repite el método.
- **Cada documento dice para quién es, a qué responde y cuándo se verificó.** Un
  documento sin fecha no se sabe si miente.
- **Un documento, un propósito**, y como mucho 300 líneas (el historial está exento:
  es de archivo). Si crece, se parte.
- El commit va como `docs:`, y `npm test` lo comprueba con `scripts/test-docs.js`:
  enlaces vivos, índice completo, cabecera, tamaño, índice de secciones al día y
  **cobertura de recetas** (toda tarea del README tiene su fila).

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
