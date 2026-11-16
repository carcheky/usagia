# Estado de Usagia

> **Última actualización:** 2026-11-16 13:50 (Europe/Madrid), más lo añadido a
> las 18:20 por la **sesión de documentación** (`docs/` con índice y metodología
> de carga selectiva, la regla en [AGENTS.md](AGENTS.md) y `scripts/test-docs.js`):
> ver [Lo último: documentación para humanos y agentes](#lo-último-documentación-para-humanos-y-agentes-2026-11-16-1820).
> **Quién escribe este fichero ahora mismo:** la sesión `session-updates`
> (**búsqueda de actualizaciones** con canal configurable: tarjeta, menú de
> bandeja, ventana de configuración y aviso del sistema). Ver
> [Lo último: las actualizaciones](#lo-último-las-actualizaciones-2026-11-16-1350).
> Antes de ella escribió `session-tests` (suite completa de pruebas: 9 suites
> tras esta sesión, 189 pruebas, runner único, regla "sin prueba no hay fix"
> en [AGENTS.md](AGENTS.md)). Aporta el **arreglo de la cuota de Claude** (no
> salía por un token caducado), el
> **repintado de las barras** (llenas y rojas al 100 %, sin barras grises sin
> porcentaje), el **orden canónico de las ventanas** (la 5 h primero en todos
> los proveedores), las **notas que ya no se cortan con "..."**, el **modelo
> propio de DeepSeek** (saldo + autonomía, que no es una cuota por
> ventanas), la **cuenta global del icono de la bandeja**
> (`src/main/availability.js`) y el **fin del scroll por 3 píxeles** (el tope
> es la pantalla menos la barra de tareas), con sus commits y su entrada en
> [Lo último](#lo-último-la-cuota-las-barras-y-el-icono-2026-11-16-0955).
> **Ojo: otra sesión está activa** (`dcd6277 fix(availability): show critical
> only when all long windows are exhausted`, 13:46): toca
> `src/main/availability.js` y su prueba, y no se ha tocado nada suyo.
> **Sigue activa a las 14:00** con otro encargo ("no parece que se actualicen
> los consumos automáticamente") y **reserva `src/main/providers/claude.js`
> y `scripts/test-providers.js`**. Diagnóstico medido: la app **sí refresca**
> cada 120 s (conexiones a las 13:50:55, justo en el ciclo del temporizador);
> lo que se quedaba viejo era la fila de Claude, con una **caché de 10 minutos
> para todo**. Hallazgo y arreglo en
> [Lo último: el refresco y la caché de Claude](#lo-último-el-refresco-y-la-caché-de-claude-2026-11-16-1400).
> **No se tocan `src/main/main.js` ni `src/renderer/card.js`**: son de la otra
> sesión.
> Esta versión **fusiona** lo que escribieron las sesiones `session-fa207887`
> (plan de Android), `session-e9f5038b` (lead: verificación de la UI y de la
> app instalada de `beta.4`), `session-8a303ef4` (revisión a fondo: cola de los
> items 11-18), `session-dab004c1` (fallback sin GPU) y `session-lead-quota`
> (cuota de Claude y barras). Si al abrirlo la cabecera dice otra sesión,
> **fusiona su contenido** en vez de sobrescribirlo (ver [AGENTS.md](AGENTS.md),
> *Varias sesiones en el mismo repo*).
> Este fichero es la foto del proyecto *ahora mismo*: qué hay publicado, qué
> está a medias y qué toca después. Lo actualiza la sesión que trabaja en el
> repo (ver [Cómo mantener este fichero](#cómo-mantener-este-fichero)).
> Para la semántica de los endpoints manda [FINDINGS.md](FINDINGS.md); para las
> reglas de ramas, releases y reparto entre sesiones, [AGENTS.md](AGENTS.md).

## Resumen en una línea

App de bandeja (Electron) que muestra la cuota de Minimax, Claude, Antigravity
y DeepSeek. **Publicada**: `v1.0.0` (primera estable, 2026-11-16 12:43 local)
y la pre-release `v1.0.1-beta.0002`. La revisión a fondo del código está
**publicada y verificada**, y el **binario publicado de `beta.4`** se comprobó
de extremo a extremo (tarjeta al pasar el ratón + ⚙ → ventana de
configuración). **Nuevo**: la app **avisa de las versiones nuevas** (tarjeta,
menú, configuración y aviso del sistema) con **canal configurable**
(`auto`/`stable`/`beta`). `beta` está a la par de `origin/beta`.

## Sesiones activas en este repo (2026-11-16 02:00)

Cuatro sesiones de DSH están abiertas sobre este mismo repo y han recibido el
mismo encargo. **DSH no permite mensajes entre sesiones raíz distintas**
(`send_message` solo alcanza al mismo árbol de subagentes), así que la
coordinación es por el repo: cada una reserva sus ficheros aquí y fusiona en
lugar de pisar.

| Sesión | Título | Qué está haciendo | Ficheros reservados |
|---|---|---|---|
| `session-fa207887` | Plan de Android | **Pausa del día**. Plan cerrado y **actualizado el 2026-11-16** con las novedades de `beta.4`, commiteado en `59692d2`. Ha **commiteado y pusheado el trabajo que las otras sesiones dejaron a medias** (ids de cuenta, `pct100` con espacios, nota de la cuenta, fallback sin GPU) para dejar el árbol limpio. La **implementación de Android no ha empezado**: lo siguiente es **F0** (keystore + secrets), que no depende de nadie. Ver [Pausa del día](#pausa-del-día-2026-11-16-0200-qué-le-queda-a-cada-sesión) | `PLAN-ANDROID.md` (liberado) · `STATUS.md` (fusionado) |
| `session-e9f5038b` | lead (documentación y verificación) | Cuadra los documentos con lo publicado y **verificó la UI** con las vistas previas reales (tarjeta y configuración, con datos vivos). Commiteó `de3d34f` y `60b9519` | `STATUS.md`, `FINDINGS.md`, `README.md`, `AGENTS.md` |
| `session-8a303ef4` (**esta**) | Revisión a fondo del código | **Pausa del día**. Cola cerrada salvo los items **12** (`safeStorage`) y **17** (código muerto); lo suyo sin commitear ya está en `cfe09d7`, `3e13411` y `31f03ca`. Mañana: **17 antes que 12**, y los dos **antes que F1** (que mueve `src/main/http.js` y `src/main/providers/*`). Plan detallado en [Pausa del día](#de-session-8a303ef4-revisión-a-fondo-los-items-12-y-17-en-detalle) | `STATUS.md` · `scripts/run.js` · `scripts/test-*.js` · `src/main/hover.js` · `src/main/http.js` · `src/main/instances.js` · `src/main/local/antigravity-client.js` · `src/main/main.js` · `src/main/settings.js` · `src/renderer/settings.js` · `src/main/credentials.js` · `src/main/card.js` · `src/main/providers/*.js` · `package.json` |
| `session-dab004c1` (**esta**) | Monitor de IAs en barra de tareas | La sesión larga del repo (21 turnos). **Pausa del día**. **Verificó el binario publicado de `beta.4`** (portable descargado de la release): la tarjeta sale al pasar el ratón y el ⚙ abre la ventana de configuración. Su fallback sin GPU ya está commiteado en `814b6f5`; sus arreglos (ids de cuenta, `pct100` con espacios, nota de la cuenta) los recogieron `cfe09d7`, `3e13411`, `31f03ca` y `814b6f5`. Lo que le queda: el **cuelgue de `preview:settings`** con ese fallback y cuatro apuntes de la revisión de código, en [Pausa del día](#de-esta-sesión-session-dab004c1-la-sesión-larga-del-repo) | (repositorio: sus cambios ya están dentro) |
| `session-tests` (**esta**) | Suite completa de pruebas | **Hecho y commiteado**: runner `scripts/test.js`, `scripts/test-lib.js` (HOME falso + `fetch` simulado), 5 suites nuevas (proveedores, credenciales, módulos locales, renderer, releases), `primarySummary`/`shortSummary` movidos a `src/main/summary.js`, `release.js` con funciones puras exportadas, regla en `AGENTS.md`. `npm test` → 8 suites, 154 pruebas, ~1 s | `scripts/test*.js` · `scripts/release.js` · `src/main/summary.js` · `src/main/main.js` (solo el `require`) · `src/main/config.js` (`normalize`) · `package.json` (`scripts`) · `.github/workflows/release.yml` (job `verify`) · `AGENTS.md` · `STATUS.md` |
| `session-updates` (**esta**) | Búsqueda de actualizaciones | **Hecho y commiteado** (`feat:`): `src/main/updates.js`, canal `auto`/`stable`/`beta`, tarjeta, menú, configuración y aviso del sistema; suite nueva `scripts/test-updates.js`. En [Lo último: las actualizaciones](#lo-último-las-actualizaciones-2026-11-16-1350) | `src/main/updates.js` · `src/main/main.js` · `src/main/config.js` · `src/main/settings.js` · `src/preload/settings-preload.js` · `src/renderer/card.{html,css,js}` · `src/renderer/settings.{html,css,js}` · `scripts/test-updates.js` · `scripts/test-renderer.js` · `scripts/test-local.js` · `README.md` · `AGENTS.md` · `STATUS.md` |
| `session-lead-quota` | Cuota de Claude y barras | **Hecho y commiteado**: la cuota real de Claude (el token de la CLI estaba caducado) y el repintado de las barras (llenas y rojas al 100 %, sin barras grises donde no hay porcentaje). En [Lo último](#lo-último-la-cuota-de-claude-y-las-barras-2026-11-16-0235) | `src/main/providers/claude.js` · `src/main/credentials.js` · `src/main/main.js` · `src/renderer/card.js` · `src/renderer/card.css` · `src/renderer/settings.js` · `scripts/get-claude-usage.ps1` · `scripts/test-parsers.js` · `FINDINGS.md` · `STATUS.md` |

> ✅ **Conflicto resuelto a las 01:55**: `session-dab004c1` y
> `session-8a303ef4` editaban `src/main/main.js`, `src/main/card.js` y
> `package.json` a la vez. Los cambios de **las dos** sesiones están ahora
> **commiteados juntos** (ver *Trabajo commiteado y pusheado*), así que ya no
> hay dos sesiones editando los mismos ficheros: quien siga con ellos parte
> de `814b6f5`, no de un árbol con cambios a medias.
>
> ⚠️ **Ficheros tocados por `session-lead-quota`** (los mismos que tenía
> reservados `session-8a303ef4`: `src/main/main.js`, `src/main/credentials.js`,
> `src/main/providers/*.js`, `src/renderer/settings.js`): ya está todo
> **commiteado**, así que quien siga parte de ese commit y no de un árbol con
> cambios a medias.
> Ojo también a `preview-card.png`, que se regenera en cada vista previa
> (una ejecución interrumpida lo deja a **0 bytes**: se restauró con
> `git checkout -- preview-card.png` en vez de commitear una captura rota).

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
| Última release publicada | **v1.1.0-beta.0001** (2026-11-16 13:50 local) | Pre-release de las **actualizaciones** (`7f093b4`, `feat:` → salto a 1.1.0). Pipeline **en verde**: commits, verify (`npm test`, 9 suites), release, builds de Windows y Linux. En GitHub hay 14 publicadas |
| Última release estable | **v1.0.0** (2026-11-16 12:43 local) | La primera. Salió por el pipeline al empujar `main`; desde entonces las betas numeran `1.0.1-beta.NNNN`... y al entrar un `feat:` saltaron a `1.1.0-beta.NNNN` |
| Rama de trabajo `beta` | `7f093b4` | Igual que `origin/beta`. Último commit: `feat:` de las actualizaciones (publicó `v1.1.0-beta.0001`) |
| Rama `main` | `c57d3df` | **Ancestro de `beta`** (comprobado): el `--ff-only` no da conflicto. Publicó `v1.0.0`; la fusión de `beta` sigue siendo decisión del usuario |
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

## Lo último: documentación para humanos y agentes (2026-11-16 18:20)

**Encargo:** "la regla de oro del agente es documentar todo debidamente en una
carpeta human/ia oriented, siguiendo una metodología de carga documental
selectiva según la tarea".

**Lo hecho:** una carpeta [`docs/`](docs/README.md) con **índice único** y una
**metodología de carga selectiva**, más la regla escrita en [AGENTS.md](AGENTS.md)
y una suite que la mantiene viva.

| Qué | Dónde |
|---|---|
| Índice: qué documento responde a qué y cuándo cargarlo | [docs/README.md](docs/README.md) |
| Método: niveles de carga (índice → documento → sección), **12 recetas por tarea** (con lo que **no** hace falta leer), enrutado del conocimiento, anatomía de un documento y el bucle de mantenimiento | [docs/METODOLOGIA.md](docs/METODOLOGIA.md) |
| Decisión y alternativas descartadas (raíz intacta, wiki, RAG, sub-índices) | [docs/decisions/0001](docs/decisions/0001-documentacion-para-humanos-y-agentes.md) |
| Prueba: enlaces relativos vivos, todo `docs/` enlazado desde el índice, cabecera (`Para quién`/`Responde a`/`Verificado`) y tope de 300 líneas | `scripts/test-docs.js` (se descubre sola: entra en `npm test` y en el job `verify`) |
| Regla operativa: "un dato, un sitio", carga por secciones, commit `docs:` | [AGENTS.md](AGENTS.md) § *Documentación: la regla de oro* |

**Por qué así (medido, 2026):** un `AGENTS.md` útil ahorra ~28,6 % de tiempo y
~16,6 % de tokens, pero **duplicar el README** empeora el coste ~23 %; la
atención se degrada al crecer el contexto ("context rot"); y la divulgación
progresiva funciona con **un** nivel de índice, no con dos (∞Bench / REALM 2026).
Está resumido con sus fuentes en
[METODOLOGIA §2](docs/METODOLOGIA.md#2-por-qué-así-lo-que-dice-la-evidencia-de-2026).

**Lo que NO se ha tocado:** los ficheros de la raíz no se han movido (los
referencian las otras sesiones y el historial); el trabajo **en curso de otra
sesión** (la instalación de actualizaciones: `src/main/update-install.js`,
`updates.js`, preloads y renderer) sigue **sin commitear y sin tocar**.
`npm test` → **10 suites en verde** (la nueva incluida).

**Sin empujar:** el commit es `docs:` y está **solo en local**, porque la regla
del repo pide `git status --porcelain` vacío antes de cada `git push` y el árbol
tiene el trabajo en curso de la otra sesión. Quien cierre el árbol puede
empujarlo tal cual (no publica release: `docs:` no es de la app).

## Lo último: el refresco y la caché de Claude (2026-11-16 14:00)

**Encargo:** "bug: no parece que se actualicen los consumos automáticamente".

**Lo primero era saber si el refresco automático funciona.** Se midió en la app
**instalada y en marcha**, sin tocarla: muestreo de un segundo de las conexiones
TCP de sus procesos durante 150 s.

| Medido | Resultado |
|---|---|
| Conexiones de los procesos de Usagia | `13:50:55` (3 destinos) y `13:51:58` (2) |
| Ciclo del temporizador | arranque `13:18:53` + `refreshSeconds` 120 s → **`13:50:53`** |
| Veredicto | **el refresco automático funciona**: la ráfaga cae en el ciclo |

Se descartaron también, leyendo y con pruebas, las otras causas posibles de
"no se actualiza": `collect()` no tiene caché salvo la de Claude; los cuatro
`fetchUsage` devuelven datos vivos (medido: Minimax 301 ms, DeepSeek 1,5 s,
Antigravity 2 s, **Claude 14 ms = caché**); `http.fetchJson` corta a los 20 s y
los `.ps1` a los 45 s, así que un cuelgue no deja `refreshInFlight` para
siempre.

**El bug de verdad: la caché de Claude era 10 minutos para TODO.**

El refresco va cada 2 min y la caché duraba 10: **cinco refrescos seguidos
enseñaban las mismas cifras** mientras el pie de la tarjeta decía "hace 30 s".
En la captura del usuario, Claude salía al **81 %** en la 5 h cuando la API ya
daba **100 %**: la fila tenía ~10 minutos. Y un fallo pasajero (red, token) se
cacheaba también 10 minutos, dejando el respaldo local en pantalla.

**El arreglo** (`src/main/providers/claude.js`), tres plazos en vez de uno:

| Qué acaba de pasar | Cuánto se cachea | Por qué |
|---|---|---|
| Acierto | **2 min** (el refresco) | las cifras se mueven al ritmo de la app |
| Fallo que no es 429 (red, token) | **1 min** | un tropiezo no dura diez |
| **429** | **10 min** (como antes) | es el margen del endpoint: insistir lo gasta |

Para el 429 hay que saber que lo fue: `remoteUsage()` ahora devuelve
`rateLimited` (por `status === 429` en HTTP y por `/429/` en la salida del
`.ps1`, que ya traía "HTTP 429: límite de peticiones del endpoint de uso").

**Pruebas nuevas** (`scripts/test-providers.js`, +3): acierto caducado a los
2 min, 429 respetado 10 min (no se insiste a los 3), y fallo normal caducado al
minuto. El reloj se adelanta con `Date.now` parcheado, porque la caché caduca
por tiempo. `npm test` → **9 suites, 34 pruebas de proveedores, en verde**.

> **Lo que NO se toca (y por qué):** el pie de la tarjeta ("hace N s") mide el
> último `collect`, no la antigüedad de cada fila. Con la caché a 2 min la
> diferencia ya no engaña, pero si algún día vuelve a haber cachés largas,
> habría que enseñar la edad **por proveedor**: eso son `main.js` (`broadcast`)
> y `card.js`, que son de la otra sesión.

## Lo último: las actualizaciones (2026-11-16 13:50)

**Encargo:** "actualizaciones. debe poder verse si hay nuevas actualizaciones,
sean beta o estables (configurable canal de actualización)".

**Lo hecho**, en cuatro sitios que dicen lo mismo sin repetirse:

| Dónde | Qué |
|---|---|
| **Tarjeta** | Franja arriba con `v<instalada> → v<nueva> disponible` y botón **Descargar** (abre la release) |
| **Menú del icono** | *Buscar actualizaciones*; al pie, `Versión <actual>` o `Versión <actual> → <nueva> disponible` (clic = descargar) |
| **Configuración** | Sección **Actualizaciones**: interruptor de búsqueda automática, *Buscar ahora*, canal y versión instalada |
| **Aviso del sistema** | Notificación nativa **una sola vez por versión** y **solo en la app empaquetada** (en desarrollo la versión es `0.0.0` y saltaría en cada arranque) |

**El canal** (`updateChannel`):

| Valor | Qué enseña |
|---|---|
| `auto` (**defecto**) | Sigue a la versión instalada: una beta avisa de betas nuevas (y de la estable, que va por delante); una estable solo de estables |
| `stable` | Solo estables |
| `beta` | Estables y betas |

`auto` es el defecto **a propósito**: la app llevaba solo pre-releases, así que
con `stable` fijo la comprobación no habría enseñado nunca nada.

**Cómo compara** (`src/main/updates.js`): semver, con las betas de la misma
base por debajo de su estable (`1.0.0-beta.0010 < 1.0.0`) y ordenadas por
número (`beta.9 < beta.10`, aunque lleguen con cuatro dígitos). Los borradores
no cuentan. La consulta va por el mismo `fetch` que los proveedores
(`http.fetchJson`), así que la suite la simula sin red; se comprueba al
arrancar (5 s después, para no bloquear) y cada 6 h. **No gasta cuota de
ningún proveedor**: es la API pública de GitHub.

**Medido de verdad contra GitHub** (13:48): con `1.0.0-beta.0010` instalada y
canal `auto` → `1.0.1-beta.0002`; con `0.0.0` (desarrollo) y `stable` →
`1.0.0`. O sea que en el repositorio **ya hay una estable publicada**
(`v1.0.0`), aunque la sección [Versiones](#versiones) de este fichero diga
"ninguna": la que faltaba la publicó el usuario.

**Verificación:**

- `npm test` → **9 suites, 189 pruebas** en verde (la nueva:
  `scripts/test-updates.js`, 23 pruebas: parseo, comparación, canales, qué es
  "más nueva" y búsqueda con `fetch` simulado). El banner de la tarjeta y su
  botón se prueban en `scripts/test-renderer.js`, y el canal en
  `scripts/test-local.js`.
- **Publicado**: `7f093b4` en `beta` → release **`v1.1.0-beta.0001`** (el
  `feat:` sube de 1.0.1 a 1.1.0) con el pipeline **en verde**: commits,
  verify (`npm test` en CI), release y los dos builds. Windows (NSIS +
  portable) y Linux (AppImage + deb) adjuntos.
- **App real**: captura de la ventana de configuración con la sección nueva
  (*Actualizaciones*: interruptor, *Buscar ahora*, canal, versión) y captura
  de la tarjeta con el banner puesto a mano (`v0.0.0 → v1.0.0 disponible`).
  Las dos se ven bien; la captura de la tarjeta se restauró después
  (`git checkout -- preview-card.png`) para no dejar en el repo una versión
  de mentira.
- **Lo que NO se ha probado**: el aviso del sistema (notificación) de punta a
  punta, porque solo se muestra en la app **empaquetada** y con una versión
  instalada menor que la publicada. Con `v1.0.1-beta.0002` instalada y
  `v1.1.0-beta.0001` publicada, la próxima instalación del binario lo
  enseñaría; la tarjeta y el menú sí enseñan el salto (comprobado con la
  consulta real a GitHub).
- **Trampa del entorno** (recordatorio): las vistas previas hay que lanzarlas
  con `Start-Process … -Wait` y redirección a fichero; con `&` en PowerShell
  no se espera al proceso y parece que "no ha hecho nada". El guardado de la
  vista previa de configuración da `EPERM` sobre la carpeta temporal: es el
  sandbox, no la app.

## Lo último: la suite de pruebas (2026-11-16 13:20)

**Encargo:** "evaluar y asegurar una suite completa de tests para no perder
ninguna funcionalidad en el futuro sin tener que gastar tokens".

**Evaluación de partida** (sobre `c57d3df`): 56 pruebas en verde, pero solo
de funciones puras (parsers, disponibilidad, tooltip, cuentas, paquete).
**Sin cubrir**, y justo donde han estado los bugs reales: `fetchUsage` de
los cuatro proveedores (cascada de Claude, Bearer de Antigravity, bucket de
Minimax, saldo/autonomía de DeepSeek), la cascada de credenciales con
ficheros, la cabecera de la fila, el renderer de la tarjeta, `release.js`
(solo se probaba publicando), `jsonl-tokens`, `script-path` (el bug de
`beta.3`), `sanitizeAccounts`.

**Lo hecho:**

| Qué | Dónde |
|---|---|
| Runner único que descubre `scripts/test-*.js` y lanza cada suite en su proceso | `scripts/test.js` (`npm test`; el job `verify` lo usa) |
| Librería de pruebas: `check` sync/async, HOME falso que vacía las variables de credenciales, `fetch` simulado que registra cabeceras | `scripts/test-lib.js` |
| 31 pruebas de `fetchUsage` de los 4 proveedores sin red | `scripts/test-providers.js` |
| 12 pruebas de la cascada de credenciales con ficheros reales | `scripts/test-credentials.js` |
| 19 pruebas: `summary.js`, `jsonl-tokens`, `script-path`, `hover.inside`, `config`, `settings` | `scripts/test-local.js` |
| 8 pruebas del renderer con un DOM mínimo (`vm`) | `scripts/test-renderer.js` |
| 14 pruebas de la lógica de releases | `scripts/test-release.js` |
| `primarySummary`/`shortSummary` fuera de `main.js` para poder probarlas (sin cambio de comportamiento) | `src/main/summary.js` |
| `release.js` exporta `clasificar`, `publicable`, `siguienteBase`, `siguienteTag`, `ultimaEstableDe`, `sinBorradores`, `notas`; solo publica con `require.main === module`. **Mejora**: la release "anterior" es el tag REAL de GitHub, no uno reconstruido (una beta vieja `beta.6` rompía el `git rev-parse`) | `scripts/release.js` |
| **Bug cazado por una prueba**: `config.normalize` hacía `{...'x'}` → `{0:'x'}` si `credentials`/`providers` venían como texto | `src/main/config.js` |
| Regla "un `fix:`/`feat:` sin prueba no se commitea" + mapa de suites | `AGENTS.md` |

**Resultado:** `npm test` → **8 suites, 154 pruebas, ~1 s**, sin Electron,
sin red, sin credenciales de la máquina. Fuera de `npm test` queda
`npm run test:ci-env` (hace red).

**Lo que no se cubre** (hay que mirarlo con la app): `card.position`,
`hover.getTrayAnchor` (UI Automation), los `.ps1` y el watchdog de
`scripts/run.js`.

**Trampa del entorno:** desde el sandbox de DSH, `npm test` falla con
`Access to the path '\\.\pipe\...'` si se **captura la salida** (`| ...`,
`2>&1`): es el sandbox, no la suite. Lanzar `node scripts/test.js` a secas.

## Lo último: la cuota, las barras y el icono (2026-11-16 09:55)

**Los cinco encargos** de esta sesión, todos hechos y verificados con la app
real (capturas con datos vivos) y con `npm test`:

| Encargo | Qué se hizo |
|---|---|
| "no me queda claro si he gastado o no mi cuota de claude, sale en gris" | La cuota real **no salía**: la app elegía un token OAuth **caducado** de Claude (401) y caía al respaldo local (transcripciones, que no son la cuota). Ahora prueba **varios candidatos** en orden |
| "si he gastado el 100 % las barras deberían estar llenas y rojas" | Barras: llena = **consumido**, roja al 100 %; el punto refleja la cuota; sin barra donde no hay porcentaje |
| "el icono de la bandeja debería cambiar según el total de uso disponible" | Nuevo módulo `src/main/availability.js`: la salud **global** de la cuota, no "la peor de todas" |
| "el orden debería ser el mismo en todos los proveedores" | Orden canónico de ventanas: **5 h → diaria → semanal → con ámbito → mensual** |
| "el texto final se corta con '...' en el overlay" | La nota **envuelve** en varias líneas; el reinicio va **junto a su barra** |

### 1. La cuota de Claude no salía (token caducado)

La app elegía **un** token OAuth y se aferraba a él. Eligió el de
`~/.claude/.credentials.json`, que estaba **caducado** (`expiresAt` =
2026-11-15T20:38Z): el endpoint responde **401** *"OAuth access token has been
revoked"*, la app caía al respaldo local (transcripciones de Claude Code) y
esa fila **no era la cuota**. Las otras dos fuentes sí funcionaban:

| Fuente | Estado | Expiración |
|---|---|---|
| `~/.claude/.credentials.json` | **401** (caducado) | 2026-11-15T20:38Z |
| `~/.dsh/.credentials.yaml` → `llm-pi-ai/anthropic` | **200** | 2026-11-16T06:26Z |
| `%APPDATA%\Claude\config.json` → `oauth:tokenCacheV2` | **200** | 2026-12-04 |

**El arreglo:** `resolve()` devuelve una **lista de candidatos** en orden
(manual → CLI si no caducado → harness si no caducado → caché de Claude
Desktop) y se prueban hasta que uno responda. Solo se pasa al siguiente si el
anterior falló de **autenticación** (401/403): un **429 no se reintenta**,
porque el endpoint da ~5 peticiones por ventana. Un token con `expiresAt` en
el pasado **no se usa**: se descarta antes de gastarlo un 401. El `.ps1`
también (descarta los grants caducados y salta el token de la CLI si venció).

### 2. El icono de la bandeja: la cuenta global

Antes tomaba "la peor de todas": con **una** ventana de **un** proveedor al
100 % salía en **rojo**, que se lee como "no queda uso de nada". Ahora
(`src/main/availability.js`):

1. Cada ventana aporta lo que **queda**; la media se pondera por tipo (la
   de 5 h pesa 1, la mensual 2,5: si se agota, no se repone enseguida).
2. Se distingue la ventana agotada de la que **se repone pronto** (5 h /
   diaria): la primera es un contratiempo, la segunda un problema de verdad.
3. **Verde** si hay ≥ 50 % de sobra y nada agotado · **amarillo** si algo
   está agotado (que se repone pronto) o la media baja del 50 % · **rojo**
   si la media baja del 20 %, o una ventana **larga** (semanal/mensual) está
   agotada, o **todos** los proveedores están bloqueados.

Comprobado con los datos reales:

| Situación | Media | Icono |
|---|---|---|
| Todo reseteado (2026-11-16 09:55) | 79 % | verde |
| **Claude 5 h al 100 %**, el resto con de sobra | 72 % | **amarillo** |
| Claude **semanal** al 100 % | 71 % | **rojo** |

### 3. Las barras, el orden y el texto

| Antes | Ahora |
|---|---|
| Una métrica **sin porcentaje** pintaba una barra **apagada al 100 %**: parecía "agotada" | **Sin barra**: solo el valor |
| Etiqueta `ventana 5 h · queda 23 %`, **cortada** a los 122 px | Solo el nombre; lo que queda, en el **tooltip** |
| Punto **verde** aunque la cuota estuviera al 100 % | El punto refleja la **cuota** (rojo/amarillo/verde) |
| Cabecera `100% / 42% usado`: no se sabe cuál es cuál | `100 % usado · ventana 5 h` (la **peor** ventana, % delante) |
| Sin cuota remota la fila salía **verde** | Estado **`warning`**: las transcripciones no son la cuota |
| La **nota final se cortaba con "..."** (línea de una, `text-overflow`) | La nota **envuelve** en varias líneas |
| El reinicio iba en una nota global que **repetía el grupo 4 veces** (216 caracteres) | El reinicio va **junto a su barra**, en la misma línea, con `↻`; el grupo se abrevia (`Gemini`, `Claude/GPT`) y el nombre completo queda en el tooltip |
| Las ventanas en **orden distinto** según el proveedor | Orden canónico: **5 h → diaria → semanal → con ámbito → mensual** |

**El color de las barras** (medido por lo que **queda**, como los paneles):
verde > 30 %, amarillo 10-30 %, **rojo ≤ 10 %**. Barra llena = **consumido**.

**El orden** (en `http.sortMetrics()`, `src/main/http.js`): la ventana **más
corta primero**, de más larga a más larga. El orden es estable y respeta los
**grupos** de Antigravity (sus bloques por familia de modelos no se separan).
Lo que no sea una ventana de cuota (saldo, tokens) queda al final.

### 4. DeepSeek no es una cuota por ventanas (es saldo prepaid)

El API de DeepSeek (`get_user_summary`) devuelve `normal_wallets`
(saldo), `bonus_wallets` y `total_costs`: **ni "5 h", ni "semanal"**. Es
dinero prepaid, y no hay denominador contra el que medir un "% usado", así
que pintarle una barra de cuota era justo lo poco intuitivo.

**Modelo propio** (`src/main/providers/deepseek.js`):

| Métrica | Qué es | Cómo se pinta |
|---|---|---|
| **saldo** | el dinero que queda | Barra que se llena con lo que **queda** (al revés que las cuotas, que se llenan con lo usado). Color por el saldo absoluto: < $5 crítico, < $15 aviso, resto bien (no se repone solo) |
| **aguanta** | **autonomía**: días que aguanta el saldo al ritmo actual | La equivalente a una "ventana" de los demás, y comparable con ellas |

El ritmo sale del desglose por días (`/api/v0/usage/cost` → `days[]`): gasto
del mes ÷ días transcurridos (hoy cuenta a medias). Medido: **0,091 USD/día**
→ el saldo de $33,64 da **12 meses**.

En la cuenta global, el saldo **no entra en la media** (no es ventana): entra
la **autonomía**, con la ventana que le toca por los días que quedan (≤ 1 día
→ `5h`, ≤ 2 → `daily`, ≤ 7 → `weekly`, más → `monthly`). Un **saldo bajo**
avisa igual (crítico), porque recargar es cosa del usuario.

La cabecera de la fila la dice el proveedor (`headline`): **"$33.64 ·
aguanta 12 meses"**, y las métricas se ordenan por importancia (saldo y
autonomía primero, que son las 4 que caben).

### 5. El scroll (que no aparezca por 3 píxeles)

El tope de altura de la tarjeta era un número fijo (640 px en el CSS, y el
área de trabajo − 16 px en el proceso principal). Eso no significaba nada:
en una pantalla de 1080 px, una tarjeta de 641 px sacaba una barra de scroll
**por un píxel**. Una chapuza.

**Ahora el tope es la pantalla menos la barra de tareas**: el `workArea` de
Electron es exactamente eso, así que el tope es su alto (852 px en esta
pantalla). La tarjeta **crece** hasta ese límite (el renderer lo aplica como
`max-height`), y el scroll sale **solo si de verdad no cabe**.

| Contenido | Antes | Ahora |
|---|---|---|
| 546 px (lo normal) | cabe | cabe, **sin scroll** |
| 641 px | **scroll por 1 píxel** | cabe, sin scroll |
| 2820 px (a la fuerza, prueba) | scroll | scroll, con tope de 852 px |

Cuando la tarjeta es más alta que el área de trabajo, se apoya en el borde
superior (en vez de salirse por arriba).

**El tooltip crece con la información que cabe** (`src/main/tooltip.js`, con
la lógica pura aparte para poder probarla):

- Una línea por proveedor, con la **ventana más agotada**: `Claude: 100% 5 h`.
- Windows da un presupuesto de ~127 caracteres. Antes se cortaba el texto
  a la mitad, partiendo una línea; ahora **se van quitando líneas enteras**,
  empezando por las menos urgentes, y lo que **peor está va primero**.
- El tooltip se entero, sin el marcador `Usagia` que ocupaba presupuesto.

### Verificación

- `npm test` → **OK** (pruebas nuevas: token caducado, cuota al 100 % con
  barra llena y tono crítico, límite con ámbito por modelo, orden canónico,
  respeto de grupos, y **9 pruebas de la cuenta global** del icono).
- `npm run probe` → las cuatro cuentas `ok` con sus cuotas reales.
- **App real** (Electron, con datos vivos): tarjeta **sin scroll**, todo el
  texto visible, y el icono con el color que corresponde.
- La captura sale a 0 bytes si la app instalada está en marcha (caché de disco
  compartido): con `--user-data-dir` propio y `--disable-gpu
  --disable-gpu-sandbox --no-sandbox` sale bien. Es un problema del entorno
  de prueba, no de la app.

> **Lo que NO se ha hecho:** publicar. Todo queda commiteado y **pusheado a
> `beta`**, pero sin release: la app instalada sigue con lo viejo hasta que
> haya una.

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

**Estado de las pruebas** (2026-11-16 13:20): `npm test` → **OK** (8
suites, 154 pruebas; incluye el paquete). Ver
[Lo último: la suite de pruebas](#lo-último-la-suite-de-pruebas-2026-11-16-1320).

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

El plan de trabajo de los dos que quedan, con ficheros, trampas y criterio de
aceptación, está en
[De `session-8a303ef4` (revisión a fondo): los items 12 y 17, en detalle](#de-session-8a303ef4-revisión-a-fondo-los-items-12-y-17-en-detalle).

Verificado el 2026-11-16 01:36 sobre `60b9519`: `npm test` → **OK** y
`npm run test:package` → **OK**. Además, las **dos vistas previas funcionan**
en este entorno con `ELECTRON_RUN_AS_NODE` vacío y
`--disable-gpu --disable-gpu-sandbox --no-sandbox`: la tarjeta se pinta con
datos vivos y la ventana de configuración responde a *Probar* y a *Guardar*.

### Trabajo commiteado y pusheado (2026-11-16 01:55)

**No queda nada sin commitear en el árbol.** Los ficheros que estaban modificados
—los de `session-dab004c1` (fallback sin GPU) y los de `session-8a303ef4`
(ids de cuenta, `pct100` con espacios, nota de la cuenta)— se han commiteado
**por separado y con su propio mensaje**, para que el historial siga diciendo
qué es de quién:

| Commit | Qué | De quién |
|---|---|---|
| `cfe09d7` fix | Los ids de cuenta no pueden coincidir (`uniqueIds()`): "Trabajo!" y "Trabajo?" dan el mismo slug, y un id escrito a mano puede chocar con uno derivado. El id es la clave de `state.results` y de las cachés por cuenta | `session-8a303ef4` (item 17) |
| `3e13411` fix | Un porcentaje de solo espacios (`" "`) ya no se tomaba como 0 % ("agotado"): `Number(' ')` es 0 | `session-8a303ef4` |
| `31f03ca` fix | La nota de la cuenta explica por qué no hay cuota, en vez de decir "sin credencial" (que miente: con el 429 de Claude sí hay credencial) | `session-8a303ef4` |
| `814b6f5` fix | Las vistas previas arrancan sin GPU utilizable (`disable-gpu` en `--preview`/`--settings`), `--settings` pasa a ser de una sola vez como `--probe`, y enviar a una ventana que se cierra ya no tumba el proceso principal | `session-dab004c1` |

**`preview-card.png`**: una ejecución de la vista previa interrumpida lo dejó
a **0 bytes**. Se **restauró** con `git checkout -- preview-card.png` en vez de
commitear una captura rota; cuando se regenere con datos, se commitea.

> Lo que **queda pendiente** de la cola de la revisión son los items **12**
> (`safeStorage` para cifrar las credenciales) y **17** (código muerto), más el
> **18-bis** (linter), que es una decisión de tooling.

Commits nuevos desde la última actualización de este fichero:

| Commit | Qué |
|---|---|
| `41bcda2` fix | El watchdog mata al hijo al cerrarse, cuenta rachas de caídas y distingue morir por señal de cerrar limpio (item 11) |
| `140e31d` perf | El sondeo de la bandeja no lanza PowerShell cada 10 s, el `app.asar` se lee por trozos y la ruta del protocolo `app://` exige el separador (items 15, 16 y 14) |
| `34aa4a9` fix | El renderer va con `sandbox: true` y el instalador sin los guiones de prueba (items 13 y 18) |
| `60b9519` docs | La fusión del estado de las cuatro sesiones, con la verificación de la UI y de la app instalada de `beta.4` |
| `59692d2` docs | El plan de Android y el estado del proyecto, actualizados con las novedades de `beta.4` |
| `fcb920f` docs | La cola de la revisión y la reserva de ficheros entre sesiones |
| `cfe09d7` fix | Los ids de cuenta no pueden coincidir (`uniqueIds()`) |
| `3e13411` fix | Un porcentaje de solo espacios ya no se toma como 0 % |
| `31f03ca` fix | La nota de la cuenta explica por qué no hay cuota |
| `814b6f5` fix | Las vistas previas arrancan sin GPU utilizable |

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

## Verificación de la UI (2026-11-16 00:42, sesión `session-e9f5038b`)

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
  **Verificado en el binario publicado de `beta.4`** (portable descargado de
  la release): la tarjeta sale al pasar el ratón y el ⚙ abre la ventana de
  configuración.
- **Pipeline de releases**: `commits` → `verify` → `release` → `build-windows`
  + `build-linux`, con commitlint y semantic-release. Cuatro pre-releases
  publicadas sin intervención manual.

## Pendiente / siguiente

1. **Primera versión estable**: `beta.4` ya está publicada y verificada; falta
   `git switch main && git merge --ff-only beta && git push origin main` →
   `v1.0.0`. La comprobación que faltaba —que la tarjeta salga en la **app
   instalada**— **ya está hecha** (`session-dab004c1`, sobre el portable
   publicado de `beta.4`: ver [Pausa del día](#de-esta-sesión-session-dab004c1-la-sesión-larga-del-repo)).
   Lo que queda es la **instalación con el instalador NSIS**, que nadie ha
   probado todavía.
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

## Pausa del día (2026-11-16 02:00): qué le queda a cada sesión

Punto de parada del 2026-11-16: el árbol está **limpio y empujado**
(`beta` = `origin/beta` = `34dfc8a`, con `v1.0.0-beta.6` ya publicada), así que
cualquier sesión puede seguir sin pelearse con cambios a medias.

### De esta sesión (`session-fa207887`, plan de Android)

- [ ] **F0 — keystore y secrets** (no depende de nadie, se puede hacer ya):
      generar `usagia-release.jks` con `keytool`, guardarlo **fuera del repo**
      (gestor de contraseñas + copia) y crear los 4 secrets
      `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Recordatorio del plan:
      **una sola clave para `beta` y `main`**, porque Android no actualiza una
      app si cambia la firma.
- [ ] **F1 — núcleo compartido** (`src/core/`): mover `http.js` y los
      proveedores, con la resolución de credenciales inyectada.
      **Bloqueado** hasta que `session-8a303ef4` libere
      `src/main/providers/*` (items 12 y 17) — si no, se deshace su trabajo.
      Ojo: el item 17 (`formatTokens` duplicado, bloque de métrica repetido)
      lo resuelve el propio núcleo: si se arregla antes, se hereda.
- [ ] **F2 — app Capacitor + job `verify-android`**, en **un solo push** con
      el `feat(android):` (los `ci:` solos no publican y el job no se
      ejercitaría). Saldría como `v1.0.0-beta.5`.
- [ ] **F3 — instalar el APK en un móvil real**: la única prueba de que
      **funciona**, no solo de que existe. Sin esto no se pasa a `main`.
- [ ] **F4** — `fix:` de lo que salga de F3 (comprobar además que **actualiza
      encima** sin desinstalar).
- [ ] **F5** — `docs:` de Android en README y AGENTS.
- [ ] **F6** — `git switch main && git merge --ff-only beta && git push origin
      main` → `v1.0.0`, la primera estable.
- [ ] Al cerrar F2 y F6: actualizar `STATUS.md` (fusionando) y
      `PLAN-ANDROID.md` con lo hecho.

### De esta sesión (`session-e9f5038b`, documentación y verificación)

Lo que **queda pendiente** de esta sesión, en orden de valor:

- [x] ~~**Instalar `v1.0.0-beta.4` y verificar la app empaquetada**~~ → **hecho
      por `session-dab004c1`** (portable de la release, no el instalador): la
      tarjeta sale al pasar el ratón, el tooltip muestra el resumen, la
      ventana de configuración abre y *Probar* responde. Repetido también con
      el portable de `beta.6`. Detalle en *De esta sesión
      (`session-dab004c1`)*. Lo que queda: el **instalador NSIS**, que nadie
      ha instalado.
- [ ] **Cuadrar `README.md` con lo publicado**: añadir que las vistas previas
      **se ponen solas** `disable-gpu` (`814b6f5`), que `--probe`/`--preview`
      no exigen instancia única, y el estado de la cola de la revisión
      (items 12 y 17 pendientes). El resto del README ya está al día.
- [ ] **`FINDINGS.md`**: está al día con el sandbox y con `814b6f5`. Queda
      **re-medir los valores de §3** cuando Claude y Antigravity se puedan
      consultar desde fuera del sandbox (aquí el endpoint de Claude da 429 y
      Antigravity no se puede llamar desde una sesión de DSH).
- [ ] **`AGENTS.md`**: solo una línea más: *"si otra sesión muere a medias,
      deja el árbol como estaba"* (reforzar la regla 6).
- [ ] **Preparar el `v1.0.0`** (cuando el usuario lo decida): lo que quedaba
      sin publicar desde `beta.4` **ya salió como `v1.0.0-beta.5` y
      `v1.0.0-beta.6`**; la estable sería
      `git switch main && git merge --ff-only beta && git push origin main`.
- [ ] **Avisar de dos trampas del entorno** (ya están en `FINDINGS.md`, pero
      conviene recordarlas al retomar): `ELECTRON_RUN_AS_NODE` tiene que
      estar **vacío** para las vistas previas, y `preview-card.png` se deja a
      **0 bytes** si la ejecución se interrumpe (se restaura con
      `git checkout -- preview-card.png`).

### De esta sesión (`session-dab004c1`, la sesión larga del repo)

**Hecho (cierra el pendiente de `session-e9f5038b`)**: verificación del
**binario publicado** de `v1.0.0-beta.4`. Se descargó el portable de la
release (`Usagia-portable-1.0.0-beta.4-win-x64.exe`, 90 MB, `ProductVersion
1.0.0-beta.4`) y se probó con el **ratón real**, no leyendo el código:

1. Se promovió el icono del portable a la zona visible de la bandeja (Windows
   11 mete los iconos nuevos en *iconos ocultos*: sin esto no hay hover).
2. Ratón sobre el icono → **la tarjeta aparece** (380×552, con sus cuatro
   proveedores): el fallo que arregló `beta.3` (los `.ps1` sin desempaquetar)
   **no está**.
3. Ratón sobre la tarjeta → se vuelve interactiva → clic en el ⚙ →
   **se abre "Usagia · Configuración"** (780×660).
4. El tooltip del sistema del binario publicado da los cuatro proveedores con
   datos vivos, **Antigravity incluido (15 %)** → el `cred-read.ps1` también
   viaja y se ejecuta en la app instalada.

Ojo: se probó el **portable**, no el instalador NSIS. El instalador debería
tener lo mismo (mismo `app.asar`), pero nadie lo ha instalado todavía.

**Y-repeatido sobre `beta.6` (2026-11-16 01:45)**: descargado el portable de
`v1.0.0-beta.6` (90 MB, `ProductVersion 1.0.0-beta.6`) y **abierto de verdad**:
el icono aparece en la zona visible de la bandeja (hay que promoverlo en
`HKCU\Control Panel\NotifyIconSettings`, porque Windows 11 mete los iconos
nuevos en *iconos ocultos*), el tooltip da los cuatro proveedores con datos
vivos y **la tarjeta sale al pasar el ratón** (380×552) y **el ⚙ abre la
ventana de configuración** (780×660). En la ventana se ve ya el texto nuevo de
Claude (*"una clave API sk-ant-api no sirve para la cuota"*), o sea que los
arreglos de `beta.5`/`beta.6` van en el binario publicado.

Un apunte del camino: el **portable extrae a una carpeta distinta en cada
arranque** (`%TEMP%\<aleatorio>`), así que su icono vuelve a *iconos ocultos*
cada vez que se reinicia y hay que volver a promoverlo. Con el **instalador
NSIS** la ruta es fija y el icono se queda visible solo: por eso instalarlo es
lo cómodo para el uso diario.

**Pendiente para mañana** (nada de esto toca ficheros que otra sesión tenga
reservados):

- [x] ~~**Repetir la verificación del portable de `beta.6`**~~ → **hecho**
      (2026-11-16 01:45): tarjeta al pasar el ratón y ⚙ → ventana de
      configuración, en el binario publicado de `beta.6`. Detalle arriba.
- [ ] **Instalar la `beta.6` con el instalador NSIS** y repetir la prueba
      con la ruta fija: nadie ha instalado todavía, y es lo que deja el icono
      visible en la bandeja sin tener que promoverlo a mano cada vez.
- [ ] *(cosmetica)* **El tooltip de la bandeja sale duplicado**: en Windows el
      tooltip nativo no admite varias líneas y pinta el resumen entero, pero
      además se ve **otra vez** detrás ("Usagia · Minimax … Usagia · Minimax
      …"). Es el tooltip del sistema junto al de Electron, no un fallo de
      datos, pero queda feo. Habría que limitar el texto del tooltip nativo a
      una sola línea (p. ej. solo "Usagia · 4 cuentas") y dejar el detalle
      para la tarjeta.

- [ ] **`npm run preview:settings` se CUELGA con el fallback sin GPU.**
      Medido hoy: con `--in-process-gpu` (la bandera que puso `814b6f5`) la
      vista previa de configuración **no sale en 90 s y no escribe una sola
      línea**; la de la tarjeta (`npm run preview`) sí funciona y genera la
      captura. Sin la bandera, Electron muere con `GPU process launch failed:
      error_code=18` (esto último es del **entorno**, no del código: la GPU de
      esta máquina empezó a fallar hacia las 23:00, cuando a las 21:00 la app
      arrancaba sin problema).
      Propuesta: que la vista previa de configuración tenga un **tiempo máximo**
      y salga igual (para que `npm run preview:settings` no pueda quedar
      colgada), o repliegarse a la bandera solo cuando el proceso de GPU no
      arranca. Mientras tanto, **no lanzar `npm run preview:settings` sin
      tiempo**: se queda esperando.
- [ ] **Revisión de código de la revisión ajena** (informe de 10 puntos). Ya
      están arreglados: ids de cuenta que colisionaban (`cfe09d7`), `pct100` con
      solo espacios (`3e13411`), la nota de la cuenta (`31f03ca`) y el
      watchdog de `--settings` (`814b6f5`). Quedan **sin arreglar**, por orden:
      1. **Antigravity**: `creds.antigravityToken()` marca siempre la
         credencial de `~/.antigravity/auth.json` como `raw`. Si ese fichero
         guarda el token como **objeto** y no como cadena, se mandaría
         `"[object Object]"` como `Bearer`: el mismo bug que arregló
         `ef99d53` en la rama de la credencial pegada a mano.
         **Pregunta abierta**: ¿qué formato tiene ese `auth.json`? No se puede
         concluir leyendo el repo.
      2. **Claude**: el aviso "se ignora la clave API" se pierde en Linux/macOS
         (la rama que devuelve `null` no lo lleva).
      3. Tras *Guardar*, la tarjeta puede quedarse un ciclo ("…") sin refrescar:
         `refresh()` fusiona los refrescos y el `collect()` en vuelo capturó la
         lista de cuentas anterior.
      4. El texto de ayuda de Claude no dice qué pasa si el campo lleva una
         clave API (la app la ignora y usa la sesión local).
- [ ] **Preparar el `v1.0.0`** (cuando lo decida el usuario): lo que quedaba
      sin publicar en `beta` **ya salió como `v1.0.0-beta.5` y `beta.6`**; lo
      que queda por publicar es la estable, con
      `git switch main && git merge --ff-only beta && git push origin main`.

### De las otras sesiones

| Sesión | Qué le queda |
|---|---|
| `session-8a303ef4` | Items **12** (`safeStorage` para cifrar las credenciales) y **17** (código muerto y duplicación). Después, **libera `src/main/providers/*`** para que F1 pueda empezar. Detalle y plan abajo |
| `session-e9f5038b` | ~~**Verificar la app instalada de `beta.4`**~~ → **hecho por `session-dab004c1`** (portable de la release: tarjeta al pasar el ratón, ⚙ → ventana de configuración, Antigravity con datos). Queda: cuadrar `README.md`/`FINDINGS.md`/`AGENTS.md` con lo publicado. Detalle en *De esta sesión (`session-e9f5038b`)* |
| `session-dab004c1` | **Pausa del día.** Verificación de la app **publicada** de `beta.4` y de `beta.6` (portable descargado de la release, con el ratón real: tarjeta al pasar el icono, ⚙ → ventana de configuración, tooltip con los cuatro proveedores) y capturas del tooltip. Script propio en `%TEMP%`. Le queda: el instalador NSIS, el cuelgue de `preview:settings` y los cuatro apuntes de la revisión de código |

### De `session-8a303ef4` (revisión a fondo): los items 12 y 17, en detalle

Punto de partida: `beta` = `origin/beta` = `452220f`, **árbol limpio**. Nada
de esto bloquea una release; es robustez, seguridad y limpieza.

**Orden recomendado: 17 antes que 12**, y los dos **antes que F1** (el
refactor del núcleo de Android mueve `src/main/http.js` y
`src/main/providers/*`, que son justo los ficheros del item 17; si se hace al
revés, el trabajo se deshace).

- [ ] **Item 17 — código muerto y duplicación** (barato, sin riesgo de datos):
  - `src/main/config.js`: quitar `locale` de `DEFAULTS` (no se usa por nada).
  - `src/main/credentials.js`: quitar `gemini` de `ENV_KEYS` y su rama en
    `fromDsh` (no hay proveedor de Gemini); quitar el export `dshCredentials`
    (solo se usa dentro del módulo).
  - `src/main/card.js`: quitar `isInteractive()` y el export `CARD_WIDTH`
    (ningún consumidor).
  - `src/main/local/antigravity-client.js`: quitar el export `describe()`.
  - `src/main/main.js`: el modo `--probe` **duplica** `scripts/probe.js`; que
    `scripts/run.js` lance el sondeo en Node puro y quite el bloque de
    `main.js`.
  - `src/main/http.js`: mover `formatTokens` aquí (está copiado en
    `claude.js` y `deepseek.js`) y sacar un helper único de métrica de
    porcentaje (el bloque `value`/`short`/`remaining`/`pct`/`tone` está
    repetido en Minimax, Claude y Antigravity).
  - **Criterio de aceptación**: `npm test` sigue en verde (los 16 tests de
    `scripts/test-parsers.js` cubren justo los parsers que se tocan) y el
    formato de las métricas **no cambia** en la tarjeta (mismo `15.4% usado`,
    mismo `queda 84.6%`): es un refactor, no un cambio de aspecto.
- [ ] **Item 12 — cifrar las credenciales con `safeStorage`** (más delicado):
  - Ficheros: `src/main/credentials.js` (cifrar/descifrar),
    `src/main/settings.js` (guardar) y `src/renderer/settings.js` (no
    mostrar la clave en claro al cargar el formulario).
  - Diseño a decidir: Electron trae `safeStorage` (DPAPI en Windows, Keychain
    en macOS). Guardar `enc:v1:<base64>` en `config.json` y descifrar al leer;
    **migrar** las claves ya guardadas en claro (si al leer no viene el
    prefijo, se trata como texto plano).
  - **Trampa importante**: `scripts/probe.js` corre en **Node puro** (lo usa
    el job `verify` del pipeline), y ahí `safeStorage` **no existe**. O el
    sondeo se salta las credenciales cifradas, o la cascada se resuelve solo
    con las del sistema. Hay que decidirlo antes de tocar nada, o el pipeline
    se rompe.
  - **Segundo caso**: `safeStorage.isEncryptionAvailable()` puede ser `false`
    (Linux sin keyring). Entonces: seguir en claro y **avisar** en la tarjeta,
    no fallar.
  - **Criterio de aceptación**: en Windows, la clave de una cuenta ya no es
    legible en `config.json`; la app sigue funcionando con ella; y el
    `npm run probe` del CI **no se rompe**.
- [ ] **Después**: **liberar `src/main/providers/*`** (y `src/main/http.js`)
  para que la sesión `session-fa207887` pueda empezar **F1**, y avisar en
  `STATUS.md` con un commit `docs:`.
- [ ] **Item 18-bis — linter**: decisión del usuario (añadir ESLint + un job
  de CI toca el pipeline; ya está en *Decisiones que son del usuario*).
- [ ] Al cerrar, actualizar `STATUS.md` (fusionando) con lo hecho.

### Decisiones que son del usuario

- **Publicar `v1.0.0`** (la primera estable) o seguir en `beta` un rato más.
- **Electron 38.8.6 → 42.11.16**: el PR #1 de Dependabot está cerrado sin
  fusionar y GitHub avisa de **34 vulnerabilidades** en `main`. Subir o
  documentar el riesgo.
- **Play Store** (o no): el plan asume **sideload**, sin Google Play.
- **Linter** (ESLint) y un job de CI nuevo.

### Notas para quien siga

- `preview-card.png` se regenera en cada vista previa: una ejecución
  interrumpida lo deja a **0 bytes**. **Restaurarlo** con
  `git checkout -- preview-card.png`, nunca commitearlo roto.
- Las vistas previas ya se ponen solas `disable-gpu` (`814b6f5`): basta
  `npm run preview` con `ELECTRON_RUN_AS_NODE` **vacío**.

### Retomar (en 5 minutos)

```bash
cd C:\Users\carch\Nextcloud\Scripts\Usagia
git switch beta && git pull --ff-only
npm test && npm run test:package     # tienen que salir OK
```

Y para lo visual, con `ELECTRON_RUN_AS_NODE` **vacío**:
`npm run preview` (tarjeta) y `npm run preview:settings` (configuración).
Si `preview-card.png` queda a 0 bytes: `git checkout -- preview-card.png`.

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
| v1.0.0-beta.6 | 2026-11-16 01:25 | Lo que había sin publicar tras `beta.4`: la cola de la revisión (items 11, 13-16, 18), los arreglos de las cuatro sesiones (`cfe09d7` ids de cuenta, `3e13411` `pct100` con espacios, `31f03ca` la nota de la cuenta, `814b6f5` fallback sin GPU) y los `docs:` de `STATUS.md` |
| v1.0.0-beta.5 | 2026-11-16 01:19 | Primer push de la cola de la revisión (parte de los commits publicables) |
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
