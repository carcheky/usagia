# Estado de Usagia

> **Última actualización:** 2026-11-16 20:22 (Europe/Madrid).
> **Quién escribe este fichero ahora mismo:** sesión principal (item 7 de pendientes).
> Ver [Lo último: respaldo de GPU en modos one-shot](#lo-último-respaldo-de-gpu-en-modos-one-shot-2026-11-16-2022).
> **Ojo: hay otra sesión activa** en este repo (la del *onboarding* de cuentas, con su
> propuesta en `openspec/changes/2026-11-16-onboarding-cuentas/`): **no se ha tocado nada
> suyo**. Este fichero se ha **fusionado**, no reescrito.
> Este fichero es la foto del proyecto *ahora mismo*: qué hay publicado, qué está a medias y
> qué toca después. Lo actualiza la sesión que trabaja en el repo (ver
> [Cómo mantener este fichero](#cómo-mantener-este-fichero)).
> Para la semántica de los endpoints manda [FINDINGS.md](FINDINGS.md); para las reglas de
> ramas, releases y reparto entre sesiones, [AGENTS.md](AGENTS.md); para el método de
> documentación, [docs/README.md](docs/README.md).
> El **historial por fases** (lo ya cerrado) está en
> [docs/historial.md](docs/historial.md): este fichero ya no lo arrastra.

<!-- índice-de-secciones: generado con `node scripts/docs-metrics.js --index <fichero>` -->
| Sección | Línea |
|---|---|
| Lo último: items 12 y 17 completados (2026-11-16 20:50) | 43 |
| Lo último: respaldo de GPU en modos one-shot (2026-11-16 20:22) | 71 |
| Lo último: el sandbox ya no manda (2026-11-16 19:30) | 91 |
| Lo último: los extras no cuentan (Claude) (2026-11-16 19:05) | 132 |
| Lo último: documentación para humanos y agentes (2026-11-16 18:50) | 171 |
| Lo último: el ⚙ baja al pie de la tarjeta (2026-11-16 18:55) | 204 |
| Resumen en una línea | 226 |
| Sesiones activas en este repo (2026-11-16 18:45) | 237 |
| Versiones | 285 |
| Cola de la revisión a fondo: completada (2026-11-16 20:50) | 317 |
| Qué funciona (verificado) | 337 |
| Pendiente / siguiente | 356 |
| Puntos abiertos y riesgos conocidos | 386 |
| Límites del entorno de DSH al medir (no son fallos de la app) | 410 |
| Reparto entre sesiones (acuerdo) | 429 |
| Cómo mantener este fichero | 451 |
| Decisiones que son del usuario | 464 |
| Notas para quien siga | 471 |
| Retomar (en 5 minutos) | 478 |
| Actualización automática desde la app (2026-11-16 18:45) | 493 |
<!-- fin-índice -->

## Lo último: items 12 y 17 completados (2026-11-16 20:50)

**Encargo:** "siguiente pendiente" → items 12 y 17 de la cola de revisión.

**Item 17 — código muerto y duplicación (`6f82da5`):**
- `config.js`: quitado `locale` de `DEFAULTS` (no se usaba)
- `credentials.js`: quitado `gemini` de `ENV_KEYS`/`fromDsh` (no hay proveedor)
- `credentials.js`: quitado export de `dshCredentials` (solo interno)
- `card.js`: quitados `isInteractive()` y export `CARD_WIDTH` (sin consumidores)
- `antigravity-client.js`: quitado export `describe()` (sin consumidores)
- `http.js`: movido `formatTokens` aquí (estaba duplicado en `claude.js`/`deepseek.js`)

**Item 12 — credenciales cifradas con safeStorage (`4cdc332`):**
- Nuevo módulo `src/main/crypto.js` que encapsula `safeStorage` de Electron
- En Electron: usa DPAPI (Windows), Keychain (macOS), keyring (Linux)
- En Node puro (`scripts/probe.js`, CI): las credenciales cifradas se marcan
  con `_encrypted` pero no se pueden descifrar (la cascada las salta)
- Formato `enc:v1:<base64>`, compatible con credenciales en claro existentes
- Nueva suite `scripts/test-crypto.js` (8 tests)

**Lo que quedó fuera:** el modo `--probe` de `main.js` duplica `scripts/probe.js`.
No es código muerto (ambos funcionan), solo duplicación intencionada que
requeriría cambios más profundos.

**Verificado:** `npm test` → **12 suites en verde** (nueva: `test-crypto.js`).

---

## Lo último: respaldo de GPU en modos one-shot (2026-11-16 20:22)

**Encargo:** "siguiente pendiente" → item 7 de [Pendiente / siguiente](#pendiente--siguiente).

**El problema:** `scripts/run.js` tiene un respaldo que relanza Electron sin GPU
cuando muere con `0x80000003` (GPU no utilizable). Funcionaba para la app de larga
vida, pero los modos one-shot (`--preview`, `--settings`, `--probe`) salían con ese
código **sin reintentar**, porque el `if (ONE_SHOT)` estaba *antes* del `if (GPU_FATAL)`.

**El fix (`951e478`):** mover la comprobación de GPU_FATAL_CODE al principio del
manejador de exit. Así los modos one-shot también se benefician de un único
reintento sin GPU antes de salir.

**La prueba:** nueva suite `scripts/test-run.js` (9 casos, se descubre sola). Fija el
comportamiento y documenta la regresión.

**Verificado:** `npm test` → **11 suites en verde** (la nueva incluida).

---

## Lo último: el sandbox ya no manda (2026-11-16 19:30)

**Pregunta del usuario:** *"toda la documentación está correctamente actualizada?"*,
después de cambiar la política de aprobación de **`ask`** a **`never`**.

**Lo que había:** la documentación del repo daba por hecho que las sesiones de
DSH corren con sandbox `workspace-write` y que eso impone tres límites
(`spawn EPERM`, HTTPS de PowerShell, Electron que no arranca). Eran **del
sandbox**, no de la app.

**Lo que se ha verificado** (medido el 2026-11-16 19:29, preset
`danger-full-access` + `approval: never`):

| Comprobación | Antes | Ahora |
|---|---|---|
| `npm run probe` | `spawn EPERM` en Claude y Antigravity | **los cuatro en `ok`** |
| HTTPS desde PowerShell | error de TLS | **200 OK** |
| Proceso hijo por tubería | named pipe denegada | **funciona** |
| `npm run preview` | moría (`error_code=18`) | **sigue muriendo, por la GPU** (`0x80000003`) |

**Lo que se ha tocado:**

- [FINDINGS.md](FINDINGS.md): la subsection de los límites lleva la marca de que
  se midió con `workspace-write`, y hay una nueva con la medición de las 19:30.
- [STATUS.md](#límites-del-entorno-de-dsh-al-medir-no-son-fallos-de-la-app): la
  sección se reescribe con el estado real.
- `~/.dsh/skills/refresh-model-catalog/SKILL.md`: ya no pide elevación de
  sandbox (con `approval: never` **se rechaza sola**); dice qué hacer en su lugar.
- `~/.dsh/AGENTS.md`: sección nueva **"Permisos y aprobaciones"**, con el aviso de
  que el interruptor de la GUI es **por sesión** y lo que lo hace durable es
  `defaultPreset` del perfil.
- `~/.dsh/profiles/desktop/cordis.patch.yml` (bloque `permission`): los tres
  presets pasan a `approval: never` y `defaultPreset` a `danger-full-access`,
  para que **las sesiones nuevas ya no pregunten**.

**Lo que queda (no es documentación):** `scripts/run.js` solo relanza sin GPU en
la app de larga vida; los modos de una sola vez (`--preview`, `--settings`,
`--probe`) **no llegan a ese relanzamiento**, así que `npm run preview` no
aprovecha el respaldo que el propio script tiene. Es un `fix:` (con su prueba,
según la regla del repo), no un cambio de texto.

## Lo último: los extras no cuentan (Claude) (2026-11-16 19:05)

**Pregunta del usuario:** *"te parece correcto claude? intuitivo? o sea tengo mi
cuota normal de 5h libre, y me pones 100 % lleno y el icono en la bandeja
amarillo"*, y luego la regla: *"la cuota de 5 h y semanal es la que cuenta
para la media global en las IAs que consumen así; lo demás son extras"*.

**Lo que pasaba:** el "100 %" era **real**, no un bug. La respuesta cruda del
endpoint de Claude (medida el 2026-11-16 18:45, en
[FINDINGS.md §3](FINDINGS.md#3-valores-verificados-2026-11-15-1435)) trae tres
límites: `session` (5 h) al 20 %, `weekly_all` al 61 % y **`weekly_scoped` al
100 %**, que es el **tope semanal del modelo "Fable"** (`is_active: true`,
`severity: critical`). Ese tope es un **extra**: solo afecta a ese modelo, y
`weekly_scoped_shares` dice que le dan 50 de los 100 puntos de la semanal.

**Lo que se ha cambiado** (`fix:` en `beta`, publicado en `v1.1.0-beta.0007`):

| | Antes | Ahora |
|---|---|---|
| Cabecera de la fila de Claude | "100 % usado · semanal Fable" | **"61 % usado · semanal"** |
| Punto de la fila | amarillo | **verde** |
| Icono de la bandeja | **amarillo** | **verde** |
| Fila del extra | "semanal Fable · 100 % usado" (sin reinicio) | **"Fable (tope semanal) · 100 % usado ↻ 18/11, 17:59"** |
| Nota | — | "Fable: tope semanal del modelo agotado (extra: no cuenta para la cuota general)" |

**Dónde:** `src/main/availability.js` (`countingMetrics()`: los topes con
ámbito no entran en la media, ni en las ventanas agotadas, ni en el color),
`src/main/summary.js` y `src/main/tooltip.js` (cabecera y tooltip usan las
ventanas que cuentan), `src/main/providers/claude.js` (reinicio del extra y la
nota que lo explica).

**Pruebas:** `scripts/test-parsers.js` y `scripts/test-local.js` fijan la
regla (el extra no cuenta; si solo hay extras, cuentan). `npm test` → **10
suites en verde**. Comprobado con **datos vivos**: la cabecera sale "61 % usado
· semanal", el icono "ok" (verde) y la fila del extra con su reinicio.

**Lo que NO se ha perdido:** el extra se sigue viendo entero (barra roja, su
reinicio, su nota). Solo deja de ponderar el estado global.

## Lo último: documentación para humanos y agentes (2026-11-16 18:50)


**Encargo:** "la regla de oro del agente es documentar todo debidamente en una carpeta
human/ia oriented, siguiendo una metodología de carga documental selectiva según la tarea",
y después: "las quiero todas" (las cinco mejoras del ahorro), **con OpenSpec**.

**Lo hecho (segunda tanda, tras medir el ahorro real):**

| # | Mejora | Dónde | Efecto |
|---|---|---|---|
| 1 | **Partir `STATUS.md`**: estado actual arriba, historial por fases abajo | [STATUS.md](STATUS.md) + [docs/historial.md](docs/historial.md) | 1.078 → 379 líneas; el peor caso ("retomar") del 75 % al 86 % |
| 2 | **Skill DSH `usagia-docs`**: el método como divulgación progresiva nativa | [`.agents/skills/usagia-docs/SKILL.md`](.agents/skills/usagia-docs/SKILL.md) (y en el perfil) | Se activa sola; ya está en el catálogo de skills |
| 3 | **Índice de secciones** (H2 → línea) en los documentos largos | `STATUS.md`, `FINDINGS.md`, `docs/historial.md` | Se leen por fragmentos |
| 4 | **Recetas completas**: 12 → 18, con lo que **no** hace falta leer | [METODOLOGIA §4](docs/METODOLOGIA.md#4-recetas-qué-cargar-según-la-tarea) | Cubre hover, NSIS, logs, `config.json`, probe y credenciales |
| 5 | **Prueba de cobertura de recetas** + índice de secciones | `scripts/test-docs.js` | Las recetas no pueden pudrirse en silencio |

**Medido** (`node scripts/docs-metrics.js`): la raíz cuesta **22.338 tokens** y la receta
**2.935**: **87 %** de ahorro de media, 86 % en el peor caso real (Android, 68 %, es la
excepción: el plan se lee entero).

**Además**: `scripts/docs-metrics.js` (mide y genera los índices), el ADR
[0002](docs/decisions/0002-skill-y-reparto-del-contexto.md) y el cambio de OpenSpec en
[openspec/changes/archive/2026-11-16-docs-carga-selectiva/](openspec/changes/archive/2026-11-16-docs-carga-selectiva/).

**Lo que NO se ha tocado:** nada de `src/`. El trabajo de la otra sesión (la instalación
de actualizaciones) quedó commiteado por ella (`c9c9111`, `f446fcc`, `b97518c`) y esta
sesión **no lo ha tocado**. `npm test` → **10 suites en verde**.

**Push:** commiteado en `beta` (`36d831e`) y **empujado**: el árbol estaba limpio (la otra
sesión había cerrado su trabajo), así que cumplía la regla del repo. Es un `docs:`: **no
publica release**.

## Lo último: el ⚙ baja al pie de la tarjeta (2026-11-16 18:55)

**Pregunta del usuario:** si el único botón clicable de la UI es el de
configuración, ¿por qué no dejarlo abajo, al lado de la pista que sale al pasar
el ratón?

**Hecho:** el ⚙ baja de la cabecera al **pie** de la tarjeta, a la derecha de la
pista (`src/renderer/card.html`, `card.css`, `card.js`). La cabecera se queda
solo con el título y la hora; el pie es ahora una fila con la pista y el botón.
Como el botón está al lado, la pista ya no lo nombra ("⚙ para configurar"
desaparece del texto).

**Por qué:** el ⚙ es el único botón de la tarjeta, y arriba competía con el
título y la hora; abajo queda pegado a la frase que explica cómo se usa, que
es justo donde el ojo ya está.

**Fijado con una prueba:** `scripts/test-renderer.js` comprueba que el botón
está en el `<footer>` y **no** en el `<header>` (que no vuelva a subir).

**Verificado:** `npm test` → 10 suites en verde; vista previa con datos vivos
(`preview-card.png`): el ⚙ sale en el pie, a la derecha de la pista.

## Resumen en una línea

App de bandeja (Electron) que muestra la cuota de Minimax, Claude, Antigravity
y DeepSeek. **Publicada**: `v1.0.0` (primera estable, 2026-11-16 12:43 local)
y la pre-release `v1.0.1-beta.0002`. La revisión a fondo del código está
**publicada y verificada**, y el **binario publicado de `beta.4`** se comprobó
de extremo a extremo (tarjeta al pasar el ratón + ⚙ → ventana de
configuración). **Nuevo**: la app **avisa de las versiones nuevas** (tarjeta,
menú, configuración y aviso del sistema) con **canal configurable**
(`auto`/`stable`/`beta`). `beta` está a la par de `origin/beta`.

## Sesiones activas en este repo (2026-11-16 18:45)

Varias sesiones de DSH trabajan sobre este mismo repo. **DSH no permite mensajes
entre sesiones raíz distintas** (`send_message` solo alcanza al mismo árbol de
subagentes), así que la coordinación es por el repo: cada una reserva sus
ficheros aquí y fusiona en lugar de pisar.

| Sesión | Estado | Ficheros reservados |
|---|---|---|
| `session-fa207887` | Plan de Android. **Pausa**: la implementación no ha empezado; lo siguiente es **F0** (keystore + secrets), que no depende de nadie | `PLAN-ANDROID.md` (liberado) · `STATUS.md` (fusionado) |
| `session-8a303ef4` | Revisión a fondo. **Pausa**: cola cerrada salvo los items **12** (`safeStorage`) y **17** (código muerto). Orden: **17 antes que 12**, y los dos antes que F1 (mueve `src/main/http.js` y `src/main/providers/*`) | `STATUS.md` · `scripts/run.js` · `scripts/test-*.js` · `src/main/hover.js` · `src/main/http.js` · `src/main/instances.js` · `src/main/local/antigravity-client.js` · `src/main/main.js` · `src/main/settings.js` · `src/renderer/settings.js` · `src/main/credentials.js` · `src/main/card.js` · `src/main/providers/*.js` · `package.json` |
| `session-dab004c1` | Monitor de IAs. **Pausa**: verificado el binario publicado de `beta.4` y `beta.6` (portable, con el ratón real). Le queda el instalador NSIS, el cuelgue de `preview:settings` y cuatro apuntes de revisión | (repositorio: sus cambios ya están dentro) |
| `session-onboarding` | **Activa**: propuesta de conectar cuentas en [openspec/changes/2026-11-16-onboarding-cuentas/](openspec/changes/2026-11-16-onboarding-cuentas/proposal.md). Además, instalación de actualizaciones en curso | `src/main/update-install.js` · `src/main/updates.js` · `src/preload/*` · `src/renderer/card.*` · `src/renderer/settings.*` · `scripts/test-updates.js` |
| `session-docs` (**esta**) | Documentación: `docs/` con índice y carga selectiva, `STATUS.md` partido en estado + historial, skill `usagia-docs`, `scripts/test-docs.js` y `scripts/docs-metrics.js` | `docs/` · `scripts/test-docs.js` · `scripts/docs-metrics.js` · `STATUS.md` · `FINDINGS.md` (solo el índice) · `AGENTS.md` · `.agents/skills/usagia-docs/` |
| `session-lead` | **Activa**: el ⚙ de la tarjeta baja al pie, al lado de la pista (ver *Lo último*), y la documentación del entorno tras el cambio de política de aprobación | `src/renderer/card.html` · `src/renderer/card.css` · `src/renderer/card.js` · `scripts/test-renderer.js` · `README.md` (interacción) · `STATUS.md` · `FINDINGS.md` (sección de entorno) |
| `session-cuota` (**esta**) | Cuota y extras: el tope con ámbito de Claude no cuenta para la media, la cabecera ni el icono | `src/main/availability.js` · `src/main/summary.js` · `src/main/tooltip.js` · `src/main/providers/claude.js` · `scripts/test-parsers.js` · `scripts/test-local.js` · `FINDINGS.md` (semántica del extra) · `STATUS.md` |

El detalle de cada sesión (qué hizo, con qué commits) está en
[docs/historial.md](docs/historial.md#pausa-del-día-2026-11-16-0200-qué-le-queda-a-cada-sesión).

> ✅ **Conflicto resuelto a la 01:55**: `session-dab004c1` y `session-8a303ef4`
> editaban `src/main/main.js`, `src/main/card.js` y `package.json` a la vez. Sus
> cambios están **commiteados juntos**, así que quien siga parte de `814b6f5`, no de
> un árbol con cambios a medias.
>
> ⚠️ **Ficheros tocados por `session-lead-quota`** (los mismos que tenía
> reservados `session-8a303ef4`): ya está todo commiteado.
> Ojo también a `preview-card.png`, que se regenera en cada vista previa (una
> ejecución interrumpida lo deja a **0 bytes**: se restaura con
> `git checkout -- preview-card.png`).

**Reglas de coordinación** (valen para todas; también en `AGENTS.md`):

1. `STATUS.md` **se fusiona, no se sobrescribe**: si otra sesión ya lo
   actualizó, incorpora lo que sabes y tú no.
2. Antes de editar un fichero, anótalo en la tabla de arriba.
3. Cada sesión commitea **solo lo suyo** (`git add` de ficheros concretos).
4. Los descubrimientos de endpoints o cuotas van a `FINDINGS.md`; el estado
   del proyecto, a `STATUS.md`.
5. El tablero de equipos **no se comparte entre sesiones raíz** (cada una tiene
   su propio `task-1`): sirve dentro de un mismo árbol de subagentes, no entre
   sesiones.
6. **Antes de tocar un fichero que otro tiene reservado, espera a que se
   libere**: si `git status --porcelain` lo muestra modificado por otra
   sesión, no lo edites encima. Commitea tú lo tuyo y deja el fichero como
   estaba (comprobado el 2026-11-16 01:09: la otra sesión tenía `STATUS.md`
   y `AGENTS.md` a medias; se esperó a su commit `de3d34f` y se fusó encima).

## Versiones

| Qué | Valor | Nota |
|---|---|---|
| Última release publicada | **v1.1.0-beta.0007** (2026-11-16 18:52 local) | Pre-release de los **extras** (`f7c04f9`, `fix:`). Pipeline **en verde**: commits, verify (`npm test`, 10 suites), release, builds de Windows y Linux |
| Última release estable | **v1.0.0** (2026-11-16 12:43 local) | La primera. Salió por el pipeline al empujar `main`; desde entonces las betas numeran `1.0.1-beta.NNNN`... y al entrar un `feat:` saltaron a `1.1.0-beta.NNNN` |
| Rama de trabajo `beta` | `f7c04f9` | Igual que `origin/beta`. Último commit: `fix:` de los extras (tope con ámbito de Claude) |
| Rama `main` | `c57d3df` | Publicó `v1.0.0`. `beta` va por delante |
| Rama por defecto en GitHub | `main` | Dependabot abre sus PR contra `main`, pero el PR #1 se creó contra `beta` |
| `package.json` | `0.0.0` | Correcto: la versión la pone `scripts/release.js` |

### Pipeline de releases (2026-11-16 12:40): fuera semantic-release

- **Por qué**: semantic-release no puede publicar `1.0.0-beta.0012` (semver no
  admite ceros a la izquierda). O publicaba `beta.12`, o si se renombraba
  después dejaba de ver la release anterior y volvía a empezar en `beta.1`.
  Además `GITHUB_TOKEN` no puede crear tags por `git push` ni por
  `POST /git/refs` (403), así que no hay forma de dejarle un tag "de
  referencia". Medido en las corridas #45–#49.
- **Ahora**: `scripts/release.js` (Node puro) numera desde las releases
  publicadas (`max + 1`, cuatro dígitos), redacta el changelog **solo** con
  `feat`/`fix`/`perf` y crea la release por la API (que crea el tag). Sin
  cambios de la app desde la release anterior, no publica (corrida #50).
  `npm run release:dry` lo simula en local.
- **Regla nueva**: los cambios del pipeline van como `ci:`, nunca `fix:`; de
  lo contrario aparecen en el changelog de la app.
- **Pendiente de ver pasar**: la primera release real por el script
  (`v1.0.0-beta.0011`) la generará el próximo `fix:`/`feat:` de la app.
| Electron | **38.8.6** (instalado y en el lock) | El PR #1 de Dependabot propone 42.11.16 y está **cerrado sin fusionar** |

Releases: <https://github.com/carcheky/usagia/releases>

## Cola de la revisión a fondo: completada (2026-11-16 20:50)

Del informe de la revisión eran ocho puntos, todos de robustez, seguridad o
limpieza. **Todos arreglados y publicados** (tabla completa en
[historial.md](docs/historial.md#cola-de-la-revisión-a-fondo-lo-que-queda-items-12-y-17)).

| # | Qué | Dónde | Estado |
|---|---|---|---|
| 17 | Código muerto y duplicación | varios | **ARREGLADO** (`6f82da5`): `locale`, `gemini`, `isInteractive`, `CARD_WIDTH`, `describe()` eliminados; `formatTokens` unificado en `http.js` |
| 12 | Credenciales en texto plano en `config.json` | `src/main/crypto.js`, `src/main/config.js` | **ARREGLADO** (`4cdc332`): nuevo módulo `crypto.js` con `safeStorage` (DPAPI/Keychain); formato `enc:v1:<base64>` compatible con claves en claro |
| 18-bis | Sin linter | `package.json`, `.github/workflows/release.yml` | **DECISIÓN DEL USUARIO**: añadir ESLint + un job de CI toca el pipeline |

**Lo que quedó fuera del item 17** (no es código muerto, es duplicación intencionada):
- El modo `--probe` de `main.js` duplica `scripts/probe.js`: ambos funcionan, uno
  dentro de Electron y otro en Node puro. Eliminar uno requiere cambios más
  profundos y no es prioritario.

Verificado el 2026-11-16 20:50 sobre `4cdc332`: `npm test` → **12 suites en verde**
(nueva: `test-crypto.js`).

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
  **Verificado en el binario publicado de `beta.4`** (portable descargado de
  la release): la tarjeta sale al pasar el ratón y el ⚙ abre la ventana de
  configuración.
- **Pipeline de releases**: `commits` → `verify` → `release` → `build-windows`
  + `build-linux`, con commitlint y semantic-release. Cuatro pre-releases
  publicadas sin intervención manual.

## Pendiente / siguiente

1. **Instalación con el instalador NSIS**: nadie lo ha instalado todavía. Lo que falta
   es probarlo con la ruta fija (el portable extrae a una carpeta distinta en cada
   arranque y el icono vuelve a *iconos ocultos*).
2. **Decidir lo de Electron**: el PR #1 de Dependabot (38.8.6 → 42.11.16) está
   **cerrado sin fusionar** y la rama sigue viva. GitHub avisa de **34
   vulnerabilidades** (11 altas, 16 moderadas, 7 bajas) en `main`, casi todas
   de Electron 38. O se vuelve a abrir el PR y se sube Electron, o se acepta
   el riesgo y se documenta. Decisión del usuario.
3. ~~**Android**~~: **DESCARTADO** por coste. El plan está en
   [PLAN-ANDROID.md](PLAN-ANDROID.md) por si se retoma en el futuro.
4. **macOS**: el código contempla la plataforma, pero el pipeline **no genera
   binarios de macOS** (solo Windows y Linux).
5. ~~**Cola de la revisión a fondo**~~: **COMPLETADA** (`6f82da5`, `4cdc332`).
   Items 12 (cifrado con `safeStorage`) y 17 (código muerto) arreglados.
   Nueva suite `test-crypto.js`. Ver
   [Cola de la revisión a fondo](#cola-de-la-revisión-a-fondo-completada-2026-11-16-2050).
6. **Linter**: no hay ESLint ni formateador, y el bug de `!enabled` (arreglado
   en `031c693`) lo habría cazado. Añadirlo toca el pipeline, así que es
   decisión del usuario antes de meter un job de CI nuevo.
7. ~~**`fix:` del respaldo sin GPU en los modos de una sola vez**~~: **HECHO**
   (`951e478`). Los modos `--preview`, `--settings` y `--probe` ahora pasan por
   el respaldo de GPU antes de salir. Nueva suite `scripts/test-run.js`.
8. ~~**BUG: falta la cuota semanal en algunos usuarios**~~: **NO ERA BUG**.
   Verificado con captura: sí le salía la semanal. Falsa alarma.

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

## Límites del entorno de DSH al medir (no son fallos de la app)

**Actualizado el 2026-11-16 19:30.** La política de aprobación pasó de `ask` a
`never` y el sandbox de `workspace-write` a `danger-full-access`: los tres
límites que había **ya no existen** (medido, no supuesto):

- `npm run probe` → **los cuatro proveedores en `ok`** (antes `spawn EPERM` en
  Claude y Antigravity).
- **HTTPS desde PowerShell funciona** (antes error de TLS contra todos los
  hosts).
- Un **proceso hijo con salida por tubería** funciona (antes
  `Access to the path '\\.\pipe\...' is denied`).
- **Electron sigue sin arrancar** con `npm run preview`, pero ya **no es el
  sandbox**: es la **GPU** (`0x80000003`, *"GPU process isn't usable"*). Con
  `--disable-gpu --disable-gpu-sandbox --no-sandbox` el preview funciona y
  guarda la captura.

Detalle y comandos en [FINDINGS.md §3](FINDINGS.md#el-sandbox-ya-no-estorba-2026-11-16-1930-danger-full-access--approval-never).

## Reparto entre sesiones (acuerdo)

Ver [Sesiones activas en este repo](#sesiones-activas-en-este-repo-2026-11-16-1845),
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

## Decisiones que son del usuario

- **Electron 38.8.6 → 42.11.16**: el PR #1 de Dependabot está cerrado sin fusionar y GitHub
  avisa de **34 vulnerabilidades** en `main`. Subir o documentar el riesgo.
- **Play Store** (o no): el plan de Android asume **sideload**, sin Google Play.
- **Linter** (ESLint) y un job de CI nuevo: es un cambio de tooling y lo decide el usuario.

## Notas para quien siga

- `preview-card.png` se regenera en cada vista previa: una ejecución interrumpida lo deja a
  **0 bytes**. **Restaurarlo** con `git checkout -- preview-card.png`, nunca commitearlo roto.
- Las vistas previas ya se ponen solas `disable-gpu` (`814b6f5`): basta `npm run preview`
  con `ELECTRON_RUN_AS_NODE` **vacío**.

## Retomar (en 5 minutos)

```bash
cd C:\Users\carch\Nextcloud\Scripts\Usagia
git switch beta && git pull --ff-only
npm test && npm run test:package     # tienen que salir OK
```

Y para lo visual, con `ELECTRON_RUN_AS_NODE` **vacío**: `npm run preview` (tarjeta) y
`npm run preview:settings` (configuración). Si `preview-card.png` queda a 0 bytes:
`git checkout -- preview-card.png`.

**Antes de tocar nada**, mira la tabla de *Sesiones activas* de este fichero: un fichero, un
dueño.

## Actualización automática desde la app (2026-11-16 18:45)

**Encargo:** "¿no se puede automatizar más la actualización? ¿tengo que ir a GitHub a
descargar/instalar a mano y matar la app?"

**Hecho y publicado** (`feat:` en `v1.1.0-beta.0003`, `fix:` en `beta.0004`/`beta.0005`):
la app instalada con el NSIS **se actualiza sola** desde dentro.

| Pieza | Dónde |
|---|---|
| Decidir si hay versión nueva (canales `auto`/`stable`/`beta`, comparación con betas de 4 dígitos) | `src/main/updates.js` |
| Descargar el instalador de la release, con progreso y comprobación de tamaño | `src/main/update-install.js` |
| Instalarlo en silencio (`/S --updated`) en un `.cmd` que espera a que la app muera, y relanzarla | idem |
| Estados (`available`/`downloading`/`ready`/`installing`/`error`) en tarjeta, menú y aviso del sistema | `src/main/main.js` |
| Instalación al salir (`before-quit`), bajada automática | ajustes `updateInstallOnQuit` / `updateAutoDownload` |
| Rastro para diagnosticar en la máquina del usuario | `%APPDATA%\Usagia\updater\update.log` |

**Verificado de verdad:** descarga real de `Usagia-Setup-1.1.0-beta.0003-win-x64.exe` con
el módulo de la app (102.481.070 bytes, exactos al tamaño que anuncia GitHub, en 1,4 s,
`.part` renombrado). `npm test` en verde con las pruebas de descarga simulada y del `.cmd`.

**Bug que cazó esa prueba (y ya está arreglado):** el stream de escritura no escuchaba
`error`, así que un `EPERM`/disco lleno dejaba la descarga colgada para siempre con el
`.part` a medias. Ahora rechaza, limpia y la tarjeta enseña el motivo.

**Medido y sin resolver aquí — el instalador silencioso sale con código 2 en ESTA máquina:**
`exit code 2` = `Abort` en `.onInit` del NSIS. Pasa **también con el Setup de
`beta.0002`** (el que sí se instaló a mano a las 13:58), así que es del entorno, no de la
versión: se descarta el mutex del instalador (libre), la marca de «app en ejecución» (no
había ninguna) y el Mark-of-the-Web (el fichero no lleva `Zone.Identifier`). El build
local de NSIS tampoco termina en esta sesión (`Exit code: null` al ejecutar el instalador
para extraer el desinstalador). **Conclusión honesta:** la descarga, el script y los
estados están probados; el *clic final* (instalar + relanzar) solo se podrá confirmar en
una máquina sin el sandbox de DSH, y si falla la app ya no se queda muda: vuelve a
abrirse, deja `failed-<versión>` y no reintenta esa versión en bucle.

**Lo que sigue sin poder automatizarse** (y la ventana de configuración lo dice con el
motivo): la **portable** (carpeta nueva en cada arranque), el **.deb** y **macOS**. Y **la
primera vez**: el binario instalado hoy no trae el actualizador, así que esta entrega hay
que instalarla a mano una vez; a partir de ahí, sola.
