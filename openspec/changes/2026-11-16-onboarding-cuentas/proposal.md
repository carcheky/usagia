# Primeros pasos: conectar las cuentas sin adivinar

**Cambio:** `2026-11-16-onboarding-cuentas` · **Naturaleza:** propuesta (sin ediciones en `src/`).
**Capacidad:** `onboarding` (nueva). **Delta:** [`specs/onboarding/spec.md`](specs/onboarding/spec.md).
**Origen:** reporte real del 2026-11-16 17:03-17:06 por un usuario que acababa de instalar la
release publicada.

---

## 1. El problema, con las palabras del usuario

> «me lo he instalado»
> «tiene que detectar antigravity abierto? o como meto mi cuenta?»

Y el diagnóstico de quien se lo pasó:

> «parece muy poco intuitivo»

Lo que ve alguien nuevo al instalar `Usagia`:

1. Bandeja con un icono (en Windows 11, dentro de «iconos ocultos»).
2. Al pasar el ratón, cuatro filas: **Minimax, Claude, Antigravity, DeepSeek**, casi todas diciendo
   *«sin credencial»* o *«sin clave»*.
3. Ninguna frase dice **qué hacer**. La app **no tiene login propio**: lee sesiones que ya existen
   (Claude Code/Desktop, IDE de Antigravity, harness DSH) o claves que se pegan en **⚙**. Pero eso
   solo lo sabe quien leyó `README.md` o `FINDINGS.md`.
4. El ⚙ es pequeño y está en la tarjeta (que aparece al pasar el ratón): es el único camino, y no
   se anuncia en ningún sitio.

El resultado es el peor posible: la app funciona, pero **parece rota**. El usuario no sabe si:
- hay que tener la otra app abierta (no),
- hay que hacer login *dentro* de Usagia (no existe),
- o hay que pegar algo que no tiene a mano (solo en el caso de Minimax/DeepSeek).

Parte de esto ya se mitigó en `d168226` (la fila sin credencial dice algo). Esta propuesta
sustituye ese parche por un **flujo de conexión pensado**, porque una nota en una fila no arregla
que no haya forma de llegar a la acción.

## 2. Qué se quiere (y qué no)

**Se quiere:** que un usuario nuevo conecte las cuentas **sin leer documentación externa**, dentro
de la app, en el momento en que hace falta, y que entienda **por qué** una fila no tiene datos.

**No se quiere:**

- **Enlaces externos.** Nada de abrir el navegador para explicar nada (ni `shell.openExternal`, ni
  enlaces a `README.md`, `FINDINGS.md` ni a las webs de los proveedores). La explicación vive en la
  app. Además, el clic de la fila de Antigravity abría `antigravity.google` (la portada), que no
  resuelve nada y confunde.
- **Un tour de producto al estilo carrusel.** No hay funcionalidad que descubrir: hay una tarea que
  completar. Los tours lineales se saltan ([<30 % pasa del 5.º paso](https://github.com/domidex01/tour-kit/blob/4db0fe72ce36181c9ce67809832db8f07c09b98f/apps/docs/content/blog/complex-dashboard-onboarding.mdx)),
  y aquí el problema es de **activación**, no de conocimiento de la interfaz.
- **Un modal que bloquee al arrancar.** La tarjeta es efímera (hover) y el icono vive en la bandeja:
  interceptar el arranque con un diálogo es intrusivo y no arregla nada.

## 3. La técnica elegida: checklist de activación + estados vacíos accionables

Es el patrón que recomienda la práctica actual para *activación* (no para descubrimiento de
features): el usuario controla el ritmo, cada tarea es una acción real y el estado vacío **enseña
el camino** en vez de describir la ausencia:

- [Checklist vs. Tour vs. Tooltip: choose by job](https://www.userflow.com/blog/checklist-tour-tooltip-banner-onboarding):
  el checklist es para trabajo multi-paso que el usuario controla; el tour, para presentar la
  interfaz.
- [Empty state onboarding](https://designpixil.com/blog/saas-onboarding-flow-design): cada estado
  vacío con su llamada a la acción; el producto se descubre **haciendo**.
- [Onboarding con checklists y ayuda contextual](https://www.exodeui.com/learn/onboarding-checklists-vs-wizards/):
  el wizard largo al principio se salta; gana el checklist corto con ayuda **en contexto**.

Concretamente, en Usagia:

### D-1. Selección inicial: qué servicios usa

**En el primer arranque**, antes de mostrar la tarjeta con 4 filas vacías, una pantalla pregunta:

> **¿Qué servicios de IA usas?**
> Marca los que tengas. Solo se mostrarán esos en la tarjeta.
>
> ☐ Minimax (plan M)  
> ☐ Claude (Code o Desktop)  
> ☐ Google Antigravity (IDE)  
> ☐ DeepSeek

Solo las cuentas marcadas se activan (`enabled: true` en `config.json`). Las demás no aparecen en
la tarjeta. Siempre se puede añadir otra después en Configuración.

**Racionalidad:** evita el "4 filas diciendo 'sin credencial'" del problema original. Alguien que
solo tiene Minimax marca solo esa y ve **1 fila**, no 4 imposibles de conectar.

### D-2. Una pantalla «Conexiones» dentro de Configuración

La ventana de ⚙ gana una sección **Conexiones**. Para cada cuenta **activa**, una tarjeta con:

- **Qué es** (en lenguaje llano, sin asumir que conoce la herramienta).
- **Estado**: `Conectada` · `Detectada, sin probar` · `Falta conectar` · `Error: <motivo>`.
- **Instrucciones honestas** (ver D-4):
  - Si es `paste-key`: campo + botón Probar (ej. Minimax).
  - Si es `auto` y **no** hay credencial detectada: "Necesitas [App]. [Descargar] o [Quitar]".
  - Si es `auto` y **sí** hay credencial: "Detectada ([fuente]). [Probar]".
- **Probar** (sin gastar cuota: son endpoints de metadatos).
- **Quitar** la cuenta, con explicación de qué deja de verse.
- **Añadir otra cuenta** (abre el selector de proveedores).

### D-3. El estado vacío de la tarjeta lleva a la acción

Las filas sin credencial dejan de ser un callejón: pasan de `sin credencial` a **«Falta
conectar»** y muestran una acción **Conectar** que abre Configuración **enfocada en esa cuenta**.
La fila de la tarjeta no lleva a ninguna web.

Progreso visible: «Conectar cuentas · 1 de N» (N = cuentas **activas**) mientras quede alguna, y
se retira cuando ya no queda ninguna. El descarte se recuerda (`onboarding.dismissedAt`), así que
no vuelve a molestar.

**Cambio clave:** el contador es sobre cuentas activas, no sobre las 4. Si solo activó Minimax, ve
"0 de 1", no "0 de 4".

### D-4. Las instrucciones son datos del proveedor, honestas y sin asumir conocimiento

Cada proveedor declara en su módulo su receta:

```js
setup: {
  action: 'auto' | 'paste-key' | 'paste-token',
  what: 'Monitoriza tu cuota del plan M de Minimax.',  // lenguaje llano
  requires: null | { app: 'Google Antigravity IDE', url: 'https://antigravity.google' },
  steps: [
    'Copia tu clave del plan M (empieza por sk-cp-).',
    'Pégala aquí y pulsa Probar.'
  ],
}
```

**Nueva regla:** si `action === 'auto'` y `requires` no es `null`, la UI comprueba si hay
credencial detectada:
- **Sí detectada** → "Detectada ([fuente]). [Probar]"
- **No detectada** → "Necesitas {requires.app}. [Descargar {requires.url}] o [Quitar esta cuenta]"

El enlace de descarga **sí** abre el navegador, pero solo cuando el usuario **no tiene** la
herramienta y **quiere** instalarla (acción explícita, no automática).

La UI solo pinta `setup`. Consecuencias: un proveedor nuevo **hereda** la guía, el texto se prueba
en `test-providers`, y nadie puede "olvidar" declarar dependencias. Se elimina `provider.url` del
flujo de filas: el clic abre Configuración.

### D-5. `Detectar` es local y `Probar` es explícito

- **Detectar** ejecuta `resolve()` (solo lectura de credenciales del sistema: ficheros, almacén de
  Windows, harness). Es gratis y sin red, así que se puede hacer al abrir la sección: dice
  «Detectada (sesión de Claude Code)» aunque no se haya probado.
- **Probar** reutiliza `fetchUsage` contra los endpoints de metadatos. Nunca llama a un modelo, así
  que **no consume ventanas de cuota**; si falla, muestra el motivo real (401, 429, «sin
  refresh_token»…) y el estado pasa a `Error`, no a `Falta conectar`.

### D-6. Sin modal bloqueante, sin tour: el primer arranque pregunta qué tiene

La pantalla de selección inicial **no es un modal bloqueante**: es una pantalla de bienvenida que
solo aparece si `config.json` no existe o está vacío. Se puede cerrar (todas las cuentas quedan
desactivadas) y volver a abrir desde Configuración → Añadir cuenta.

Un **micro-tour contextual** solo si en el futuro hay algo que descubrir (p. ej. explicar el hover
de la tarjeta). Hoy no se implementa: la primera pantalla ya resuelve la activación. Se documenta
como decisión para que nadie lo añada por inercia.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Enlace a una guía online / a `README.md` | El usuario pidió **sin enlaces externos**; además el caso real es alguien sin contexto técnico |
| Tour de 5-8 pasos sobre la interfaz | El problema es conectar una cuenta, no conocer botones; los tours largos se abandonan |
| Modal obligatorio en el primer arranque | La app es de bandeja y el hover es efímero; un modal al arrancar se cierra sin leer |
| Auto-detectar y «arreglar» credenciales | No se puede: la credencial la crea la otra herramienta (o se pega). La app solo puede explicarlo |
| Pedir al usuario que lea `FINDINGS.md` | Documento técnico; no es material de onboarding |

## 5. Impacto

| Componente | Cambio |
|---|---|
| `src/main/providers/*.js` | Añadir `setup` (what, requires, steps, action); retirar `url` del flujo de la fila |
| `src/main/settings.js` · `src/renderer/settings.*` | Pantalla de bienvenida (selección inicial) + sección **Conexiones** con estados, dependencias, Probar y Quitar |
| `src/renderer/card.js` · `card.css` | Fila «Falta conectar» con acción **Conectar**; contador «n de N» (N = activas) |
| `src/main/config.js` | `onboarding: { dismissed, completed, welcomeShown }` + normalizar `accounts[].enabled` |
| `src/main/summary.js` | Redacción `Falta conectar` (y sus pruebas) |
| `scripts/test-*.js` | `test-providers` (setup con requires), `test-local` (config), `test-renderer` (pantalla de bienvenida y CTA), `test-accounts` (catálogo expone setup) |
| `README.md` · `docs/` | Sección breve de primeros pasos en el README y una página `docs/primeros-pasos.md` enlazada desde su índice |

**No se toca:** endpoints, semántica de porcentajes (`pct100`), cachés por cuenta, actualizaciones.

## 6. Criterios de aceptación (resumen)

1. Un usuario **sin ninguna herramienta previa** ve solo las cuentas que marcó y entiende qué necesita para cada una.
2. Alguien que **solo tiene Minimax** conecta esa cuenta sin ver 3 filas imposibles de conectar.
3. Las instrucciones nunca asumen que el usuario sabe qué es cada herramienta («Abre Antigravity» → «Necesitas el IDE de Google Antigravity. [Descargar] o [Quitar]»).
4. Los enlaces de descarga **sí** abren el navegador, pero solo cuando el usuario pulsa «Descargar» (acción explícita, no automática al arrancar).
5. Cada fila sin credencial dice **qué hacer** y lleva a la cuenta concreta.
6. «Probar» da un veredicto en ≤5 s con el motivo real y sin gastar cuota.
7. El estado nunca miente: fallo de autenticación = `Error`; sin credencial = `Falta conectar`; sin la herramienta = «Necesitas [App]».
8. La pantalla de bienvenida no bloquea (se puede cerrar) y el descarte del aviso se recuerda.
9. `node scripts/test.js` en verde con las suites nuevas, y la UI comprobada con `npm run preview` y `npm run preview:settings`.

## 7. Coordinación

`src/main/main.js`, `src/main/settings.js`, `src/renderer/card.js` y `src/renderer/settings.js`
están reservados por otras sesiones (`STATUS.md`, tabla *Sesiones activas*). Este cambio **no toca
nada**: se implementará cuando el árbol esté limpio y esos ficheros estén libres, empezando por
`src/main/providers/*.js` y las pruebas, que sí están disponibles.
