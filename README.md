# Usagia

App de escritorio (Electron) para **ver el uso actual de tus IAs de un vistazo**:
un icono en la bandeja del sistema y, al pasar el ratón por encima, una
tarjeta con la cuota restante de cada proveedor.

![Tarjeta de Usagia](preview-card.png)

Proveedores incluidos ahora mismo:

| Proveedor | Qué muestra | De dónde sale |
|---|---|---|
| **Minimax** | % restante de la ventana de 5 h y de la semanal | `api.minimax.io/v1/token_plan/remains` |
| **Claude** | % libre de la ventana de 5 h y de la semanal | `api.anthropic.com/api/oauth/usage` |
| **Antigravity** | % restante por grupo de modelos (Gemini, Claude/GPT) y por ventana | `cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` |
| **DeepSeek** | saldo, bonus, gasto del mes y tokens consumidos | `platform.deepseek.com/api/v0/...` |

Funciona en **Windows, macOS y Linux** (Electron). El comportamiento del hover
se adapta a cada sistema:

- **Windows**: tooltip nativo del sistema (multilínea) + tarjeta rica. Para que
  salga la tarjeta, el icono tiene que estar en la **zona visible** de la
  bandeja (en Windows 11 los iconos nuevos empiezan en "iconos ocultos":
  arrástralo a la barra y listo).
- **macOS / Linux**: la tarjeta aparece sobre el icono de la barra de menús.

## Instalación y arranque

```bash
npm install          # instala Electron
npm start            # arranca la app (icono en la bandeja)
```

Otros comandos:

```bash
npm run probe            # consulta los proveedores y vuelca el resultado por consola
npm run preview          # abre la tarjeta sola, con datos reales, y guarda una captura
npm run preview:settings # abre la ventana de configuración y guarda una captura
npm test                 # pruebas de las cuentas (Node puro, sin GUI)
npm run test:package     # pruebas del paquete (lo que se publica)
npm run dist             # empaqueta instaladores (Windows / macOS / Linux)
```

> Si `npm install` no descarga el binario de Electron (política de scripts de
> npm), ejecuta `node node_modules/electron/install.js`.

## Cómo se autentican los proveedores

Por defecto la app **no necesita claves propias**: lee las credenciales que ya
tienes en el sistema, en este orden:

1. La credencial que hayas pegado para **esa cuenta** en la ventana de
   configuración (si la dejas vacía, se sigue bajando por la lista).
2. Variables de entorno: `MINIMAX_API_KEY`, `DEEPSEEK_API_KEY`,
   `GOOGLE_API_KEY`, `ANTIGRAVITY_TOKEN`. (`ANTHROPIC_API_KEY` también se lee,
   pero **no sirve para la cuota de Claude**: el endpoint solo acepta tokens
   OAuth `sk-ant-oat…`; la app descarta la clave API y lo avisa en la nota.)
3. El harness DSH (`~/.dsh/.credentials.yaml`): la clave de Minimax y el grant
   OAuth de la cuenta de DeepSeek.
4. Los almacenes nativos de cada herramienta:
   - **Antigravity**: Administrador de credenciales de Windows, destino
     `gemini:antigravity` (el `refresh_token` se canjea por un `access_token`).
   - **Claude**: el token OAuth de Claude Code
     (`~/.claude/.credentials.json` → `claudeAiOauth.accessToken`) y, en Windows,
     la caché cifrada de Claude Desktop
     (`%APPDATA%\Claude\config.json` → `oauth:tokenCacheV2`, DPAPI + AES-256-GCM).
     La caché necesita **PowerShell 7** (`pwsh`), porque Windows PowerShell 5.1 no
     trae `AesGcm`.

Si un proveedor no está configurado, aparece en la tarjeta como *"sin
credencial"* en lugar de desaparecer.

## Configuración

Hay una **ventana de configuración** dentro de la app: el botón **⚙** de la
tarjeta (o *Configuración…* en el menú del clic derecho). Ahí se pueden:

- **Añadir cuentas**: se admite **varias cuentas del mismo proveedor** (una por
  cuenta de IA). Cada cuenta tiene su nombre, su credencial y su interruptor
  de activación, y aparece como una fila propia en la tarjeta.
- **Modificar** cualquiera de ellas, probar la credencial (*Probar*) y
  borrarla.
- Ajustar los valores generales (cada cuánto se refresca, si se muestra al
  pasar el ratón, cuánto tarda en cerrarse).
- Elegir el **canal de actualización** (automático, solo estables o con
  betas) y comprobar a mano si hay una versión nueva (_Buscar ahora_).

## Actualizaciones

La app mira las releases publicadas en GitHub y **se actualiza sola** cuando el
binario instalado lo permite (el instalador NSIS de Windows y el AppImage de
Linux): descarga la versión nueva en segundo plano, la instala en silencio al
cerrar la app y, si se pulsa el aviso, la instala y vuelve a abrir ya
actualizada. A mano no hay que hacer nada.

- **Tarjeta**: franja con el estado, que cambia sola: `v1.1.0-beta.0002 →
  v1.1.0-beta.0003 disponible`, `Descargando v1.1.0-beta.0003… 42 %`,
  `v1.1.0-beta.0003 lista para instalar` (botón *Reiniciar e instalar`) o el
  motivo del fallo (con el enlace a la release como salida).
- **Menú del icono**: *Buscar actualizaciones*, *Actualizar a …* /
  *Reiniciar e instalar …* y la versión instalada.
- **Ventana de configuración**: buscar, bajar e instalar al cerrar (los tres
  interruptores), el canal, la versión instalada y si ese binario concreto se
  actualiza solo.
- **Aviso del sistema**: una vez por versión, solo en la app empaquetada.

**Cuándo sí y cuándo no** (la ventana de configuración lo dice con el motivo):

| Binario | ¿Se actualiza solo? |
|---|---|
| Instalador NSIS (Windows) | **Sí**: descarga + instalación silenciosa + relanzado |
| AppImage (Linux) | **Sí**: se reemplaza el AppImage y se relanza |
| Portable | No (se descomprime en una carpeta nueva en cada arranque) |
| `.deb`, macOS | No (queda el enlace a la release) |

El instalador tarda a propósito 3 s en arrancar: la app tiene que haber muerto
antes, o el NSIS sale con código 2 y no instala nada. El registro de cada
intento queda en `%APPDATA%\Usagia\updater\update.log`.

**El canal** (`updateChannel`) decide qué versiones cuentan:

| Valor | Qué enseña |
|---|---|
| `auto` (defecto) | Sigue a la versión instalada: una beta avisa de betas nuevas (y de la estable, que va por delante); una estable solo de estables |
| `stable` | Solo versiones estables |
| `beta` | Estables y betas |

La comparación es semver: `1.0.0 < 1.0.1 < 1.1.0 < 2.0.0`, y una beta es menor
que su estable (`1.0.0-beta.0010 < 1.0.0`). Se comprueba al arrancar y cada 6
horas (sin gastar cuota: es la API pública de GitHub).

> **La primera vez** hay que instalar a mano: el binario antiguo no trae el
> actualizador. A partir de ahí, las siguientes se instalan solas.

Todo se guarda en `%APPDATA%\Usagia\config.json` (ruta exacta en
`app.getPath('userData')`):

```json
{
  "refreshSeconds": 120,
  "showOnHover": true,
  "hoverCloseDelayMs": 400,
  "updateCheck": true,
  "updateChannel": "auto",
  "updateAutoDownload": true,
  "updateInstallOnQuit": true,
  "accounts": [
    {
      "id": "a1b2c3",
      "provider": "minimax",
      "label": "Trabajo",
      "enabled": true,
      "credentials": { "apiKey": "sk-cp-..." }
    },
    {
      "id": "a4d5e6",
      "provider": "minimax",
      "label": "Personal",
      "enabled": true,
      "credentials": {}
    }
  ]
}
```

- `accounts` vacío = **autodetección**: una cuenta por proveedor, con las
  credenciales que ya haya en el sistema.
- `credentials` dentro de una cuenta es **opcional**: si está vacío, esa cuenta
  usa la cascada habitual (variable de entorno → harness DSH → almacén
  nativo).
- Los dos campos antiguos (`providers` y `credentials` globales) siguen
  funcionando: son la última fuente antes de las variables de entorno.

## Añadir un proveedor nuevo

1. Crea `src/main/providers/<id>.js`:

```js
module.exports = {
  id: 'miia',
  label: 'Mi IA',
  color: '#ff00ff',
  url: 'https://panel.miia.com/',
  // Metadatos para la ventana de configuración (opcional, pero recomendado).
  credential: {
    label: 'Clave API',
    placeholder: 'sk-...',
    hint: 'Déjalo vacío para que se busque sola en el sistema.',
  },
  async resolve(ctx) {           // devuelve { value, source } o null
    return { value: process.env.MIIA_KEY, source: 'entorno' };
  },
  async fetchUsage(ctx) {        // devuelve { status, metrics, note }
    return {
      status: 'ok',
      summary: '80% usado',
      metrics: [{ label: 'semanal', value: '80% usado', short: '80%', remaining: 'queda 20%', pct: 0.8, tone: 'warning' }],
      note: 'reinicia el lunes',
    };
  },
};
```

2. Regístralo en `src/main/providers/index.js`.

El `ctx` que recibe el proveedor lleva la cuenta actual, así que cada cuenta
puede usar su propia credencial:

```js
ctx.config                  // la configuración completa
ctx.instance.id             // id de la cuenta (clave de los resultados y de las cachés)
ctx.instance.provider       // 'miia'
ctx.instance.label          // nombre que ve el usuario
ctx.instance.credentials    // { apiKey: '...' } de ESTA cuenta
```

Para leer la credencial de la cuenta usa la cascada de siempre:

```js
const creds = require('../credentials');
const credential = creds.firstValid([
  creds.fromUserConfig(ctx.config, 'miia', 'apiKey', ctx.instance),
  creds.fromEnv('miia'),
]);
```

Si el proveedor necesita cachear algo por cuenta (Claude y Antigravity lo
hacen), la clave de caché debe incluir el id de la cuenta: si no, la respuesta
de una cuenta se le sirve a otra.

El contrato de una métrica:

| Campo | Significado |
|---|---|
| `label` | Nombre de la ventana ("ventana 5 h", "semanal"…) |
| `value` | Texto que se ve a la derecha ("80% usado") |
| `short` | Versión corta para el tooltip y la cabecera |
| `remaining` | Texto opcional que se añade a la etiqueta ("queda 20%") |
| `pct` | **Porcentaje CONSUMIDO** (0-1): es lo que llena la barra. `null` = barra neutra (importes absolutos) |
| `tone` | Color: `ok` / `warning` (queda <30 %) / `critical` (queda <10 %) |

Recordatorio: si tu API devuelve lo que **queda**, invierte tú el valor
(`pct = 1 - restante`) para que la barra se llene como en los paneles del
proveedor. Está explicado en detalle en [FINDINGS.md](FINDINGS.md).

## Estructura

```
src/main/
  main.js            arranque, bandeja, temporizadores, menú
  card.js            ventana de la tarjeta (sin foco, no roba clics)
  settings.js        ventana de configuración (cuentas y ajustes)
  instances.js       cuentas: normalización, catálogo y lista efectiva
  hover.js           detección de la zona del icono según plataforma
  config.js          configuración persistente
  credentials.js     resolución de credenciales en cascada
  http.js            fetch con timeout y helpers de formato
  providers/         un módulo por proveedor
  local/             credstore (Windows), PowerShell, agregador de transcripciones
src/preload/
  preload.js         puente de la tarjeta
  settings-preload.js puente de la ventana de configuración
src/renderer/        tarjeta y ventana de configuración (HTML/CSS/JS)
scripts/             scripts de PowerShell/Node auxiliares
```

## Hallazgos y semántica

Los endpoints, el formato real de cada respuesta y la convención de
porcentajes (importante: Minimax y Antigravity devuelven lo que **queda**, y
la app lo invierte a **usado**, como hacen todos los paneles) están
documentados en **[FINDINGS.md](FINDINGS.md)**. Ese fichero es la fuente
compartida con el resto de agentes que trabajen sobre estas cuotas.

## Releases

Las versiones las publica **GitHub Actions**, no una persona. La versión la
decide el mensaje del commit (conventional commits) y **nunca se escribe a
mano**.

| Rama | Qué publica |
|---|---|
| `beta` | Pre-releases: `v1.1.0-beta.1`, `v1.1.0-beta.2`… |
| `main` | Versiones estables: `v1.1.0` |

`beta` es la rama de trabajo; `main` es la de publicación y solo recibe
`beta` por *fast-forward*.

```bash
git push origin beta                                          # -> v1.1.0-beta.N
git switch main && git merge --ff-only beta && git push origin main   # -> v1.1.0
```

El pipeline (`.github/workflows/release.yml`) encadena:

```
commits (commitlint) -> verify (humo de la app) -> release (scripts/release.js)
                                                         |
                                    +--------------------+--------------------+
                                    |                                         |
                             build-windows                          build-linux
                        NSIS + portable .exe                  AppImage + deb
```

Cada build compila **desde el tag** que nombra la release, no desde el HEAD de
la rama, y adjunta sus binarios a esa misma release. La versión va incrustada
en el binario (`--config.extraMetadata.version=`); en `package.json` queda
`0.0.0` porque la pone `scripts/release.js`: en `beta` sale `v1.0.0-beta.NNNN`
(siempre cuatro dígitos) y en `main` la estable `v1.0.0`. El changelog solo
 lleva cambios de la app (`feat`, `fix`, `perf`); `ci:`, `chore:` o `docs:` ni
 aparecen ni publican nada.

## Interacción

| Gesto | Qué hace |
|---|---|
| **Pasar el ratón** por el icono | Aparece la tarjeta; se oculta al apartar el ratón |
| **Clic** en el icono | Fija la tarjeta (toggle): se queda abierta hasta otro clic |
| **⚙** en la tarjeta | Abre la ventana de configuración (cuentas y ajustes) |
| **Clic derecho** en el icono | Menú con el resumen de cada IA (clic en uno abre su panel), refresco, configuración y salida |

La tarjeta no intercepta el ratón mientras no tengas el puntero encima: puedes
seguir usando lo que hay debajo. En cuanto el puntero entra en la tarjeta, ésta
pasa a ser interactiva para que se pueda pulsar su botón ⚙.

## Notas y límites

- Los endpoints de cuota de Claude y Antigravity **no son públicos** y pueden
  cambiar sin aviso. El de Claude está limitado a unas 5 peticiones por
  ventana (devuelve 429), por eso la app cachea su respuesta 10 minutos.
- El tooltip de Windows admite unos 127 caracteres: la tarjeta es la vista
  completa.
- La tarjeta es de solo lectura y no intercepta el ratón: puedes seguir
  usando lo que hay debajo (salvo cuando el puntero está encima de la tarjeta,
  que entonces se vuelve interactiva para poder pulsar su ⚙).
- Los scripts de `scripts/` (`get-claude-usage.ps1`, `get-deepseek-balance.ps1`,
  `Get-AntigravityQuota.ps1`, `antigravity-quota.mjs`) también funcionan sueltos
  por consola.
- **Al tocar el empaquetado**, recuerda: los scripts de PowerShell que la app
  ejecuta en tiempo de ejecución (`find-tray-icon.ps1`, `cred-read.ps1`,
  `get-claude-usage.ps1`) tienen que ir **desempaquetados** del `asar` (`build.files`
  + `build.asarUnpack`) y su ruta se resuelve con
  `src/main/local/script-path.js`. Sin eso, la app instalada arranca pero **la
  tarjeta nunca sale al pasar el ratón**. Lo comprueba `npm run test:package`,
  que corre en el job `verify` del pipeline.
