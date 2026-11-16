# Estado de Usagia

> **Última actualización:** 2026-11-16 01:40 (Europe/Madrid).
> **Quién escribe este fichero ahora mismo:** la sesión `session-8a303ef4`
> ("Revisión a fondo del código"). Esta versión **fusiona** lo que escribió la
> sesión `session-e9f5038b` (lead, commit `60b9519`: verificación de la UI y
> de la app instalada de `beta.4`, estado del plan de Android) y le añade el
> estado de la cola de la revisión: los items **11, 13, 14, 15, 16 y 18**
> están ya **arreglados y empujados**, y queda **12** y **17**. Si al abrirlo
> la cabecera dice otra sesión, **fusiona su contenido** en vez de
> sobrescribirlo (ver [AGENTS.md](AGENTS.md), *Varias sesiones en el mismo
> repo*).
> Este fichero es la foto del proyecto *ahora mismo*: qué hay publicado, qué
> está a medias y qué toca después. Lo actualiza la sesión que trabaja en el
> repo (ver [Cómo mantener este fichero](#cómo-mantener-este-fichero)).
> Para la semántica de los endpoints manda [FINDINGS.md](FINDINGS.md); para las
> reglas de ramas, releases y reparto entre sesiones, [AGENTS.md](AGENTS.md).

## Resumen en una línea

App de bandeja (Electron) que muestra la cuota de Minimax, Claude, Antigravity
y DeepSeek. **Publicada en pre-release (`v1.0.0-beta.4`)**, sin versión
estable todavía. La revisión a fondo del código (9 commits) está **publicada y
verificada**; `beta` está a la par de `origin/beta` y el árbol está limpio.

## Sesiones activas en este repo (2026-11-16 01:40)

Cuatro sesiones de DSH están abiertas sobre este mismo repo y han recibido el
mismo encargo. **DSH no permite mensajes entre sesiones raíz distintas**
(`send_message` solo alcanza al mismo árbol de subagentes), así que la
coordinación es por el repo: cada una reserva sus ficheros aquí y fusiona en
lugar de pisar.

| Sesión | Título | Qué está haciendo | Ficheros reservados |
|---|---|---|---|
| `session-e9f5038b` (**esta**) | lead (documentación y verificación) | Cuadra los documentos con lo publicado, **verificó la UI** (tarjeta y configuración, con datos vivos) y verificó `beta.4` en la app instalada. Commiteó `de3d34f` | `STATUS.md`, `FINDINGS.md`, `README.md`, `AGENTS.md` |
| `session-8a303ef4` (**esta**) | Revisión a fondo del código | Los 9 commits de la revisión están publicados en `beta.4`. Ha cerrado la **cola**: items **11, 13, 14, 15, 16 y 18** hechos y empujados (`34aa4a9`, `41bcda2`, `140e31d`); quedan **12** (`safeStorage`) y **17** (código muerto). Verifica la UI con las vistas previas reales | `STATUS.md` · `scripts/run.js` · `scripts/test-*.js` · `src/main/hover.js` · `src/main/http.js` · `src/main/instances.js` · `src/main/local/antigravity-client.js` · `src/main/main.js` · `src/main/settings.js` · `src/renderer/settings.js` · `src/main/credentials.js` · `src/main/card.js` · `src/main/providers/*.js` · `package.json` |
| `session-fa207887` | Plan de Android | Plan cerrado y **actualizado el 2026-11-16** con las novedades de `beta.4` (Claude solo-OAuth, `test-parsers.js`, numeración de releases), commiteado en `59692d2`. La **implementación no ha empezado**: lo siguiente es ejecutar el plan por commits (F0-F6), empezando por el refactor del núcleo, que **no puede empezar hasta que la otra sesión libere `src/main/providers/*`**. Ver [Android: el plan y su estado](#android-el-plan-y-su-estado-2026-11-16) | `PLAN-ANDROID.md` (liberado) |
| `session-dab004c1` | Monitor de IAs en barra de tareas | La sesión larga del repo (21 turnos). Ahora **verifica la app ya instalada** de `beta.4` con un script propio (`Temp\test-beta4.ps1`) y saca capturas del tooltip | (no toca el repo: trabaja en `%TEMP%`) |

**Reglas de coordinación** (valen para todas; también en `AGENTS.md`):

1. `STATUS.md` **se fusiona, no se sobrescribe**: si otra sesión ya lo
   actualizó, incorpora lo que sabes y tú no.
2. Antes de editar un fichero, anótalo en la tabla de arriba.
3. Cada sesión commitea **solo lo suyo** (`git add` de ficheros concretos).
4. Los descubrimientos de endpoints o cuotas van a `FINDINGS.md`; el estado
   del proyecto, a `STATUS.md`.
5. Hay una tarea de coordinación compartida en el tablero de equipos
   (`task-1` en la sesión de documentación: *Actualizar STATUS.md sin pisar a
   las otras tres sesiones*). Ojo: el tablero es **por árbol de subagentes**,
   así que un mismo `task-1` puede ser una cosa distinta en cada sesión
   raíz; no lo tomes como referencia compartida.
6. **Antes de tocar un fichero que otro tiene reservado, espera a que se
   libere**: si `git status --porcelain` lo muestra modificado por otra
   sesión, no lo edites encima. Commitea tú lo tuyo y deja el fichero como
   estaba (comprobado el 2026-11-16 01:09: la otra sesión tenía `STATUS.md`
   y `AGENTS.md` a medias; se esperó a su commit `de3d34f` y se fusó encima).

## Versiones

| Qué | Valor | Nota |
|---|---|---|
| Última release publicada | **v1.0.0-beta.4** (2026-11-16 00:46 local) | Pre-release; Windows (NSIS + portable) y Linux (AppImage + deb) adjuntos. Publicada por el pipeline al empujar `beta` |
| Última release estable | **ninguna** | `main` nunca ha publicado; falta el primer `merge --ff-only beta` |
| Rama de trabajo `beta` | `60b9519` | **Igual que `origin/beta`**: 23 commits desde `deebebb`, todos empujados (la cola de la revisión, el arreglo de la vista previa y los docs) |
| Rama `main` | `deebebb` | 23 commits por detrás de `beta` |
| Rama por defecto en GitHub | `main` | Dependabot abre sus PR contra `main`, pero el PR #1 se creó contra `beta` |
| `package.json` | `0.0.0` | Correcto: la versión la pone semantic-release |
| Electron | **38.8.6** (instalado y en el lock) | El PR #1 de Dependabot propone 42.11.16 y está **cerrado sin fusionar** |

Releases: <https://github.com/carcheky/usagia/releases>

## Lo último: revisión a fondo del código (9 commits, ya en `v1.0.0-beta.4`)

Una segunda sesión de DSH revisó el repo entero el 2026-11-15 23:31 → 00:15 y
dejó 9 commits validados con commitlint (publicados en `v1.0.0-beta.4`):

| Commit | Qué arregla |
|---|---|
| `449b07c` fix | Ids **estables** para cuentas sin `id` (se derivan de `proveedor:etiqueta`); antes cada lectura generaba uno aleatorio |
| `44a19ea` fix | **Claude**: en Windows el script DPAPI se ejecuta aunque no haya token en `~/.claude/.credentials.json`; la clave API (`sk-ant-api…`) ya no bloquea la sesión y se avisa; el motivo de caer a "local" va en la nota; el `.ps1` escribe los errores en una línea UTF-8 |
| `ef99d53` fix | **Antigravity**: el JSON pegado a mano se parseaba como `Bearer` en vez de como credencial |
| `419c7f0` fix | `refreshSeconds` se aplicaba al guardar (antes no tenía efecto hasta reiniciar) |
| `abf24bf` fix | Fallo de disco al guardar: la ventana decía "Guardado" aunque no se hubiera escrito |
| `031c693` fix | Desactivar una cuenta no atenuaba su fila |
| `c6c2e9f` fix | La tarjeta no se recolocaba al cambiar el ancla del icono |
| `4a0ad65` fix | `pct100(null)` devolvía `0` ("agotado") cuando el porcentaje venía ausente |
| `3205e12` test | `scripts/test-parsers.js`: 16 pruebas puras (regresión "1 % vs 100 %", `parseUsage`, `parseSummary`, `parseYamlMappings`…); entra en `npm test` y en el job `verify` |

**Estado de las pruebas** (ejecutadas el 2026-11-16 01:36 sobre `60b9519`):
`npm test` → **OK** (32 pruebas: cuentas + parsers) · `npm run test:package` →
**OK**.

**Cómo lanzar las vistas previas desde una sesión de DSH** (Electron no
arranca solo, con `GPU process launch failed: error_code=18`, pero **sí** con
la GPU apagada):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$e = (node -p "require('electron')")
& $e --disable-gpu --disable-gpu-sandbox --no-sandbox . --preview    # tarjeta
& $e --disable-gpu --disable-gpu-sandbox --no-sandbox . --settings   # configuracion
```

Los errores de caché de GPU que salen son ruido: la app funciona igual. Sin
esto, `npm run preview` y `preview:settings` no se pueden ejecutar desde una
sesión de DSH.

## Cola de la revisión a fondo: lo que queda (items 12 y 17)

Del informe de la revisión eran ocho puntos, todos de robustez, seguridad o
limpieza (no había ningún fallo funcional abierto de los items 1-7, ya
publicados en `beta.4`). La sesión `session-8a303ef4` los ha ido cerrando:

| # | Qué | Dónde | Estado |
|---|---|---|---|
| 11 | El watchdog no mata a Electron en `SIGTERM` y el contador de reinicios nunca vuelve a 0 | `scripts/run.js` | **ARREGLADO** (`41bcda2`): mata al hijo (SIGTERM y, si no, SIGKILL), cuenta rachas y no solapa hijos |
| 13 | `sandbox: false` en las dos ventanas | `src/main/card.js`, `src/main/settings.js` | **ARREGLADO** (`34aa4a9`): los preloads solo usan `contextBridge`/`ipcRenderer` |
| 14 | La comprobación de ruta del protocolo `app://` no exige separador | `src/main/main.js` | **ARREGLADO** (`140e31d`): `target !== root && !target.startsWith(root + path.sep)` |
| 15 | PowerShell + UI Automation cada 10 s para localizar el icono | `src/main/hover.js` | **ARREGLADO** (`140e31d`): caché de 60 s (20 s si está en "ocultos", 5 s si falla), consultas en vuelo compartidas e invalidación al cambiar las pantallas |
| 16 | `app.asar` de Antigravity entero en memoria | `src/main/local/antigravity-client.js` | **ARREGLADO** (`140e31d`): lectura por trozos de 1 MiB con solape (275 MB → 59 MB de RSS en un fichero de 120 MB) |
| 18 | `build.files` mete scripts de test en el instalador | `package.json` | **ARREGLADO** (`34aa4a9`): solo viajan los `.ps1` que la app ejecuta, y `test-package.js` lo comprueba |
| 12 | Credenciales en texto plano en `config.json` | `src/main/credentials.js`, `src/main/settings.js`, `src/renderer/settings.js` | **PENDIENTE**: Electron trae `safeStorage` (DPAPI en Windows, Keychain en mac): cifrar al guardar y descifrar al leer |
| 17 | Código muerto y duplicación | varios | **PENDIENTE**: `locale` sin usar, `gemini` sin proveedor, `isInteractive`/`CARD_WIDTH`/`describe()` sin consumidores, `--probe` duplicado en `main.js`, `formatTokens` copiado en `claude.js` y `deepseek.js`, bloque de métrica de porcentaje repetido 4 veces |
| 18-bis | Sin linter | `package.json`, `.github/workflows/release.yml` | **DECISIÓN PENDIENTE**: añadir ESLint + un job de CI es un cambio de tooling que conviene decidir antes de tocar el pipeline |

Verificado el 2026-11-16 01:36 sobre `60b9519`: `npm test` → **OK** y
`npm run test:package` → **OK**. Además, las **dos vistas previas funcionan**
en este entorno con `ELECTRON_RUN_AS_NODE` vacío y
`--disable-gpu --disable-gpu-sandbox --no-sandbox`: la tarjeta se pinta con
datos vivos y la ventana de configuración responde a *Probar* y a *Guardar*.

### Ficheros sin commitear en el árbol (2026-11-16 01:40)

`session-8a303ef4` **no deja nada sin commitear**: todo lo suyo está en
`34aa4a9`, `41bcda2` y `140e31d`, y empujado. Los ficheros que quedan
modificados en el árbol son de **`session-e9f5038b`** (lead), que sigue
trabajando:

`scripts/run.js` (añadir `--settings` a `ONE_SHOT`) ·
`scripts/test-accounts.js` · `scripts/test-parsers.js` · `src/main/http.js` ·
`src/main/instances.js` (`uniqueIds`: ids únicos por cuenta) ·
`src/main/main.js` (bloque `disable-gpu` para las vistas previas) ·
`src/main/settings.js` · `src/renderer/settings.js` · `preview-card.png`

> **Ninguna otra sesión debe tocar esos ficheros** hasta que se commiteen.
> Cuando se commitee, la cola de la revisión baja a los items **12** y **17**.

Commits nuevos desde la última actualización de este fichero:

| Commit | Qué |
|---|---|
| `41bcda2` fix | El watchdog mata al hijo al cerrarse, cuenta rachas de caídas y distingue morir por señal de cerrar limpio (item 11) |
| `140e31d` perf | El sondeo de la bandeja no lanza PowerShell cada 10 s, el `app.asar` se lee por trozos y la ruta del protocolo `app://` exige el separador (items 15, 16 y 14) |
| `34aa4a9` fix | El renderer va con `sandbox: true` y el instalador sin los guiones de prueba (items 13 y 18) |
| `60b9519` docs | La fusión del estado de las cuatro sesiones, con la verificación de la UI y de la app instalada de `beta.4` |
| `59692d2` docs | El plan de Android y el estado del proyecto, actualizados con las novedades de `beta.4` |
| `fcb920f` docs | La cola de la revisión y la reserva de ficheros entre sesiones |

## Android: el plan y su estado (2026-11-16)

El plan completo está en [PLAN-ANDROID.md](PLAN-ANDROID.md) (se actualizó hoy
con las novedades de `beta.4`). En corto:

- **Decisión**: app Android con **Capacitor 8** que reutiliza la tarjeta y la
  ventana de configuración actuales, con los proveedores movidos a un núcleo
  JS compartido (`src/core/`) que no depende de Node ni de Electron. Electron
  no existe para Android, así que hoy **no hay nada que compilar**: el trabajo
  es crear la app **y** añadirla al pipeline.
- **Pipeline**: dos jobs nuevos en `.github/workflows/release.yml`:
  `verify-android` (**antes** de semantic-release, para que no nazca una
  release sin APK: el tag es irreversible) y `build-android` (después, como
  `build-windows`/`build-linux`: compila el tag, firma, y adjunta
  `Usagia-<v>-android.apk` + `.sha256`).
- **Firma**: **una sola clave**, para `beta` y `main` (si cambia, Android no
  actualiza y hay que desinstalar). Se genera en local y vive en 4 secrets;
  nunca en el repo.
- **`versionCode` derivado del tag** (`1.0.0-beta.5 → 1000005`,
  `1.0.0 → 1000099`): la estable actualiza encima de la beta.

**Qué cambió en el plan al actualizarlo hoy** (y por qué importa):

1. **Claude solo se consulta con un token OAuth** (`sk-ant-oat…`): las claves
   API se descartan y se avisa en la nota. En Android eso deja a Claude
   **sin respaldo** (no hay sesión local ni transcripciones), así que el plan
   lo marca como limitación real, no como algo que "funciona".
2. **`npm test` ahora incluye `scripts/test-parsers.js`**: el plan lo tenía
   como "intocable" y es la única excepción (hay que repuntar sus `require`
   al mover el núcleo). Además confirma que casi todo el núcleo **ya es puro
   y está probado** (`parseUsage`, `parseSummary`, `isOauthToken`,
   `manualKind`, `extractPairs`, `pct100`…), lo que reduce el refactor a mover
   código.
3. **Numeración**: lo publicado es `v1.0.0-beta.4`, así que el siguiente
   push de la implementación sería `beta.5` y el primer estable `v1.0.0`.

**Estado real: la implementación no ha empezado.** Lo único que se puede
hacer ya, sin depender de nadie, es **F0** (generar el keystore, guardarlo
fuera del repo y crear los 4 secrets).

**Choque de ficheros que hay que respetar**: el paso F1 del plan (mover los
proveedores a `src/core/`) toca `src/main/providers/*.js`,
`src/main/http.js` y `package.json`, que la sesión `session-8a303ef4` tiene
**reservados** para los items 11-18 de la cola de la revisión. Secuencia:
F1 **no** empieza hasta que sus commits estén dentro. Además, el item 17
(`formatTokens` duplicado en `claude.js` y `deepseek.js`, bloque de métrica
repetido 4 veces) es justo lo que el núcleo shared elimina: si esa sesión lo
arregla primero, el plan hereda el arreglo; si no, lo deshace al mover el
código. Lo ideal es hacerlo **después**.

**Sobre el tablero de tareas**: desde esta sesión las herramientas
`team_task_*` no están expuestas, así que la coordinación con las otras
sesiones raíz se ha hecho **por el repo**, que es el canal que fija
`AGENTS.md`. El `task-1` que mencionan las reglas es **por árbol de
subagentes**: cada sesión raíz tiene el suyo y no son el mismo.

## Verificación de la UI (2026-11-16 00:42, esta sesión)

Con `danger-full-access` y arrancando Electron con `--disable-gpu`
(`ELECTRON_RUN_AS_NODE` vacío), **las dos vistas previas funcionan** y se
comprobó a ojo:

- **Tarjeta**: Minimax 45 % / 78 % usado (datos vivos del harness), Antigravity
  15,4 % (credenciales de Windows), DeepSeek $33,64 + ¥4,65, y Claude cayendo
  a transcripciones locales **avisando del motivo** ("cuota remota no
  disponible: …"): el arreglo del otro agente funcionando.
- **Configuración**: la ventana abre, el botón *Probar* responde
  ("ventana 5 h: 46 % usado · semanal: 78 % usado") y *Guardar* escribe. Las
  ayudas muestran ya el texto nuevo de Claude ("Token OAuth (sk-ant-oat…)…
  una clave API sk-ant-api no sirve para la cuota").

**Bug encontrado y corregido al verificarlo**: `npm run preview` y
`npm run preview:settings` **morían en silencio** (código 0, sin una línea de
salida) si la app estaba en marcha, porque el bloqueo de instancia única se
aplicaba también a las vistas previas. `--probe` ya estaba exento; ahora lo
están las vistas previas (`isPreviewMode()` en `src/main/main.js`) y, además,
el segundo arranque de la app dice por qué se cierra en vez de morir mudo.

## Qué funciona (verificado)

- **Proveedores**: Minimax, Claude, Antigravity y DeepSeek, con los endpoints
  y la semántica de [FINDINGS.md](FINDINGS.md). Los porcentajes se
  normalizan a "usado" con escala fija por proveedor (`pct100()`).
- **Varias cuentas por proveedor** con ventana de configuración (⚙), cada
  una con su credencial e interruptor (desde `v1.0.0-beta.2`).
- **Cascada de credenciales** sin claves propias: cuenta → entorno → harness
  DSH → almacenes nativos (credstore de Windows, caché cifrada de Claude
  Desktop, token OAuth de Claude Code).
- **Empaquetado**: los `.ps1` que la app ejecuta viajan desempaquetados del
  asar (arreglado en `beta.3`; antes la tarjeta no salía en la app instalada).
- **Pipeline de releases**: `commits` → `verify` → `release` → `build-windows`
  + `build-linux`, con commitlint y semantic-release. Cuatro pre-releases
  publicadas sin intervención manual.

## Pendiente / siguiente

1. **Primera versión estable**: `beta.4` ya está publicada y verificada; falta
   `git switch main && git merge --ff-only beta && git push origin main` →
   `v1.0.0`. Falta una comprobación: que la tarjeta salga en la **app
   instalada** (el fallo que arregló `beta.3`). La está haciendo la sesión
   `session-dab004c1` con un script propio sobre el binario de `beta.4`.
2. **Decidir lo de Electron**: el PR #1 de Dependabot (38.8.6 → 42.11.16) está
   **cerrado sin fusionar** y la rama sigue viva. GitHub avisa de **34
   vulnerabilidades** (11 altas, 16 moderadas, 7 bajas) en `main`, casi todas
   de Electron 38. O se vuelve a abrir el PR y se sube Electron, o se acepta
   el riesgo y se documenta. Decisión del usuario.
3. **Android**: el **plan** está escrito y **actualizado** en
   [PLAN-ANDROID.md](PLAN-ANDROID.md) (Capacitor 8 + núcleo JS compartido +
   jobs `verify-android`/`build-android`), pero la **implementación no ha
   empezado**: hoy no hay nada que compilar para Android. Detalle y secuencia
   en [Android: el plan y su estado](#android-el-plan-y-su-estado-2026-11-16).
   Siguiente paso: **F0** (keystore + secrets, no depende de nadie) y luego
   **F1**, que espera a que la sesión `session-8a303ef4` libere
   `src/main/providers/*`.
4. **macOS**: el código contempla la plataforma, pero el pipeline **no genera
   binarios de macOS** (solo Windows y Linux).
5. **Cola de la revisión a fondo**: quedan solo el **12** (cifrar las
   credenciales con `safeStorage`) y el **17** (código muerto y duplicación);
   los items 11, 13, 14, 15, 16 y 18 ya están **arreglados y empujados**
   (`34aa4a9`, `41bcda2`, `140e31d`). Tabla completa en
   [Cola de la revisión a fondo](#cola-de-la-revisión-a-fondo-lo-que-queda-items-12-y-17).
   Ninguno bloquea una release: son robustez, seguridad y limpieza. La sesión
   `session-8a303ef4` los tiene reservados.
6. **Linter**: no hay ESLint ni formateador, y el bug de `!enabled` (arreglado
   en `031c693`) lo habría cazado. Añadirlo toca el pipeline, así que es
   decisión del usuario antes de meter un job de CI nuevo.

## Puntos abiertos y riesgos conocidos

Detalle en [FINDINGS.md §4](FINDINGS.md).

- Los endpoints de cuota de **Claude** y **Antigravity no son públicos** y
  pueden cambiar sin aviso. El de Claude admite ~5 peticiones por ventana
  (429) y **ahora mismo está devolviendo 429**; la app cachea 10 min.
- La cuota de Claude **solo se consulta con un token OAuth** (`sk-ant-oat…`).
  Una clave API no vale, y la app lo dice en la nota en vez de fallar en
  silencio.
- **Antigravity** sirve para monitorizar cuota, **no** como ruta de inferencia
  (`generateContent` devuelve 429/403).
- El token OAuth de Claude **caduca el 2026-12-04**; lo renueva Claude Desktop
  al usarlo. Si no, hay que reloguear la app de Claude.
- El descifrado de la caché de Claude Desktop necesita **PowerShell 7**
  (`pwsh`): Windows PowerShell 5.1 no trae `AesGcm`.
- Si `ELECTRON_RUN_AS_NODE=1` está en el entorno, Electron arranca como Node
  y **no abre ventanas** (síntoma: `bad option: --preview`). Limpiar la variable
  antes de `npm start` / `npm run preview`.
- **Electron 38.8.6** es la versión en uso (instalada y en el lock) y GitHub
  reporta **34 vulnerabilidades** en `main` (11 altas) de las dependencias de
  Electron. El salto a 42.11.16 quedó en el PR #1 de Dependabot, **cerrado sin
  fusionar**. Decisión pendiente del usuario.

## Límites del sandbox de DSH al medir (no son fallos de la app)

Documentados en detalle en [FINDINGS.md §3](FINDINGS.md):

- `npm run probe` da **`spawn EPERM`** en Claude y Antigravity: el sandbox no
  deja que Node lance un hijo capturando su salida por tubería.
- **PowerShell no puede hacer HTTPS** dentro del sandbox (error de TLS contra
  todos los hosts), aunque el `fetch` de Node sí funciona. El `.ps1` de Claude
  descifra bien la caché; lo que falla es el TLS de PowerShell.
- **Electron no arranca** en el sandbox (`error_code=18`): los `preview` hay que
  lanzarlos fuera.

## Reparto entre sesiones (acuerdo)

Ver [Sesiones activas en este repo](#sesiones-activas-en-este-repo-2026-11-16-0140),
que es la tabla viva. En corto:

- **DSH no permite mensajes entre sesiones raíz distintas**: `send_message`
  solo funciona dentro del mismo árbol de subagentes. El canal entre sesiones
  es **el repo**.
- **El tablero de tareas del equipo no se comparte entre sesiones raíz**
  (cada una tiene su propio `task-1`): no sirve para coordinarse entre
  sesiones, solo dentro de un mismo árbol de subagentes.
- `STATUS.md` (este fichero): estado del proyecto.
- `FINDINGS.md`: endpoints, semántica y valores medidos. Fuente única.
- `README.md` / `AGENTS.md`: cómo se usa y cómo se trabaja en el repo.
- Regla adoptada (escrita en `AGENTS.md`): al empezar, leer `STATUS.md`; un
  fichero, un dueño; **fusionar en vez de sobrescribir**; no commitear trabajo
  ajeno; y al terminar, actualizar `STATUS.md`.
- **Anota tu fila en la tabla antes de tocar un fichero**, y si el fichero
  aparece modificado en `git status --porcelain` porque otra sesión lo tiene
  a medias, espera a su commit en vez de editarlo encima (el 2026-11-16
  01:09 pasó con `STATUS.md` y `AGENTS.md`).

## Historial de releases

| Versión | Fecha | Contenido |
|---|---|---|
| v1.0.0-beta.4 | 2026-11-16 | La revisión a fondo completa (9 commits: Claude, Antigravity, ids de cuenta, guardado, `pct100(null)`, tests de parsers) + el arreglo de la vista previa que moría en silencio |
| v1.0.0-beta.3 | 2026-11-15 | fix: los scripts de PowerShell no viajaban en el paquete (la tarjeta no salía en la app instalada) |
| v1.0.0-beta.2 | 2026-11-15 | feat: ventana de configuración con varias cuentas por proveedor · fix: el script de publicación espera a la run en curso |
| v1.0.0-beta.1 | 2026-11-15 | feat: app de bandeja inicial · fixes de empaquetado Linux, nombres de artefacto, sondeo del CI y rango de commitlint |

## Cómo mantener este fichero

Al terminar cada sesión de trabajo sobre el repo:

1. Actualiza la **fecha** de cabecera.
2. Revisa **Versiones** con `git log --oneline -5`, `git status --porcelain`
   y <https://api.github.com/repos/carcheky/usagia/releases?per_page=3>.
3. Mueve lo que se haya cerrado de **Pendiente** a **Qué funciona** o al
   **Historial de releases**; añade lo nuevo que quede a medias.
4. Si descubres algo sobre un endpoint o una cuota, va a **FINDINGS.md**, no
   aquí: este fichero solo enlaza.
5. Commit como `docs: actualiza STATUS.md` (no publica release).
