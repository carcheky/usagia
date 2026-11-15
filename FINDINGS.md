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
| Claude | `GET https://api.anthropic.com/api/oauth/usage` | `Bearer sk-ant-oat…` + `anthropic-beta: oauth-2025-04-20` | cache cifrada de Claude Desktop (`%APPDATA%\Claude\config.json` → `oauth:tokenCacheV2`, DPAPI + AES-256-GCM) |
| Antigravity | `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` | `Bearer ya29…` (Google OAuth) | Administrador de credenciales de Windows, destino `gemini:antigravity` → `refresh_token` → `oauth2.googleapis.com/token` |
| DeepSeek | `GET https://platform.deepseek.com/api/v0/users/get_user_summary` | cabecera `x-dsh-auth-token: <token>` (NO es `Bearer`) | grant OAuth `deepseek-account-platform/default` del harness |

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
   usarlo. Si caduca sin renovar, hay que reloguear la app de Claude.
5. La ventana de 5 h de Minimax es de **hora fija** (no rodante desde la
   primera petición): los reinicios que muestra la app salen del propio API.
6. **Google AI Studio**: la clave propia está en **Free Tier** (429 con
   `limit: 0` en 6 de 22 modelos). No es una reserva fiable.

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

## 6. Guiones sueltos que ya funcionan

```bash
node scripts/antigravity-quota.mjs                       # cuota de Antigravity (JSON + resumen)
pwsh -File scripts/Get-AntigravityQuota.ps1               # lo mismo en PowerShell
pwsh -File scripts/get-claude-usage.ps1 -Json             # cuota de Claude
pwsh -File scripts/get-deepseek-balance.ps1 -Json         # saldo y gasto de DeepSeek
node scripts/check-antigravity-inference.js               # comprueba que Antigravity NO genera (429/403)
npm run probe                                             # los cuatro proveedores desde la app
node scripts/test-accounts.js                             # pruebas del modelo de cuentas
npm run preview:settings                                  # captura de la ventana de configuración
```

