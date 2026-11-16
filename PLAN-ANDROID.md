# Plan: APK de Android en las releases de Usagia

Objetivo: que cada release (`beta` → pre-release, `main` → estable) adjunte,
además del `.exe`, el `.AppImage` y el `.deb`, un **`Usagia-<versión>-android.apk`
firmado e instalable**, construido desde el mismo tag y por el mismo pipeline.

Fecha del plan: 2026-11-15. **Actualizado el 2026-11-16** con las novedades
del repo (revisión a fondo del código ya publicada en `v1.0.0-beta.4`).

Estado del repo al actualizarlo: rama `beta` en `de3d34f`, `v1.0.0-beta.4`
publicada (Windows + Linux), `main` sin versión estable todavía, y
`npm test` = `test-accounts.js` + `test-parsers.js`.

---

## 0. Lo primero: hoy no hay nada que compilar para Android

Usagia es una app **Electron** (`src/main/*` corre en Node, la UI vive en
`src/renderer/*`). Electron **no existe para Android**: `electron-builder`
produce NSIS/portable, AppImage/deb y dmg, y nada más. No hay ningún
`android/`, `gradle`, `capacitor` ni `cordova` en el repo (comprobado con grep).

Por tanto, "compilar la APK en los releases" son **dos trabajos**:

1. **Crear una app Android** que reutilice lo máximo posible del código actual.
2. **Añadirla al pipeline** `.github/workflows/release.yml` con el mismo
   contrato que Windows y Linux (compila el tag, adjunta el binario, no rompe
   lo demás).

Este plan cubre los dos. La parte (1) es la que decide si la (2) es estable:
un APK que haya que "mantener aparte" se queda obsoleto en dos releases.

---

## 1. Decisión técnica: qué hay dentro del APK

### Elegido: **Capacitor 8** envolviendo la UI actual + un núcleo JS compartido

- La tarjeta (`card.html/css/js`) y la ventana de configuración
  (`settings.html/css/js`) ya son HTML/CSS/JS puro: van tal cual a un WebView.
- Los proveedores (`src/main/providers/*.js`) son casi todo **`fetch` +
  parseo**. Lo único que es de Node/Windows es la *resolución de credenciales*
  (`fs`, PowerShell, almacén de Windows). Eso se separa y en Android se
  sustituye por "la credencial que el usuario pega en la configuración".
- **CORS**: el WebView de Capacitor sirve la app desde `https://localhost`;
  `api.minimax.io`, `api.anthropic.com`, etc. no devuelven cabeceras CORS. La
  solución oficial es activar `plugins.CapacitorHttp.enabled: true`, que
  **parchea `window.fetch`** para que las peticiones salgan por la capa nativa
  (sin CORS). Así `fetchJson` (hoy en `src/main/http.js`, que pasa a
  `src/core/`) funciona igual en el WebView, con su mismo `AbortController`
  y su mismo timeout ([doc](https://capacitorjs.com/docs/apis/http)).
- Requisitos de Capacitor 8 (verificados el 2026-11-15 en
  [capacitorjs.com](https://capacitorjs.com/docs/updating/8-0)): Node 22+
  (el pipeline usa 24 ✓), `minSdk 24`, `compileSdk/targetSdk 36`,
  AGP 8.13, Gradle 8.14.3, JDK 21.
- Es lo que menos código nuevo exige y lo que mejor encaja con el
  pipeline actual (es `npm ci` + un `gradlew`, como el resto son `npm ci` +
  `electron-builder`).

### Descartado

| Opción | Por qué no |
|---|---|
| App nativa Kotlin | Reescribir los cuatro proveedores y la UI; dos bases de código que divergen. Inestable por definición. |
| Tauri 2 (sí compila a Android) | Habría que reescribir `src/main` en Rust y abandonar Electron en escritorio o mantener dos *backends*. |
| PWA / TWA (Bubblewrap) | Necesita hosting web + CORS en los proveedores (no lo hay). Y un TWA no es un APK "nuestro". |
| Electron en Android | No existe. |

### Qué funciona en Android y qué no (asumido en el plan)

| Proveedor | En Android | Nota |
|---|---|---|
| Minimax | ✅ | Clave `sk-cp-…` pegada en la configuración. |
| DeepSeek | ✅ | Clave `sk-…` (balance) o token `x-dsh-auth-token` (plataforma), pegados. |
| Claude | ⚠️ parcial | **Solo un token OAuth (`sk-ant-oat…`)**: desde la revisión del 2026-11-15 la app **descarta** las claves API (`sk-ant-api…`) y lo avisa en la nota, porque el endpoint de cuota no las acepta. En Android no hay DPAPI, ni PowerShell, ni transcripciones locales de Claude Code (`localUsage()` no aplica): sin un token OAuth pegado, la fila sale "sin sesión" y **no hay respaldo**. Además el token caduca (el de la sesión local caduca el 2026-12-04), así que hay que re-pegarlo cada cierto tiempo. El caché de 10 min se mantiene (el endpoint da 429). |
| Antigravity | ⚠️ | Solo con `access_token` "raw" pegado (caduca en ~1 h) o JSON con `refresh_token` **más** `ANTIGRAVITY_OAUTH_CLIENT_ID/SECRET` en la configuración. Sin almacén de Windows. Se deja como "funciona si lo configuras"; no bloquea el plan. |

La **cascada de credenciales en Android es de un solo escalón**: configuración
de la app. No hay variables de entorno, ni `~/.dsh`, ni almacenes nativos.

En Android **no hay bandeja del sistema**. La app es la tarjeta como pantalla
principal (con *pull-to-refresh* y el botón ⚙ a la configuración). Widget de
pantalla de inicio / notificación persistente = **fase posterior**, fuera del
alcance del pipeline (sección 9).

---

## 2. Arquitectura del código (refactor mínimo, sin romper el escritorio)

Regla: **un solo código de proveedores** para Electron y Android. Si no, el
APK se queda atrás en la primera release en que se toque un proveedor.

```
src/
  core/                  ← NUEVO: sin Node, sin Electron. Solo fetch + parseo.
    http.js              (se mueve desde src/main/http.js; ya es puro)
    providers/
      minimax.js         fetchUsage(ctx) usa ctx.resolve(providerId) en vez de creds.*
      deepseek.js
      claude.js          sin ps/script-path/jsonl-tokens: solo la rama HTTP
      antigravity.js     refresh OAuth con client id/secret inyectados
      index.js
    metrics.js           pct100 / used / tone / fmt* (hoy en http.js)
  main/                  ← Electron, como ahora
    credentials.js       cascada completa (fs, DSH, PowerShell, credstore)
    providers/claude.js  envoltorio: añade el script de PowerShell y localUsage()
    ...                  (el resto importa de src/core)
  renderer/              ← sin cambios (lo comparten escritorio y Android)
  web/                   ← NUEVO: arranque para el WebView
    bridge.js            implementa `window.usagia` (preload.js) y
                         `window.usagiaSettings` (settings-preload.js) con los
                         MISMOS nombres de método: onState/refresh/open/settings
                         y get/save/test/reveal/close. Estado en
                         @capacitor/preferences; refresco por temporizador
                         (refreshSeconds de la configuración, como main.js).
    index.html           carga card.html; ⚙ → settings.html
  preload/               ← sin cambios
```

Puntos concretos:

- `fetchUsage(ctx)` sigue siendo el contrato. Lo único que cambia es que la
  credencial se obtiene por `ctx.resolve(providerId)` (inyectado) en lugar de
  importar `../credentials`. En Electron, `resolve` es la cascada de siempre;
  en Android, lee la cuenta de la configuración y ya.
- `src/main/providers/claude.js` se queda como **envoltorio** de
  `src/core/providers/claude.js`: en Windows sigue tirando del script de
  PowerShell y de `localUsage()`; el núcleo solo conoce la ruta HTTP.
- Formato: `src/core` sigue en **CommonJS** (como todo el repo). Para el
  WebView se empaqueta con **esbuild** (devDependency, sin config) a un IIFE:
  `esbuild src/web/bridge.js --bundle --format=iife --outfile=www/bridge.js`.
  No se introduce ningún framework.
- `npm test` (`scripts/test-accounts.js` **+ `scripts/test-parsers.js`**) y
  `scripts/test-package.js` tienen que seguir en verde **sin tocarlos**; si el
  refactor los rompe, el refactor está mal. Ojo con `test-package.js`
  (comprobación 3): busca `script('…')` en todo `src/`, así que las llamadas a
  PowerShell se quedan en `src/main/`, nunca en `src/core/`.
- **`scripts/test-parsers.js` sí hay que tocarlo** (y es la excepción): sus
  `require` apuntan a rutas concretas (`src/main/http`, `src/main/credentials`,
  `src/main/providers/claude`, `src/main/providers/antigravity`,
  `src/main/local/antigravity-client`). Al mover el núcleo hay que repuntar
  solo las que cambien de sitio (`http` y los dos proveedores) y **no tocar el
  resto**. Es la luz roja que hay que poner en verde en el commit F1: si el
  núcleo se mueve mal, estas pruebas lo dicen.
- El contrato del renderer no cambia: `card.js` y `settings.js` solo conocen
  `window.usagia` / `window.usagiaSettings`. En Electron los pone el preload;
  en Android los pone `src/web/bridge.js`. Si una pantalla necesita algo
  nuevo, se añade a **los dos** puentes en el mismo commit.
- Nuevo `scripts/build-web.js`: copia `src/renderer/*` + `assets/icon*.png`
  a `www/` y ejecuta esbuild. `www/` va al `.gitignore`: **se genera en CI**.
- Nuevo `scripts/test-core.js` (Node puro): comprueba que ningún fichero de
  `src/core/` hace `require('fs'|'os'|'path'|'child_process'|'electron')`.
  Es el candado que evita que el núcleo vuelva a depender de Node.
- **Lo que ya es puro y está probado** (la revisión del 2026-11-15 lo dejó
  así, y es justo el material del núcleo): `parseUsage` (Claude),
  `parseSummary` y `manualKind` (Antigravity), `extractPairs` (cliente OAuth),
  `isOauthToken` (Claude), `parseYamlMappings`/`firstValid` (credenciales) y
  las funciones de `http.js` (`pct100`, `used`, `tone`, `fmtDuration`,
  `fmtPercent1`). `src/core/` es, literalmente, **estos ficheros tal cual,
  con la resolución de credenciales inyectada**. Eso reduce el refactor a
  mover código que ya no tiene dependencias de Node.
- El item 17 de la cola de la revisión ("`formatTokens` copiado en `claude.js`
  y `deepseek.js`, bloque de métrica de porcentaje repetido 4 veces") se
  resuelve **solo** al unificar el núcleo: `formatTokens` y el formateo de
  métricas pasan a estar en `src/core/metrics.js` una sola vez. No hay que
  arreglarlo dos veces.

---

## 3. Proyecto Android (Capacitor)

```bash
npm i -D @capacitor/cli@8 esbuild
npm i @capacitor/core@8 @capacitor/android@8 @capacitor/preferences@8
npx cap init Usagia com.usagia.tray --web-dir www
npx cap add android
```

`capacitor.config.json`:

```json
{
  "appId": "com.usagia.tray",
  "appName": "Usagia",
  "webDir": "www",
  "plugins": { "CapacitorHttp": { "enabled": true } },
  "android": { "allowMixedContent": false }
}
```

Decisiones:

- **`android/` se commitea entero** (incluido el *gradle wrapper*). Es la
  recomendación de Capacitor y lo que hace la build reproducible: `npx cap add`
  genera cosas distintas según la versión de la CLI, y una release no puede
  depender de eso.
- `appId` = `com.usagia.tray`, el mismo `appId` de `package.json#build`.
- **No se publica en Google Play** (sideload). Eso evita AAB, Play App Signing
  y políticas de la tienda. Si algún día se quiere, es un job aparte.
- Iconos: `assets/icons/512x512.png` → `npx @capacitor/assets generate --android`
  una vez, y el resultado se commitea con `android/`.
- `android/app/build.gradle` lee la versión **por propiedades**, no editando
  ficheros en CI:

```groovy
defaultConfig {
    applicationId "com.usagia.tray"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionName project.findProperty('usagiaVersionName') ?: '0.0.0'
    versionCode (project.findProperty('usagiaVersionCode') ?: '1').toInteger()
}
signingConfigs {
    release {
        def ks = System.getenv('ANDROID_KEYSTORE_PATH')
        if (ks) {
            storeFile file(ks)
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
}
buildTypes {
    release {
        minifyEnabled false
        signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : null
    }
}
```

Sin `ANDROID_KEYSTORE_PATH` sale `app-release-unsigned.apk` (lo que usa el job
de verificación). Con él, sale firmado.

### `versionCode`: determinista a partir del tag

Android exige un entero creciente; semantic-release da `1.2.3` o
`1.2.3-beta.4`. Misma filosofía que `--config.extraMetadata.version=`: **se
deriva del tag, nunca de `run_number`** (si se relanza el job, el APK tiene que
ser el mismo).

`scripts/android-version.js <semver>` → `versionCode`:

```
versionCode = major*1_000_000 + minor*10_000 + patch*100 + sufijo
sufijo = N  si es 1.2.3-beta.N  (1..98)
sufijo = 99 si es estable 1.2.3
```

Así `1.2.3-beta.1 < 1.2.3-beta.2 < … < 1.2.3 < 1.2.4-beta.1`, que es
exactamente el orden en que se publican, y la estable **actualiza encima de la
beta** sin desinstalar. El script lleva sus propias pruebas
(`scripts/test-android.js`, sección 6) con esos casos y con los límites
(`beta.99` falla a propósito: nunca ha habido 99 betas de una versión).

---

## 4. Firma: una clave, para siempre, para beta y estable

Sin firma estable no hay "release estable": Android **no actualiza** una app si
la firma cambia (hay que desinstalar, y se pierde la configuración). Por eso:

- **Una sola clave** para `beta` y `main`. Es la única forma de que
  `v1.1.0-beta.3 → v1.1.0` sea una actualización normal.
- **Nunca** una clave de *debug* generada en el runner: cambia en cada build.
- Se genera **una vez, en local**, y **se guarda fuera del repo** (gestor de
  contraseñas + copia). Perderla = todos los usuarios tienen que desinstalar.

```bash
keytool -genkeypair -v -keystore usagia-release.jks -alias usagia \
  -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Usagia, O=carcheky"
base64 -w0 usagia-release.jks > usagia-release.jks.b64
```

Secrets del repositorio (Settings → Secrets → Actions):

| Secret | Contenido |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | el `.jks` en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | contraseña del almacén |
| `ANDROID_KEY_ALIAS` | `usagia` |
| `ANDROID_KEY_PASSWORD` | contraseña de la clave (puede ser la misma) |

`.gitignore` añade `*.jks`, `*.keystore`, `www/`, `android/app/build/`,
`android/.gradle/`, `android/local.properties`.

Política ante secrets ausentes: el job `build-android` **falla pronto y con
mensaje claro** en un paso de pre-vuelo, antes de gastar 8 minutos en Gradle.
No se adjunta un APK sin firmar "para que salga algo": un APK sin firmar ni se
instala, y un APK con firma de usar-y-tirar es peor que ninguno porque
bloquea las actualizaciones. (Igual que `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`
en Windows: se decide explícitamente qué pasa con la firma.)

---

## 5. Cambios en `.github/workflows/release.yml`

Cadena resultante:

```
commits ─┬─ verify (Windows: humo, cuentas, paquete) ──┐
         └─ verify-android (Ubuntu: APK sin firmar) ───┴─ release ─┬─ build-windows
                                                                   ├─ build-linux
                                                                   └─ build-android
```

### 5.1 `verify-android` — ANTES de publicar

Motivo: `release` (semantic-release) es irreversible: crea el tag y la release.
Si la build de Android solo se comprobara *después*, una release podría
quedarse sin APK y habría que borrarla a mano (`publish-releases.js drop`).
Igual que `verify` protege la app de escritorio, `verify-android` protege el
APK. Cuesta ~4-6 min con caché de Gradle; es el precio de "estable".

```yaml
  verify-android:
    name: Verificar la app Android
    needs: commits
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: npm }
      - uses: actions/setup-java@v5
        with: { distribution: temurin, java-version: '21', cache: gradle }
      # No se confía en lo preinstalado: en enero de 2026 GitHub retiró de
      # las imágenes las plataformas < 34 y puede retirar más. sdkmanager es
      # idempotente: si ya está, no hace nada.
      - name: Asegurar SDK de Android
        run: |
          yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null || true
          "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-36" "build-tools;36.0.0" "platform-tools"
      - run: npm ci
      - name: Núcleo compartido y proyecto Android
        run: |
          node scripts/test-core.js
          node scripts/test-android.js
      - name: Compilar la web y sincronizar Capacitor
        run: |
          npm run build:web
          npx cap sync android
      - name: Compilar APK (sin firmar)
        working-directory: android
        run: ./gradlew assembleRelease --no-daemon -PusagiaVersionName=0.0.0-ci -PusagiaVersionCode=1
      - name: El APK existe y contiene la tarjeta
        run: node scripts/test-android.js --apk android/app/build/outputs/apk/release/app-release-unsigned.apk
```

`release` pasa a `needs: [verify, verify-android]`.

### 5.2 `build-android` — DESPUÉS de publicar, como Windows y Linux

```yaml
  build-android:
    name: Empaquetar para Android
    needs: release
    if: needs.release.outputs.tag != ''
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write
    env:
      ANDROID_KEYSTORE_PATH: ${{ runner.temp }}/usagia-release.jks
      ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
      ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
      ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
    steps:
      # Pre-vuelo: sin clave no se compila nada (ver sección 4).
      - name: Comprobar los secrets de firma
        run: |
          for v in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
            if [ -z "${!v}" ]; then echo "::error::Falta el secret $v (ver PLAN-ANDROID.md §4)"; exit 1; fi
          done
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}

      # Mismo principio que build-windows: se compila EXACTAMENTE el tag.
      - uses: actions/checkout@v7
        with:
          ref: ${{ needs.release.outputs.tag }}
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: npm }
      - uses: actions/setup-java@v5
        with: { distribution: temurin, java-version: '21', cache: gradle }
      - name: Asegurar SDK de Android
        run: |
          yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null || true
          "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-36" "build-tools;36.0.0" "platform-tools"
      - run: npm ci

      - name: Restaurar el keystore
        run: printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$ANDROID_KEYSTORE_PATH"
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}

      - name: Calcular versionCode a partir del tag
        id: ver
        run: echo "code=$(node scripts/android-version.js '${{ needs.release.outputs.version }}')" >> "$GITHUB_OUTPUT"

      - name: Compilar la web y sincronizar Capacitor
        run: |
          npm run build:web
          npx cap sync android

      - name: Compilar y firmar el APK
        working-directory: android
        run: >-
          ./gradlew assembleRelease --no-daemon
          -PusagiaVersionName=${{ needs.release.outputs.version }}
          -PusagiaVersionCode=${{ steps.ver.outputs.code }}

      # apksigner verify es la prueba de que la firma es la nuestra (y no
      # una de debug): imprime el certificado y falla si no está firmado.
      - name: Verificar la firma y nombrar el artefacto
        run: |
          APK=android/app/build/outputs/apk/release/app-release.apk
          "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$APK"
          mkdir -p dist
          cp "$APK" "dist/Usagia-${{ needs.release.outputs.version }}-android.apk"
          (cd dist && sha256sum *.apk > "Usagia-${{ needs.release.outputs.version }}-android.apk.sha256")

      - name: Adjuntar los artefactos a la release
        uses: softprops/action-gh-release@v3
        with:
          tag_name: ${{ needs.release.outputs.tag }}
          files: |
            dist/*.apk
            dist/*.apk.sha256
```

Notas de estabilidad del YAML:

- `actions/setup-java` con `cache: gradle` basta; no se añade
  `gradle/actions/setup-gradle` (una pieza móvil menos). Revisar la mayor
  vigente de `setup-java` al implementarlo (hay v5 y v6 publicadas).
- `--no-daemon`: en un runner efímero el daemon solo deja procesos colgando.
- Un solo APK **universal**: la app no tiene código nativo propio, así que no
  hay *split* por ABI (sería inventar artefactos).
- `concurrency`, `permissions` mínimos y `cancel-in-progress: false` se
  mantienen tal cual.
- Secrets y `env` se declaran a nivel de job para que el pre-vuelo y Gradle
  vean los mismos nombres.

### 5.3 Cambios en el resto del repo

| Fichero | Cambio |
|---|---|
| `scripts/publish-releases.js` | `verify()` añade `'android (.apk)': /\.apk$/i` a `required`. Sin esto, `verify-latest` daría OK a una release sin APK. |
| `package.json` | scripts `build:web`, `test:core`, `test:android`, `dist:android` (= `build:web && cap sync android && gradlew assembleRelease`). Dependencias de Capacitor y esbuild. |
| `README.md` | Diagrama del pipeline con los dos jobs nuevos; sección "Android" (qué proveedores funcionan, cómo instalar el APK, que no está en Play). |
| `AGENTS.md` | Regla: todo proveedor nuevo va en `src/core/providers/`, nunca en `src/main/providers/` salvo el envoltorio; `android/` se commitea; nunca se toca la clave de firma. |
| `STATUS.md` | Al empezar la implementación (F1) y al cerrar (F6): qué está hecho del plan y qué falta. **Fusionar, no sobrescribir**: hay más sesiones sobre este repo. |
| `.gitignore` | `www/`, `android/app/build/`, `android/.gradle/`, `android/local.properties`, `*.jks`, `*.keystore`. |
| `scripts/build-android-wsl.sh` | Gemelo de `build-linux-wsl.sh`: copia a `/tmp`, `npm ci`, `build:web`, `cap sync`, `gradlew assembleRelease`. Para validar en local antes de gastar CI. |

---

## 6. Pruebas que sostienen el pipeline (sin GUI, Node puro)

`scripts/test-android.js` (corre en `verify-android` y en local):

1. `capacitor.config.json`: `appId == package.json#build.appId`, `webDir == 'www'`,
   `plugins.CapacitorHttp.enabled === true`.
2. `android/app/build.gradle` contiene `usagiaVersionName` y `usagiaVersionCode`
   (si alguien regenera el proyecto con `cap add`, esto lo detecta).
3. `android/app/build.gradle` **no** contiene contraseñas ni rutas de keystore
   en claro (solo `System.getenv`).
4. `scripts/android-version.js`: tabla de casos
   `1.0.0→1000099`, `1.0.0-beta.1→1000001`, `1.2.3-beta.12→1020312`,
   `10.0.0→10000099`; `beta.99` y `1.0.0-rc.1` **fallan** (solo se admite el
   prerelease `beta`, que es el único que `.releaserc.json` configura).
5. Con `--apk <ruta>`: el fichero existe, pesa > 1 MB y < 30 MB, y contiene
   `assets/public/card.html` y `assets/public/bridge.js` (lectura del zip con
   `unzip -l` o el módulo `zlib`; no hace falta instalar nada).

`scripts/test-core.js`: ningún `require` de módulos de Node/Electron en `src/core/`.

Los dos se añaden a `npm test`? **No**: `npm test` sigue siendo lo que es hoy
(`test-accounts.js` + `test-parsers.js`, lo documentan el README y AGENTS).
Se añaden como `npm run test:core` y `npm run test:android` y los ejecuta el
job.

---

## 7. Orden de ejecución (commits, ramas y qué publica cada paso)

Todo en `beta`; `main` solo por `--ff-only`. Tipos de commit elegidos para que
**no salga ninguna release a medias**: los pasos preparatorios no publican.

| Paso | Commit | ¿Publica? | Verificación |
|---|---|---|---|
| F0 | — (fuera del repo) | — | Generar keystore, guardarlo en el gestor de contraseñas, crear los 4 secrets. `gh secret list` los enseña. |
| F1 | `refactor: núcleo de proveedores sin dependencias de Electron` | No | `npm test`, `npm run test:package`, `npm run probe`, `npm run preview` y `preview:settings` **iguales que antes** (misma captura). `test:core` en verde. || F2 | `ci: verificación de la app Android antes de publicar` + `feat(android): app Capacitor con la tarjeta y la configuración` **en el mismo push** | Sí (minor beta) | El `feat` es lo que dispara la release; el `ci` va en el mismo push porque `ci:` solo no publica y el job `build-android` no se ejercitaría. `publish-releases.js wait beta` → `verify-latest prerelease` lista el `.apk`. |
| F3 | Instalar el APK de la beta en un móvil real (`adb install` o descarga), pegar una clave de Minimax, ver la tarjeta. | — | Es la única prueba de que el APK **funciona**, no solo de que existe. Sin esto no se pasa a `main`. |
| F4 | `fix:` de lo que salga en F3 | Sí (patch beta) | Repetir F3 con la nueva beta: comprueba además que **actualiza encima** sin desinstalar (misma firma, `versionCode` mayor). |
| F5 | `docs: Android en README y AGENTS` | No | — |
| F6 | `git switch main && git merge --ff-only beta && git push origin main` | Sí (estable) | `verify-latest stable` lista los 4 artefactos. Instalar la estable **encima de la beta**: debe actualizar. |

**Antes de F1**: el refactor mueve `src/main/providers/*.js`,
`src/main/http.js` y toca `package.json`. Esos ficheros están **reservados**
por la sesión `session-8a303ef4` (items 11-18 de la cola de la revisión del
código, ver [STATUS.md](STATUS.md)). **F1 no empieza hasta que sus commits
estén dentro**: si no, dos sesiones editan los mismos ficheros y el
resultado es un merge horroroso. Además, el item 17 de esa cola
(`formatTokens` duplicado en `claude.js` y `deepseek.js`, bloque de métrica
de porcentaje repetido 4 veces) es **justo lo que este plan elimina** al
unificar el núcleo: si se arregla antes, el plan lo hereda; si no, lo
deshace. Lo natural es **F1 después**.

Si F2 falla en `verify-android`, **no se crea ningún tag**: se corrige y se
vuelve a empujar. Eso es lo que compra el job de verificación previo.

**Numeración concreta (2026-11-16)**: lo publicado es `v1.0.0-beta.4`, así que
F2 saldría como `v1.0.0-beta.5` y F6 como `v1.0.0` (la primera estable). Con la
fórmula de §3: `v1.0.0-beta.5 → versionCode 1000005` y `v1.0.0 → 1000099`, de
modo que la estable **sube** sobre la beta y Android la actualiza sin
desinstalar. Si F2/F4 acumulan varias betas (`.5`, `.6`, …), cada una tiene un
`versionCode` mayor y la fórmula sigue valiendo.

**Antes de F6**, ojo con la regla de ramas: `main` solo recibe `beta` por
`--ff-only` (ver AGENTS.md). Y `main` va 14 commits por detrás: el primer
estable arrastra **toda** la revisión a fondo, no solo el trabajo de Android.

---

## 8. Riesgos y cómo quedan cubiertos

| Riesgo | Mitigación en este plan |
|---|---|
| CORS en el WebView | `CapacitorHttp.enabled` parchea `fetch` → peticiones nativas. Probado en F3 con un proveedor real. |
| El APK se queda atrás respecto al escritorio | Un solo `src/core/` compartido + `test-core.js` que impide reintroducir Node ahí. |
| `versionCode` repetido o decreciente | Derivado del tag con fórmula monótona; pruebas en `test-android.js`. |
| Pérdida de la clave de firma | Copia fuera del repo (gestor de contraseñas); documentado en §4 y en AGENTS.md. |
| Release sin APK | `verify-android` corre **antes** de semantic-release; `publish-releases.js verify` exige el `.apk`. |
| GitHub retira SDKs de la imagen del runner | `sdkmanager` instala explícitamente `android-36` y `build-tools;36.0.0` (idempotente). |
| Descarga de Gradle/AGP lenta o fallida | `cache: gradle` en `setup-java`; `timeout-minutes` generoso; el job es independiente de Windows/Linux (uno no tumba a los otros). |
| `npx cap add` regenera `android/` distinto | `android/` commiteado; `test-android.js` comprueba que `build.gradle` conserva las propiedades de versión y la firma por entorno. |
| Claude 429 | Mismo caché de 10 min que en escritorio (está en el núcleo). |
| **Claude en Android solo con token OAuth, y caduca** | La app ya **descarta** las claves API (`sk-ant-api…`) y avisa en la nota. En Android no hay sesión local ni transcripciones que sirvan de respaldo: sin un `sk-ant-oat…` pegado, la fila sale "sin sesión". Documentarlo en el README de Android y **no** prometer la cuota de Claude como algo que funciona solo. |
| Antigravity sin refresco | Documentado como limitación; token raw sigue funcionando ~1 h. No bloquea. |
| Android 16 y pantallas grandes | No se fija orientación; la tarjeta es responsive (380 px de ancho fijo hoy → pasar a `max-width` en `card.css`, cambio de una línea en F2). |
| Tamaño del runner | App web sin código nativo: APK de ~5-8 MB; no hace falta liberar disco. |

---

## 9. Fuera del alcance (fase posterior, no bloquea el pipeline)

- **Widget de pantalla de inicio** o **notificación persistente** con el
  resumen (equivalente al tooltip de la bandeja). Requiere código Kotlin y un
  `WorkManager` para refrescar en segundo plano. Es *feature*, no pipeline.
- Publicación en **Google Play** (AAB + Play App Signing): job aparte si llega.
- **F-Droid**: requiere build reproducible desde fuente sin binarios en el
  repo; incompatible con el `android/` commiteado tal cual. Se evalúa después.
- iOS: Capacitor lo permite, pero necesita macOS runner + firma de Apple. No.

---

## 10. Criterios de "hecho"

- [ ] `verify-android` en verde en cada push a `beta` y `main`.
- [ ] Cada release (beta y estable) adjunta `Usagia-<v>-android.apk` y su `.sha256`.
- [ ] `node scripts/publish-releases.js verify-latest prerelease|stable` exige y encuentra el `.apk`.
- [ ] El APK instala en un dispositivo real y muestra la cuota de al menos Minimax con una clave pegada.
- [ ] La estable actualiza **encima** de la beta sin desinstalar (misma firma, `versionCode` mayor).
- [ ] `npm test`, `npm run test:package`, `npm run probe`, `preview` y `preview:settings` siguen funcionando igual en escritorio.
- [ ] `README.md` y `AGENTS.md` describen el pipeline nuevo, la clave de firma y la regla de `src/core/`.
- [ ] Ningún fichero del repo contiene el keystore ni contraseñas.
