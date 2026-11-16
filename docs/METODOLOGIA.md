# Metodología: documentar para humanos y agentes, y cargar solo lo que toca

> **Para quién:** cualquier persona o agente que trabaje en este repositorio.
> **Responde a:** dónde se documenta cada cosa, cómo se encuentra, y **qué se carga para cada tarea** (y qué no).
> **Verificado:** 2026-11-16 · `npm test` (suite `scripts/test-docs.js`) · enlaces e índice comprobados.
> **No cubre:** el estado del proyecto (eso es [STATUS.md](../STATUS.md)) ni la semántica de los endpoints (eso es [FINDINGS.md](../FINDINGS.md)).

## 1. La regla de oro

**Todo lo que se aprende trabajando se documenta**, en `docs/`, en un formato que
sirva igual a un humano y a un agente. Lo que no está escrito no existe para la
siguiente sesión: se vuelve a descubrir, y se paga dos veces (tiempo y cuota).

La regla, en cinco puntos:

1. **Se escribe al terminar, no "cuando haya tiempo"**: el hallazgo, la decisión y
   los números medidos, con su fecha.
2. **Un dato, un sitio** (ver §5). Copiarlo en dos documentos garantiza que uno de
   los dos mienta dentro de un mes.
3. **El índice manda**: un documento que no está en [README.md](README.md) no se
   encuentra y, por tanto, no se carga.
4. **Se escribe para que se pueda cargar por partes**: un H1, un resumen de una
   línea, secciones con H2 y tablas; sin rollo introductorio.
5. **Cargar es una decisión, no un accidente**: primero la receta de la tarea
   (§4), luego el documento, luego la sección. Nunca "abrir los cinco .md por si acaso".

## 2. Por qué así (lo que dice la evidencia de 2026)

Nada de esto es estética. Cada regla de arriba viene de un resultado medido:

| Técnica / hallazgo | Qué se midió | Cómo se aplica aquí |
|---|---|---|
| **`AGENTS.md` corto y escrito a mano** ([spec 2026](https://www.morphllm.com/agents-md-guide), [2.500 repos de GitHub](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)) | Con un `AGENTS.md` útil: **−28,6 % de tiempo** y **−16,6 % de tokens** (124 PRs, Codex). Autogenerado y **duplicando el README**: **+23 % de coste** y algo menos de éxito | `AGENTS.md` es un **puntero con reglas**, no un manual. Nada que ya diga el README |
| **"Context rot": la atención es finita** ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) | A más tokens en la ventana, peor recuperación de lo que hay dentro, en todos los modelos | El objetivo es el **conjunto mínimo de tokens con señal**: índice primero, resto just-in-time |
| **Divulgación progresiva: basta un nivel** ([REALM 2026, ∞Bench](https://aclanthology.org/2026.realm-1.14/)) | Un nivel (descripción → documento) degrada poco al crecer el corpus; un **segundo nivel de enrutado nunca ayuda y a veces rompe** | `docs/README.md` → documento. **Sin sub-índices** ni cadenas de tres saltos |
| **`llms.txt` v2** ([spec](https://llmstxt.org/)) | Formato: H1 + blockquote con el resumen + listas de enlaces con una nota + sección **Optional** para lo secundario | Es el formato del índice (§3) y el de la cabecera de cada documento (§6) |
| **Diátaxis** (4 cuadrantes: tutorial, cómo-se-hace, referencia, explicación) | Un documento con dos propósitos no sirve para ninguno | Cada documento declara **un** propósito en su cabecera |
| **Recuperación "just in time"** ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) | Rutas y nombres son identificadores ligeros; cargar el detalle al necesitarlo gana a precargarlo | `grep` y `read` con `offset`/`limit` antes que volcar un fichero entero (§3) |

## 3. Los tres niveles de carga

| Nivel | Qué es | Coste | Cuándo |
|---|---|---|---|
| **T0 · índice** | [docs/README.md](README.md): qué documento responde a qué | ~800 tokens | Siempre que haya que buscar algo. Es barato: se lee entero |
| **T1 · documento** | Un `.md` de `docs/` o de la raíz | ~1–3 k tokens | Cuando la receta de la tarea lo pide. Se lee entero **solo** si es corto (< 300 líneas) |
| **T2 · sección** | `grep` del H2 que toca + `read` con `offset`/`limit` | ~200–600 tokens | Documentos largos (`STATUS.md` tiene más de 750 líneas: **nunca se lee entero**) |

**Reglas duras de carga:**

- Un documento de `docs/` **no pasa de 300 líneas**. Si crece, se parte por
  propósito (y se indexan las dos partes). `test-docs.js` lo comprueba.
- `STATUS.md`, `FINDINGS.md` y `PLAN-ANDROID.md` se leen **por secciones**: se
  busca el H2 con `grep '^## '` y se lee ese rango.
- **No se cargan a la vez** dos documentos que dicen lo mismo. Si pasa, uno de los
  dos sobra: se borra o se enlaza.
- Antes de escribir, se carga **lo mínimo**: la receta + el documento que se va a
  tocar. El resto, si hace falta, después.

## 4. Recetas: qué cargar según la tarea

Esta es la tabla que evita abrir medio repositorio para un cambio de tres líneas.
"Leer" es en orden; "no hace falta" es tan importante como el resto.

| Tarea | Leer (en orden) | No hace falta |
|---|---|---|
| **Retomar el repo tras otra sesión** | [STATUS.md](../STATUS.md): cabecera, *Sesiones activas*, *Pausa del día* y *Pendiente / siguiente* (`grep '^## '` primero) | README entero, FINDINGS, el código |
| **Saber qué hay publicado** | [STATUS.md § Versiones](../STATUS.md) o `git tag --sort=-v:refname` | Todo lo demás |
| **Bug de cuota o de credenciales de un proveedor** | [FINDINGS.md §1–§2](../FINDINGS.md) + `src/main/providers/<id>.js` + `scripts/test-providers.js` | `src/renderer/`, pipeline, Android |
| **Añadir o cambiar un proveedor** | [README § Añadir un proveedor](../README.md) + [FINDINGS.md §2](../FINDINGS.md) + `src/main/providers/index.js` | `STATUS.md` |
| **Tocar la tarjeta o la configuración** | [README § Interacción](../README.md) y § Configuración + `src/renderer/` + `scripts/test-renderer.js` | `FINDINGS.md` |
| **Empaquetado / `asar` / instalador** | [README § Notas y límites](../README.md) + `package.json` → `build` + `scripts/test-package.js` | Todo lo demás |
| **Ramas, releases o pipeline** | [README § Releases](../README.md) + [AGENTS.md § Ramas y Releases](../AGENTS.md) + `scripts/release.js` | `STATUS.md` |
| **Actualizaciones (canal, aviso)** | [README § Actualizaciones](../README.md) + `src/main/updates.js` + `scripts/test-updates.js` | El resto de proveedores |
| **Android** | [PLAN-ANDROID.md](../PLAN-ANDROID.md) — es la excepción: el plan **se lee entero** | `src/main/hover.js`, `card.js` |
| **Revisión de código transversal** | [AGENTS.md § Reglas de la app](../AGENTS.md) + [decisions/0001](decisions/0001-documentacion-para-humanos-y-agentes.md) + el código | `STATUS.md` completo |
| **Medir cuotas de verdad** | [FINDINGS.md §3](../FINDINGS.md) + `npm run probe` | `src/` |
| **Documentar algo nuevo** | [§5](#5-dónde-va-cada-cosa) y [§6](#6-anatomía-de-un-documento) de este documento + [README.md](README.md) | Todo lo demás |

## 5. Dónde va cada cosa

Un dato, un sitio. Si dudas, esta tabla decide:

| Tipo de conocimiento | Sitio | Formato |
|---|---|---|
| Cómo se usa la app (humano) | [README.md](../README.md) | Guía + tablas |
| Regla de trabajo, ramas, releases, coordinación entre sesiones | [AGENTS.md](../AGENTS.md) | Reglas cortas |
| Estado del proyecto **ahora** (qué está publicado, qué está a medias) | [STATUS.md](../STATUS.md) | Instantánea con fecha |
| Endpoint, credencial, semántica de un proveedor, cifras medidas | [FINDINGS.md](../FINDINGS.md) | Referencia |
| Decisión durable con alternativa descartada | `docs/decisions/NNNN-*.md` | ADR |
| Método, convención o procedimiento del repo | `docs/*.md` | Explicación o cómo-se-hace |
| Plan de algo que aún no existe | `PLAN-*.md` (raíz) | Plan con fases |

**Nunca** se duplica un dato de un sitio en otro: se enlaza. El índice tiene que
reflejar ese reparto sin repetirlo.

## 6. Anatomía de un documento

Todo documento de `docs/` empieza así (la cabecera es lo que permite decidir si
se carga **sin** cargarlo):

```markdown
# Título: qué resuelve

> **Para quién:** humanos y agentes que ...
> **Responde a:** la pregunta concreta ...
> **Verificado:** 2026-11-16 · cómo se comprobó (suite, comando, medición).
> **No cubre:** lo que no está aquí y dónde está.
```

Y después:

- **Una sola materia** (Diátaxis): referencia *o* cómo-se-hace *o* explicación.
  Si hacen falta dos, son dos documentos.
- **H2 con nombre de pregunta** ("¿Cómo se calcula el color?", no "Consideraciones").
- **Tabla** cuando hay tres o más elementos comparables; **lista** para pasos.
- **Enlaces relativos** (`../README.md`, `decisions/0001-...md`): funcionan en el
  repo, en GitHub y en un agente. `test-docs.js` comprueba que existen.
- **Fechas absolutas** (`2026-11-16`), nunca "ayer" ni "la semana pasada".
- Nombres en `kebab-case` y sin numerar salvo los ADR (el orden lo da el índice).

## 7. Mantenimiento: el bucle

Al terminar cualquier tarea, cuatro pasos. Cuestan dos minutos y ahorran una
sesión entera:

1. **Escribe** el hallazgo o la decisión en su sitio (§5), con la fecha y cómo se
   verificó.
2. **Enlázalo** desde [docs/README.md](README.md) si es un documento nuevo, o
   desde el documento que ya lo cubre si es una sección.
3. **Pasa `npm test`**: `scripts/test-docs.js` falla si hay un enlace roto, si un
   documento de `docs/` no está en el índice, si falta la cabecera o si un
   documento se pasa de 300 líneas.
4. **Commit `docs:`**. No publica release (no es de la app) y deja el
   conocimiento en el historial, que es donde lo encuentran las otras sesiones.

**Cuándo un documento se borra o se funde:** cuando su contenido ya vive en otro
sitio, o cuando deja de ser cierto y no hay forma de re-verificarlo. Un documento
que miente es peor que no tenerlo. Lo que es estado (`STATUS.md`) **caduca**: no
se copia a `docs/`; se decide (ADR) o se documenta el método.

## 8. Cómo lo usa un agente (DSH)

- **Las skills son divulgación progresiva de serie**: el catálogo solo trae
  `name` + `description`; el cuerpo se carga cuando la tarea encaja. Por eso una
  `description` vaga equivale a una skill que nunca se activa.
- **`AGENTS.md` es el puntero de arranque**, no el contenido: dice dónde está el
  índice y las reglas que no se pueden deducir del código.
- **Un nivel de índice, no dos**: `AGENTS.md` → [docs/README.md](README.md) →
  documento. Añadir un índice de índices empeora la precisión (§2).
- **`grep` y `read` con `offset`/`limit`** antes que volcar: es el T2 del §3, y es
  lo que evita gastar la ventana en `STATUS.md` cuando se buscaba una cifra.

## 9. Qué **no** es esto

- **No es un RAG ni una wiki**: no hay embeddings ni servidor. Son ficheros
  versionados con un índice que cabe en la ventana.
- **No es un diario**: el historial del trabajo está en los commits y en
  `STATUS.md`. En `docs/` va lo que seguirá siendo cierto dentro de un mes.
- **No es documentación de usuario**: el manual de la app es
  [README.md](../README.md); esto es cómo se trabaja en el repo.
