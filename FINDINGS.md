# Hallazgos verificados (fuente única de verdad)

Este documento es la referencia compartida entre la app **Usagia** y cualquier
otro agente que trabaje sobre las mismas cuotas. Todo lo de aquí está
**verificado con llamadas reales** el 2026-11-15 (solo GET de metadatos: no
consume tokens de IA).

## 1. Convención de semántica (lo que más confunde)

**Todas las APIs consultedadas devuelven datos heterogéneos.** La app los
normaliza TODOS a **"consumido"**, que es lo que muestran todos los paneles de
cada proveedor (barra llena = mucho gastado).

| Proveedor | Campo crudo | Qué significa | Cómo lo pinta la app |
|---|---|---|---|
| Minimax | `current_interval_remaining_percent` | **lo que QUEDA** (0-100) | `1 - valor/100` → "% usado" |
| Minimax | `current_weekly_remaining_percent` | **lo que QUEDA** (0-100) | `1 - valor/100` → "% usado" |
| Claude | `five_hour.utilization` / `seven_day.utilization` | **lo CONSUMIDO** (0-100) | `valor/100` → "% usado" |
| Claude | `limits[].percent` (kind `weekly_scoped`) | **lo CONSUMIDO** (0-100) del límite con ámbito | `valor/100` → "% usado" |
| Antigravity | `buckets[].remainingFraction` | **lo que QUEDA** (0-1) | `1 - valor` → "% usado" |
| DeepSeek | `normal_wallets[].balance` | saldo absoluto (USD/CNY) | sin barra |

**Las escalas son fijas por proveedor: no se deducen del valor.** Una versión
anterior de `pct()` intentaba adivinar ("si > 1, divide entre 100") y fallaba
justo en el valor **1**, que es donde se confunde "1 %" con "100 %":
`five_hour.utilization = 1.0` (1 % usado) se pintaba como **100 % usado**, con
la barra en rojo y la etiqueta "queda 0 %", mientras el panel de Claude decía
"Sesión actual 1 % usado". La función correcta es `pct100()`, que divide entre
100 sin adivinar. `remainingFraction` de Antigravity ya viene en 0-1 y por eso
no pasa por ahí.

Esto no es una invención: las librerías que hacen lo mismo lo invierten en la
entrada para mantener la convención de "% consumido" —
[ai_usagebar](https://docs.rs/ai_usagebar/latest/ai_usagebar/minimax/types/):
*"The percentages are what REMAINS, not what was consumed. They are inverted
here so the rest of the app keeps its consumed-% convention"*, y
[MinimaxSnapshot](https://docs.rs/ai_usagebar/1.10.0/src/ai_usagebar/usage/struct.MinimaxSnapshot.html):
*"the API reports the percentage remaining, which is inverted on the way in so
these windows carry consumed-% like every other vendor's"*.

Ojo con un detalle de Minimax: los campos `*_usage_count` **NO** son lo usado,
son lo que queda (comportamiento del API "remains"). La app usa solo los
`*_percent`.

## 2. Endpoints y credenciales

| Proveedor | Endpoint | Autenticación | Credencial en esta máquina |
|---|---|---|---|
| Minimax | `GET https://api.minimax.io/v1/token_plan/remains` | `Bearer sk-cp-…` | `MINIMAX_API_KEY` del harness DSH (`~/.dsh/.credentials.yaml`) |
| Claude | `GET https://api.anthropic.com/api/oauth/usage` | `Bearer sk-ant-oat…` + `anthropic-beta: oauth-2025-04-20` (**solo OAuth**) | cache cifrada de Claude Desktop (`%APPDATA%\Claude\config.json` → `oauth:tokenCacheV2`, DPAPI + AES-256-GCM) |
| Antigravity | `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` | `Bearer ya29…` (Google OAuth) | Administrador de credenciales de Windows, destino `gemini:antigravity` → `refresh_token` → `oauth2.googleapis.com/token` |
| DeepSeek | `GET https://platform.deepseek.com/api/v0/users/get_user_summary` | cabecera `x-dsh-auth-token: <token>` (NO es `Bearer`) | grant OAuth `deepseek-account-platform/default` del harness |

**La credencial de Claude tiene que ser un token OAuth (`sk-ant-oat…`).** Una
clave API (`sk-ant-api…`, la de `ANTHROPIC_API_KEY`) **no vale** para la cuota:
el endpoint la rechaza, y como la app la habría tomado como credencial "manual",
además de fallar impediría consultar la sesión local. Por eso `resolve()` la
descarta y avisa en la nota de la tarjeta. Fuentes de token OAuth, en orden:

1. Token pegado a mano en la configuración de la cuenta (otra cuenta de Claude).
2. `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` (Claude Code).
3. La caché cifrada de Claude Desktop, que solo se puede leer en Windows y con
   el script de PowerShell (`scripts/get-claude-usage.ps1`).

Además, DeepSeek expone `/api/v0/usage/amount?month&year` (tokens por modelo) y
`/api/v0/usage/cost?month&year` (coste). Si algún día hay una API key `sk-` de
DeepSeek, el endpoint público es `GET https://api.deepseek.com/user/balance`.

## 3. Valores verificados (2026-11-15 ~14:35)

| Proveedor | Ventana | Lo que queda | Lo usado |
|---|---|---|---|
| Minimax | 5 h | 63 % | **37 %** |
| Minimax | semanal | 34 % | **66 %** |
| Claude | 5 h | **99 %** | **1 %** (reinicia 18:30) |
| Claude | semanal | 72 % | 28 % |
| Claude | semanal con ámbito (`weekly_scoped`, "Fable") | 54 % | 46 % |
| Antigravity | Gemini Models semanal | **84,6 %** | 15,4 % |
| Antigravity | Gemini Models 5 h | 100 % | 0 % |
| Antigravity | Claude and GPT models (5 h y semanal) | 100 % | 0 % |
| DeepSeek | saldo | $33,64 USD + ¥4,69 bonus | 22,4 M tokens y 475 peticiones este mes |

**Corrección (2026-11-15 14:35):** la fila de Claude en la 5 h decía antes
"0 % que queda / 100 % usado". Eso era **el bug de `pct()`** descrito en la
sección 1, no la realidad: el endpoint devuelve `five_hour.utilization = 1.0`
(= 1 % usado) y `resets_at = 18:30`, que casa exactamente con el "Sesión
actual 1 % usado · Se restablece a las 6:30 p. m." del panel de Claude.
Verificado contra el propio panel en pantalla: 1 % / 28 % / 46 %, los tres
valores que ahora pinta la app.

**Coincidencia con el otro agente:** la sesión paralela de DSH (la que trabaja
en el enrutado del harness) verificó Antigravity con
`scripts/antigravity-quota.mjs` y obtuvo *gemini-weekly 84,6 %*, *gemini-5h
100 %*, *3p-weekly 100 %*, *3p-5h 100 %* — **idéntico** a lo que muestra la app
(que lo expresa como "15,4 % usado" / "queda 84,6 %"). Los dos agentes
trabajan sobre los mismos hechos.

Esa sesión además documentó en `~/.dsh/AGENTS.md` una sección **"Varias cuotas
de golpe"** que apunta a `npm run probe` de esta app como forma rápida de ver
las cuatro cuotas juntas, y una tabla de estado que coincide con las cifras
anteriores. La coordinación vive en los dos lados: `AGENTS.md` (enrutado) y este
fichero (app de bandeja).

### Medición del 2026-11-16 02:30 (desde una sesión de DSH, fuera del sandbox)

| Recurso | Lo que queda | Lo usado | Cómo se midió |
|---|---|---|---|
| Minimax | 26 % (5 h) · 92 % (semanal) | **74 %** · **8 %** | `npm run probe` (HTTP directo) |
| Claude | 0 % (5 h) · 58 % (semanal) | **100 %** · **42 %** | `npm run probe` (HTTP directo, token del harness) |
| Antigravity | 84,6 % (semanal) | 15,4 % | `npm run probe` (HTTP directo) |
| DeepSeek | $33,64 + ¥4,38 de bonus | 24,7 M tokens, 511 peticiones | `npm run probe` (HTTP directo) |

**La ventana de 5 h de Claude estaba AL 100 %** (reinicia a las 4:30), y la app
no lo enseñaba: se quedaba en el respaldo local. Ver *Por qué Claude no salía*.

### Por qué Claude no salía (y cómo se arregla)

Tres cosas a la vez, todas verificadas el 2026-11-16 02:00-02:30:

1. **El token de `~/.claude/.credentials.json` estaba CADUCADO** (`expiresAt`
   = 2026-11-15T20:38Z, ya en el pasado). Con ese token el endpoint responde
   **401** *"OAuth access token has been revoked"*, no 429 ni 200. El
   `.ps1` lo elegía sin mirar la fecha, así que gastaba la única petición
   de la ventana en un token muerto.
2. **El token del harness sí valía** (`~/.dsh/.credentials.yaml` →
   `records['llm-pi-ai/anthropic'].payload.access`, `expires` 2026-11-16T06:26Z):
   **HTTP 200** con `five_hour.utilization = 100`. Es la misma sesión OAuth de
   Claude Code, pero la copia que el harness renueva.
3. **La caché cifrada de Claude Desktop también valía** (`oauth:tokenCacheV2`,
   grants con scope `user:sessions:claude_code`, `expiresAt` 2026-12-04):
   **HTTP 200**. Es la fuente **más duradera**: sus tokens duran meses cuando
   los de la CLI caducan en horas.

**El arreglo:** la app deja de elegir *un* token y prueba una **lista de
candidatos en orden** (manual → CLI si no caducado → harness si no caducado →
caché de Claude Desktop). Solo se pasa al siguiente si el anterior falló de
**autenticación** (401/403): un 429 no se reintenta, porque el endpoint da
~5 peticiones por ventana y repetirlas las gasta. Además, un token con
`expiresAt` en el pasado no se usa: se descarta antes de gastarlo un 401.

**El `.ps1` también**: ahora descarta los grants caducados de la caché
(`expiresAt` en el pasado) y salta el token de la CLI si venció, en vez de
usarlo a ciegas.

> **Ojo con `~/.claude/.credentials.json`:** Claude Code lo reescribe por su
> cuenta (el 2026-11-16 01:56 lo dejó sin `accessToken` en claro). Por eso la
> app no debe depender de ese fichero: la caché de Claude Desktop y el
> registro del harness cubren ese hueco.

### Lo que se midió y lo que no, y por qué (no es un fallo de la app):

- `npm run probe` da **`spawn EPERM`** en Claude y Antigravity: el sandbox de
  DSH no permite que Node lance un proceso hijo capturando su salida por tubería
  (`stdio: 'pipe'`). Los proveedores que van por HTTP directo (Minimax,
  DeepSeek) funcionan. Se esquivó lanzando el script suelto con redirección a
  fichero.
- **PowerShell no puede hacer HTTPS en el sandbox**: `Invoke-RestMethod` falla
  con *"The SSL connection could not be established"* contra **todos** los hosts
  (minimax, anthropic, deepseek). El `fetch` de Node sí funciona. O sea: el
  `.ps1` de Claude **descifra bien** la caché (llega hasta la petición) y lo que
  falla es el TLS de PowerShell, no el descifrado.
- **Electron no arranca en el sandbox** (`GPU process launch failed:
  error_code=18`), así que `npm run preview` y `preview:settings` no se pueden
  ejecutar desde una sesión de DSH: hay que lanzarlos fuera.
- **Cómo se lanzan fuera del sandbox** (probado el 2026-11-16 00:42, ajustado
  el 01:55 con `814b6f5`): la app **se pone sola** `disable-gpu` cuando ve
  `--preview` o `--settings`, así que basta `npm run preview` /
  `npm run preview:settings`. Lo único que hay que cuidar es que
  `ELECTRON_RUN_AS_NODE` esté **vacío**: si está activo, Electron corre como
  Node y responde *"bad option: --disable-gpu"*, que es el síntoma engañoso.
  Antes de `814b6f5` había que pasar las banderas a mano.
- **Las vistas previas ya no mueren en silencio** con la app en marcha: antes
  el bloqueo de instancia única las echaba (código 0, sin decir nada) y no se
  llegaba a sacar la captura. Ahora `--preview` y `--settings` están exentos
  (como `--probe`) y el segundo arranque de la app explica por qué se cierra.
- **La captura sale a 0 bytes si la app instalada está en marcha**: el
  `userData` compartido y el caché de disco en uso hacen que Chromium no
  cree su caché y el *render frame* muera antes de tiempo. Con un
  `--user-data-dir` propio y `--disable-gpu --disable-gpu-sandbox --no-sandbox`
  la captura sale bien (verificado el 2026-11-16 02:20).
- El endpoint de cuota de Claude estaba devolviendo **HTTP 429** durante la
  revisión del 2026-11-16 00:00 (límite de ~5 peticiones por ventana). Con el
  `trap` nuevo del `.ps1` el motivo sale entero: *"HTTP 429: límite de
  peticiones del endpoint de uso"*.

## 4. Puntos abiertos (para el otro agente)

1. **Antigravity: cuota al 100 % pero `generateContent` devuelve 429.**
   Verificado de forma independiente en esta máquina con `scripts/check-antigravity-inference.js`
   (token renovado en el momento, 2026-11-15 14:20):

   | Petición | Respuesta |
   |---|---|
   | `POST cloudcode-pa.googleapis.com/v1internal:generateContent` (`gemini-3.1-pro-preview`) | **429** `RESOURCE_EXHAUSTED` |
   | `POST cloudcode-pa.googleapis.com/v1internal:generateContent` (`gemini-2.5-pro`) | **429** `RESOURCE_EXHAUSTED` |
   | `POST generativelanguage.googleapis.com/v1beta/models/…:generateContent` | **403** `PERMISSION_DENIED` — *"insufficient authentication scopes"* |

   Conclusión (coincide con la del otro agente): la cuota que expone
   `retrieveUserQuotaSummary` es **por grupo y ventana**, mientras que el 429
   viene de otro límite (capacidad global o derecho de producto). **Antigravity
   sirve para MONITORIZAR cuota, no como ruta de inferencia desde DSH.** La app
   lo monitoriza y no lo usa como ruta.

2. **Claude: el límite con ámbito puede ir más cargado que el agregado.**
   El panel de Claude muestra además `limits[].kind === "weekly_scoped"` (por
   modelo, p. ej. "Fable"), que es el límite que aplica de verdad. El agregado
   `seven_day.utilization` puede verse mucho más bajo. Ojo también con
   `seven_day_breakdown.rows[].key === "claude_code"`: dice qué parte de la
   cuota semanal es de Claude Code (frente a chat o cowork).
3. **El endpoint de cuota de Claude no es público** y la comunidad reporta ~5
   peticiones por ventana (429). La app cachea la respuesta 10 minutos.
4. El token de Claude caduca el **2026-12-04**; lo renueva Claude Desktop al
   usarlo. Si caduca sin renovar, hay que reloguear la app de Claude. Los
   tokens de `~/.claude/.credentials.json` caducan mucho antes (horas): por eso
   la app prueba **varios** candidatos en vez de fiarse del primero.
5. La ventana de 5 h de Minimax es de **hora fija** (no rodante desde la
   primera petición): los reinicios que muestra la app salen del propio API.
6. **Google AI Studio**: la clave propia está en **Free Tier** (429 con
   `limit: 0` en 6 de 22 modelos). No es una reserva fiable.
7. **El `limits[]` de Claude trae una fila `kind: "session"`** con
   `percent: 100` y `severity: "critical"` cuando la ventana de 5 h está
   agotada (es el mismo dato que `five_hour.utilization`, no una cuota
   aparte). El `weekly_scoped` (`percent: 74`, "Fable") sale con
   `is_active: false` cuando la cuota con ámbito no es la que aplica: la app
   la ignora, que es lo correcto.

## 5. Comportamiento de la app

- **Hover** sobre el icono → aparece la tarjeta; se oculta al apartar el ratón.
- **Clic** → fija la tarjeta (toggle). Hay antirrebote de 400 ms porque un
  doble clic generaba dos eventos y alternaba fijar/soltar de golpe.
- La tarjeta se dimensiona sola al contenido y se sirve por un protocolo
  propio `app://` (con `file://` la CSP no admite `'self'` y el CSS no carga).
- **Watchdog**: `scripts/run.js` relanza Electron si muere con código distinto
  de 0 (por ejemplo si otra sesión lo mata). Un cierre normal desde el menú de
  la bandeja (código 0) no se relanza. Máximo 10 reintentos.
- La tarjeta no intercepta el ratón: no impide usar lo que hay debajo. **Salvo
  cuando el puntero está encima de la tarjeta**, que entonces pasa a ser
  interactiva (`setIgnoreMouseEvents(false)`) para que se pueda pulsar su
  botón ⚙. La carta que el sistema envía al proceso principal va en DIP, y el
  ratón de Windows usa coordenadas lógicas: con escalado 200 % hay que
  dividir por 2 para colocar el puntero.
- En Windows el tooltip del sistema está limitado a ~127 caracteres: ahí cabe
  el resumen corto de las cuatro IAs; la tarjeta es la vista completa.

### El orden de las ventanas (una regla para todos)

Cada API devuelve sus ventanas en **su propio orden** y no coinciden: la 5 h
iba primera en Minimax y en Claude, pero **segunda** en Antigravity (que la
devuelve tras la semanal). Con la tarjeta era imposible comparar de un vistazo.

**Regla única:** la ventana **más corta primero** (la que se acaba antes), y
de más larga a más larga:

| `window` | Ventana | Posición |
|---|---|---|
| `5h` | 5 horas | 1.ª |
| `daily` | diaria | 2.ª |
| `weekly` | semanal | 3.ª |
| `weekly_scoped` | semanal con ámbito (otro modelo) | 4.ª |
| `monthly` | mensual | 5.ª |

Implementado en `http.sortMetrics()` (`src/main/http.js`), con el orden
**estable** y respetuoso con los **grupos**: Antigravity separa sus cuotas
por familia de modelos y sus bloques no se separan al ordenar (Gemini
Models 5 h, Gemini Models semanal, Claude and GPT models 5 h, …). Lo que no
sea una ventana de cuota (el saldo de DeepSeek, los tokens) queda al final:
no compite por el sitio.

### Cómo se leen las barras (regla de la casa)

La barra de cada métrica **mide lo CONSUMIDO**, igual que los paneles de cada
proveedor: **barra llena = cuota agotada**, y el color avisa antes de que
llegue:

| Lo que queda | Color | Lectura |
|---|---|---|
| > 30 % | verde | de sobra |
| 10-30 % | amarillo | ojo, se acaba |
| ≤ 10 % | **rojo** | casi agotada |

Con el **punto** de la fila pasa lo mismo: refleja la **cuota**, no el estado
de la consulta. Una cuota al 100 % se pinta en rojo aunque la consulta haya
ido bien.

Reglas que se aplican:

- **Una métrica SIN PORCENTAJE no lleva barra.** Antes se pintaba una barra
  apagada al 100 % de ancho, que parecía "cuota agotada" cuando en realidad no
  había porcentaje (saldo, tokens, peticiones). Ahora solo sale el valor.
- **La etiqueta va solo con el nombre** de la ventana. Antes llevaba también
  "queda 43 %", que no cabía en los 122 px de la columna y se cortaba a
  medias. Lo que queda se ve en el **tooltip** (ratón encima de la barra o del
  valor).
- **El porcentaje va DELANTE en la cabecera** de la fila ("100 % usado ·
  ventana 5 h"): la columna se recorta por el final, así que lo que no puede
  perderse es cuanto se ha gastado.
- **Sin cuota remota NO es "todo correcto"**: el estado es `warning` (punto
  amarillo, texto en amarillo) y la nota explica por qué. Antes la fila
  salía en verde con datos que NO eran la cuota (transcripciones locales), que
  es justo la confusión de "no sé si he gastado la cuota".

### Cuentas (varias del mismo proveedor)

Desde la v1.1 la app tiene una **ventana de configuración** (botón ⚙ de la
tarjeta o *Configuración…* en el menú del icono) donde se gestionan las
**cuentas**:

- Una cuenta = un proveedor + un nombre + su credencial + su interruptor.
- Se admiten **varias cuentas del mismo proveedor** (una por cuenta de IA):
  la tarjeta muestra una fila por cuenta.
- `config.json` -> `accounts: [{ id, provider, label, enabled, credentials }]`.
  Si `accounts` está vacío, se usa la autodetección (una cuenta por proveedor).
- La credencial de una cuenta tiene prioridad sobre la global del proveedor
  (`credentials.<provider>`), y esa sobre las variables de entorno.
- **El id de la cuenta es la clave de los resultados y de las cachés**: Claude
  y Antigravity cachean por cuenta, porque si no la respuesta de una cuenta se
  le sirve a otra. Lo mismo con `ctx.instance` en el `ctx` de cada proveedor.
- Las pruebas de este modelo están en `scripts/test-accounts.js` (Node puro) y
  las ejecuta el job `verify` del pipeline.

## 6. El paquete (asar): el fallo que no se veía en desarrollo

**Medido el 2026-11-15 en la v1.0.0-beta.2 publicada.** La app instalada
**no mostraba la tarjeta** al pasar el ratón, y el exe seemed funcionar
(arrancaba, tenía icono, la ventana de configuración abría). En desarrollo
todo iba bien, porque `npm start` no empaqueta nada.

Causa: `build.files` solo incluía `src/**` y `assets/**`. **La carpeta
`scripts/` no viajaba en el paquete**, así que en la app instalada faltaban
los tres scripts de PowerShell que la app ejecuta en tiempo de ejecución:

| Script | Para qué | Sin él |
|---|---|---|
| `find-tray-icon.ps1` | localizar el icono de la bandeja | **la tarjeta nunca sale** (no hay ancla) |
| `cred-read.ps1` | leer el Administrador de credenciales | Antigravity ponía *"sin credencial"* |
| `get-claude-usage.ps1` | cuota real de Claude | Claude solo enseñaba las transcripciones locales |

Arreglo (tres cosas, las tres hacen falta):

1. `build.files` incluye `scripts/**/*`.
2. `build.asarUnpack` incluye `scripts/**/*`: dentro de `app.asar` (que es un
   *archivo* con sistema de ficheros virtual) PowerShell no puede ejecutar un
   `.ps1`.
3. `src/main/local/script-path.js` traduce la ruta `app.asar\...` a
   `app.asar.unpacked\...` antes de pasársela a PowerShell. **Cuidado al
   trocear la cadena**: el separador va después de `app.asar`, si no sale
   `app.asar.unpackedscripts\...` y la comprobación de existencia falla en
   silencio.

Lo blinda `scripts/test-package.js`, que ejecuta el job `verify` del pipeline.

**Trucos de pruebas que casi costan un diagnóstico falso:**

- `ELECTRON_RUN_AS_NODE=1` estaba en el entorno del shell: Electron se
  ejecutaba como Node y **no abría ninguna ventana**. El síntoma (proceso
  vivo, sin ventanas) es el de "la app no pinta nada". Se ve enseguida en la
  salida: `bad option: --preview` (lo dice Node, no Electron).
- Las coordenadas del ratón de Windows son **lógicas**, y UI Automation
  devuelve **físicas**. Con escalado 200 % hay que dividir entre 2, o el
  puntero se va a la esquina de la pantalla.
- Los scripts de PowerShell necesitan **PowerShell 7** (`pwsh`), no el 5.1.

## 7. Guiones sueltos que ya funcionan

```bash
node scripts/antigravity-quota.mjs                       # cuota de Antigravity (JSON + resumen)
pwsh -File scripts/Get-AntigravityQuota.ps1               # lo mismo en PowerShell
pwsh -File scripts/get-claude-usage.ps1 -Json             # cuota de Claude
pwsh -File scripts/get-deepseek-balance.ps1 -Json         # saldo y gasto de DeepSeek
node scripts/check-antigravity-inference.js               # comprueba que Antigravity NO genera (429/403)
npm run probe                                             # los cuatro proveedores desde la app
node scripts/test-accounts.js                             # pruebas del modelo de cuentas
node scripts/test-package.js                              # pruebas del paquete (scripts desempaquetados)
npm run preview:settings                                  # captura de la ventana de configuración
```

