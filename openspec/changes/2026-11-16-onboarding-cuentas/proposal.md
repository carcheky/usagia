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

### D-1. Una pantalla «Conexiones» dentro de Configuración

La ventana de ⚙ gana una sección **Conexiones** con una tarjeta por cuenta y, dentro:

- **Qué es** (una línea: «Minimax es tu suscripción M Plan», etc.).
- **Estado**: `Conectada` · `Detectada, sin probar` · `Falta conectar` · `Error: <motivo>`.
- **1-2 pasos** para conectarla, en texto local (ver D-3).
- **Probar** (valida ya, sin esperar al refresco y **sin gastar cuota**: son endpoints de
  metadatos).
- **Quitar** la cuenta, con la explicación de qué deja de verse.

### D-2. El estado vacío de la tarjeta lleva a la acción

Las filas sin credencial dejan de ser un callejón: pasan de `sin credencial` a **«Falta
conectar»** y muestran una acción **Conectar** que abre Configuración **enfocada en esa cuenta**.
La fila de la tarjeta no lleva a ninguna web.

Progreso visible: «Conectar cuentas · 1 de 4» mientras quede alguna, y se retira cuando ya no
queda ninguna. El descarte se recuerda (`onboarding.dismissedAt`), así que no vuelve a molestar.

### D-3. Las instrucciones son datos del proveedor, no texto cableado en la UI

Cada proveedor declara en su módulo su receta:

```js
setup: {
  action: 'auto' | 'paste-key' | 'paste-token',
  what: 'Tu suscripción M Plan.',
  steps: ['Copia tu clave del plan M (empieza por sk-cp-).', 'Pégala aquí y pulsa Probar.'],
  // opcional: 'command' para copiar al portapapeles, nunca una URL
}
```

La UI solo pinta `setup`. Consecuencias: un proveedor nuevo **hereda** la guía, el texto se prueba
en `test-providers`, y no se puede «olvidar» un proveedor. Se elimina `provider.url` del flujo (y
con ello el enlace a la portada de Antigravity): el clic de la fila abre Configuración.

### D-4. `Detectar` es local y `Probar` es explícito

- **Detectar** ejecuta `resolve()` (solo lectura de credenciales del sistema: ficheros, almacén de
  Windows, harness). Es gratis y sin red, así que se puede hacer al abrir la sección: dice
  «Detectada (sesión de Claude Code)» aunque no se haya probado.
- **Probar** reutiliza `fetchUsage` contra los endpoints de metadatos. Nunca llama a un modelo, así
  que **no consume ventanas de cuota**; si falla, muestra el motivo real (401, 429, «sin
  refresh_token»…) y el estado pasa a `Error`, no a `Falta conectar`.

### D-5. Sin enlaces, sin modal, sin tour: qué sustituye al tour

Un **micro-tour contextual de 2 pasos** solo si en el futuro hay algo que descubrir (p. ej. el
hover de la tarjeta). Hoy no se implementa: la primera pantalla ya es la tarea. Se documenta como
decisión para que nadie lo añada por inercia.

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
| `src/main/providers/*.js` | Añadir `setup` (what, steps, action); retirar `url` del flujo de la fila |
| `src/main/settings.js` · `src/renderer/settings.*` | Sección **Conexiones** con estados, pasos, Probar y Quitar |
| `src/renderer/card.js` · `card.css` | Fila «Falta conectar» con acción **Conectar**; contador «n de 4» |
| `src/main/config.js` | `onboarding: { dismissedAt, completedAt }` (normalizado, sin datos personales) |
| `src/main/summary.js` | Redacción `Falta conectar` (y sus pruebas) |
| `scripts/test-*.js` | `test-providers` (setup de cada proveedor), `test-local` (config), `test-renderer` (CTA y textos), `test-accounts` (catálogo expone `setup`) |
| `README.md` · `docs/` | Sección breve de primeros pasos en el README y una página `docs/primeros-pasos.md` enlazada desde su índice |

**No se toca:** endpoints, semántica de porcentajes (`pct100`), cachés por cuenta, actualizaciones.

## 6. Criterios de aceptación (resumen)

1. Un usuario nuevo, **sin leer nada fuera de la app**, conecta al menos Minimax y ve la cuota.
2. Ninguna pantalla del flujo abre el navegador ni enlaza a una web.
3. Cada fila sin credencial dice **qué hacer** y lleva a la cuenta concreta.
4. «Probar» da un veredicto en ≤5 s con el motivo real y sin gastar cuota.
5. El estado nunca miente: fallo de autenticación = `Error`; sin credencial = `Falta conectar`.
6. La app no abre modales sola, y el descarte del aviso se recuerda.
7. `node scripts/test.js` en verde con las suites nuevas, y la UI comprobada con `npm run preview`
   y `npm run preview:settings`.

## 7. Coordinación

`src/main/main.js`, `src/main/settings.js`, `src/renderer/card.js` y `src/renderer/settings.js`
están reservados por otras sesiones (`STATUS.md`, tabla *Sesiones activas*). Este cambio **no toca
nada**: se implementará cuando el árbol esté limpio y esos ficheros estén libres, empezando por
`src/main/providers/*.js` y las pruebas, que sí están disponibles.
