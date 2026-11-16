# Tasks — Conectar cuentas sin adivinar (`2026-11-16-onboarding-cuentas`)

Regla del repo: **sin prueba no hay commit**. Cada tarea empieza escribiendo la prueba que la
describe (en rojo), luego el código (en verde), luego `node scripts/test.js` y su commit.

**Orden:** T-1 → T-2 → T-3 → (T-4, T-5 en paralelo si hay sitio) → T-6 → T-7 → T-8 → T-9.
T-2, T-4 y T-5 tocan ficheros reservados por otras sesiones: no se empiezan hasta que `git status
--porcelain` esté limpio y `STATUS.md` los libere.

---

## T-1 — Recetas de conexión en los proveedores

**Qué:**
1. En cada `src/main/providers/*.js`, añadir al export:
   ```js
   setup: {
     action: 'auto' | 'paste-key' | 'paste-token',
     what: 'Una línea: qué es este proveedor.',
     requires: null | { app: 'Nombre app', url: 'https://…' },
     steps: ['Paso 1', 'Paso 2'],
   }
   ```
   - **Minimax**: `paste-key`, `requires: null`; «Monitoriza tu cuota del plan M de Minimax» / «Copia
     tu clave (empieza por `sk-cp-`)» / «Pégala aquí y pulsa Probar».
   - **Claude**: `auto`, `requires: { app: 'Claude Code o Claude Desktop', url: 'https://claude.ai' }`;
     «Monitoriza tu cuota de Claude Pro» / «Detecta la sesión de Claude Code o Desktop» /
     «O pega un token OAuth (`sk-ant-oat…`)».
   - **Antigravity**: `auto`, `requires: { app: 'Google Antigravity IDE', url: 'https://antigravity.google' }`;
     «Monitoriza tu cuota del IDE de Antigravity» / «Detecta la sesión del IDE» /
     «Inicia sesión en el IDE una vez (después puedes cerrarlo)».
   - **DeepSeek**: `paste-token`, `requires: null`; «Monitoriza el saldo de tu cuenta de DeepSeek» /
     «Usa la sesión del harness o pega una clave `sk-`».
2. En `src/main/instances.js` `catalog()`, exponer `setup` junto a `credential`.
3. Retirar `url` de los cuatro módulos (deja de usarse en T-6).

**Prueba (en `scripts/test-providers.js` y `test-accounts.js`, en rojo primero):**
- Cada proveedor exporta `setup.action` ∈ `auto|paste-key|paste-token`, `what`, `requires` (objeto
  con `app`+`url` o `null`) y 1-2 `steps`.
- Ningún `step` contiene `http://` ni `https://` (las URLs van en `requires.url`, no en pasos).
- `instances.catalog()` devuelve `setup` para los cuatro.
- Si `action === 'auto'`, `requires` no es `null` (porque necesita otra herramienta).

**Aceptación:** `node scripts/test.js providers accounts` en verde. Commit `feat:`.

---

## T-2 — Pantalla de bienvenida y estado del onboarding

**Qué:**
1. `src/main/config.js`: sección `onboarding: { dismissed, completed, welcomeShown }` con
   `normalize()` tolerante (valores ausentes → `null`, fechas ISO válidas).
2. `src/main/settings.js`: nueva ventana **Bienvenida** (checkboxes de los 4 proveedores). Al
   aceptar, solo los marcados quedan con `enabled: true` en `accounts[]`.
3. `src/renderer/settings.*`: la ventana de bienvenida, sin ser modal bloqueante (se puede cerrar).
4. `src/main/main.js`: al arrancar, si `!onboarding.welcomeShown` y no hay cuentas activas, abre
   la ventana de bienvenida.
5. No se guarda nada más (sin telemetría, sin nombres de cuenta).

**Prueba (en `scripts/test-local.js` y `test-renderer.js`, en rojo primero):**
- Un `config.json` sin `onboarding` se normaliza con los tres campos a `null`.
- Marcar 2 de 4 → solo esas 2 quedan `enabled: true`.
- Cerrar sin marcar nada → todas quedan `enabled: false`.
- El render de la ventana de bienvenida pinta los 4 checkboxes con sus descripciones (`setup.what`).

**Aceptación:** `node scripts/test.js local renderer` en verde. Commit `feat:`.

---

## T-3 — Redacción de estados y contador dinámico en la tarjeta

**Qué:**
1. `src/main/summary.js`: `unconfigured` pasa a **«Falta conectar»** (resumen corto y de menú).
2. `src/renderer/card.js`: la fila `unconfigured` pinta el botón **Conectar** (ver T-5) y deja de
   ser solo texto. El contador («n de N») cuenta solo cuentas **activas** (`enabled: true`).
3. `src/main/tooltip.js`: misma redacción.
4. Los estados `error` conservan su motivo y **no** se convierten en «Falta conectar».
5. Nuevo estado `needs_app`: cuando `setup.action === 'auto'` y `resolve()` devuelve `null`, el
   resumen es «Necesita [app]» (no «Falta conectar»).

**Prueba (en rojo primero):**
- `test-local`: `primarySummary/shortSummary({status:'unconfigured'})` → «Falta conectar»;
  `{status:'needs_app', requires:{app:'X'}}` → «Necesita X».
- `test-parsers`: `tooltipLine` igual.
- `test-renderer`: con 2 de 3 activas conectadas, el contador dice «2 de 3» (no «2 de 4» si hay una
  desactivada); con una fila `unconfigured` hay botón `Conectar`; con `needs_app` hay «[Descargar]
  o [Quitar]».

**Aceptación:** `node scripts/test.js local parsers renderer` en verde. Commit `fix:`.

---

## T-4 — Sección «Conexiones» en Configuración

**Qué:**
1. `src/main/settings.js`: IPC para (a) `snapshot` de cuentas con su estado calculado con
   `resolve()` —**local, sin red**— y `setup.requires`, (b) `probar` una cuenta (ejecuta
   `fetchUsage` con su credencial, sin modelo) y (c) `quitar` una cuenta.
2. `src/preload/settings-preload.js`: exponer `probar` y `quitar`.
3. `src/renderer/settings.*`: sección **Conexiones** con una tarjeta por cuenta:
   - qué es (`setup.what`), estado, pasos (`setup.steps`), campo de credencial con su `hint`,
     botón **Probar** con resultado inline, botón **Quitar**.
   - Si `status === 'needs_app'` (no hay credencial y `requires` no es `null`): **[Descargar
     {requires.app}]** (abre `requires.url` con `shell.openExternal`) o **[Quitar cuenta]**.
   - sin otros enlaces ni `window.open`.
4. Foco: `open({ focus: cuenta })` resalta esa tarjeta (lo usa T-5).

**Prueba (en rojo primero):**
- `test-local`/`test-renderer`: el snapshot lleva `setup`, `status` y `source`; el render pinta los
  pasos y no contiene `href` fuera del botón Descargar (que solo aparece con `needs_app`).
- `test-accounts`/`test-local`: probar una cuenta con `fetch` simulado devuelve `ok` o `error` con
  motivo, y no encola ninguna petición a un modelo (solo la URL de metadatos).

**Aceptación:** `npm run preview:settings` abre la sección y se ve con datos reales; suites en
verde. Commit `feat:`.

---

## T-5 — «Conectar» desde la tarjeta y progreso

**Qué:**
1. `src/renderer/card.js` + `card.css`: por cada fila `unconfigured` o `needs_app`, botón
   **Conectar** que abre Configuración con esa cuenta enfocada.
2. Encabezado de la tarjeta: «Conectar cuentas · n de N» (N = cuentas **activas**) mientras quede
   alguna; botón de descartar (×) que guarda `onboarding.dismissed` vía IPC.
3. Nada de ventanas automáticas al arrancar.
4. Al conectar todas: `onboarding.completed` y el aviso no se pinta.

**Prueba (en rojo primero):**
- `test-renderer`: con 2 de 4 conectadas pero solo 3 activas, aparece «2 de 3»; al descartar, la
  cabecera desaparece; con todas las activas conectadas no se pinta.
- `test-local`: descartar persiste `dismissed` y la siguiente carga lo respeta.

**Aceptación:** `npm run preview` muestra la cabecera con cuentas desconectadas. Commit `feat:`.

---

## T-6 — El clic de una fila ya no abre una web

**Qué:**
1. `src/main/main.js`: el clic de la fila (menu de la bandeja y tarjeta) abre **Configuración
   enfocada** en esa cuenta; se elimina `shell.openExternal(provider.url)` del flujo de cuentas.
2. Se mantiene `shell.openExternal` donde sí es acción explícita: releases/actualizaciones y el
   botón **Descargar** de T-4.

**Prueba (en rojo primero):**
- `test-local`: el builder del menú genera `click` que no llama a `shell.openExternal` (mock).
- `test-providers`: ningún `setup` ni `url` de proveedor apunta a una web (las URLs van en
  `requires.url`, y solo se abren al pulsar Descargar).

**Aceptación:** con la app abierta, clic derecho → fila de Antigravity → se abre Configuración, no
el navegador. Commit `fix:`.

---

## T-7 — Documentación de primeros pasos

**Qué:**
1. `docs/primeros-pasos.md` (cabecera `Para quién`/`Responde a`/`Verificado`, ≤300 líneas) con la
   receta por proveedor y el flujo de bienvenida, sin depender de `FINDINGS.md`.
2. Enlazarla desde `docs/README.md` y desde `README.md` (sección «Cómo se autentican»).
3. `openspec/specs/onboarding/spec.md` (T-9) queda referenciada como spec.

**Prueba:** `scripts/test-docs.js` (enlaces vivos, índice, cabecera y tope) en verde.

**Aceptación:** `node scripts/test.js docs` en verde. Commit `docs:`.

---

## T-8 — Verificación de extremo a extremo

**Qué:**
1. `node scripts/test.js` → todas las suites en verde.
2. `npm run preview` y `npm run preview:settings` con datos reales: la sección Conexiones pinta los
   estados de esta máquina (Cuatro «Conectada/Detectada»).
3. **Simular usuario nuevo**: arrancar con un `APPDATA` vacío (HOME falso) y comprobar que:
   - Se abre la ventana de bienvenida.
   - Marcar solo Minimax → ve 1 fila, no 4.
   - No marcar nada → ve 0 filas, puede añadir desde Configuración.
4. Medir «Probar» por proveedor: ≤5 s y sin 429 provocado por reintentos (Claude respeta su caché).

**Aceptación:** las cuatro comprobaciones pasan; se anota en `STATUS.md`.

---

## T-9 — Cierre del cambio

**Qué:**
1. Fusionar el delta en `openspec/specs/onboarding/spec.md`.
2. Mover `openspec/changes/2026-11-16-onboarding-cuentas/` a
   `openspec/changes/archive/2026-11-16-onboarding-cuentas/` (histórico inmutable).
3. Actualizar `STATUS.md` (estado) y, si procede, `AGENTS.md` (la regla de que el onboarding se
   declara en el proveedor).

**Aceptación:** `openspec/specs/onboarding/spec.md` existe, el cambio está en `archive/` y
`npm test` sigue en verde. Commit `docs:`.
