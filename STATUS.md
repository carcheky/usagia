# Estado de Usagia

> **Última actualización:** 2026-11-16 00:35 (Europe/Madrid).
> Este fichero es la foto del proyecto *ahora mismo*: qué hay publicado, qué
> está a medias y qué toca después. Lo actualiza la sesión que trabaja en el
> repo (ver [Cómo mantener este fichero](#cómo-mantener-este-fichero)).
> Para la semántica de los endpoints manda [FINDINGS.md](FINDINGS.md); para las
> reglas de ramas, releases y reparto entre sesiones, [AGENTS.md](AGENTS.md).

## Resumen en una línea

App de bandeja (Electron) que muestra la cuota de Minimax, Claude, Antigravity
y DeepSeek. **Publicada en pre-release (`v1.0.0-beta.3`)**, sin versión
estable todavía. En `beta` hay **9 commits sin pushear** (una revisión a fondo
del código) y el árbol de trabajo está limpio.

## Versiones

| Qué | Valor | Nota |
|---|---|---|
| Última release publicada | **v1.0.0-beta.3** (2026-11-15 21:20 UTC) | Pre-release; Windows (NSIS + portable) y Linux (AppImage + deb) adjuntos |
| Última release estable | **ninguna** | `main` nunca ha publicado; falta el primer `merge --ff-only beta` |
| Rama de trabajo `beta` | `3205e12` (local) | `origin/beta` está en `442f1ef`: **9 commits sin empujar** |
| Rama `main` | `deebebb` | 10 commits por detrás de `beta` |
| `package.json` | `0.0.0` | Correcto: la versión la pone semantic-release |

Releases: <https://github.com/carcheky/usagia/releases>

## Lo último: revisión a fondo del código (9 commits en `beta`, sin push)

Una segunda sesión de DSH revisó el repo entero el 2026-11-15 23:31 → 00:15 y
dejó 9 commits validados con commitlint:

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

**Estado de las pruebas** (ejecutadas el 2026-11-16 00:30 en este checkout):
`npm test` → **OK** (cuentas + parsers) · `npm run test:package` → **OK**.

**Lo que esa sesión NO pudo comprobar** (ya comprobado después, más abajo):
`npm run preview` y `preview:settings` (Electron no arranca dentro del sandbox
de DSH: `GPU process launch failed: error_code=18`).

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
  + `build-linux`, con commitlint y semantic-release. Tres pre-releases
  publicadas sin intervención manual.

## Pendiente / siguiente

1. **Publicar la revisión**: `git push origin beta` → `v1.0.0-beta.4`
   (9 fixes + tests + el arreglo de la vista previa). Los commits están hechos
   y validados; falta el `push`, que es la decisión del usuario.
2. **Primera versión estable**: cuando `beta.4` esté bien en la app instalada,
   `git switch main && git merge --ff-only beta && git push origin main` →
   `v1.0.0`.
3. **Dependabot**: rama `origin/dependabot/npm_and_yarn/electron-42.11.16`
   abierta (actualización de Electron). Sin revisar.
4. **Android**: hay un plan completo en [PLAN-ANDROID.md](PLAN-ANDROID.md)
   (Capacitor 8 + núcleo JS compartido + jobs `verify-android`/`build-android`).
   **No se ha empezado**: hoy no hay nada que compilar para Android.
5. **macOS**: el código contempla la plataforma, pero el pipeline **no genera
   binarios de macOS** (solo Windows y Linux).

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

- **DSH no permite mensajes entre sesiones raíz distintas**: `send_message`
  solo funciona dentro del mismo árbol de subagentes. El canal entre sesiones
  es **el repo**.
- `STATUS.md` (este fichero): estado del proyecto. Lo escribe la sesión que
  trabaja en el repo.
- `FINDINGS.md`: endpoints, semántica y valores medidos. Fuente única.
- `README.md` / `AGENTS.md`: cómo se usa y cómo se trabaja en el repo.
- **Regla adoptada** (ya escrita en `AGENTS.md`): al empezar, leer
  `STATUS.md`; un fichero, un dueño; no commitear trabajo ajeno; y al
  terminar, actualizar `STATUS.md`.

## Historial de releases

| Versión | Fecha | Contenido |
|---|---|---|
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
