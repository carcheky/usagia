# 0001 · Documentar todo en `docs/`, con índice y carga selectiva

> **Para quién:** quien vaya a añadir, mover o borrar documentación en este repo.
> **Responde a:** por qué la documentación vive en `docs/` con un índice, y qué se descartó.
> **Verificado:** 2026-11-16 · `npm test` (suite `scripts/test-docs.js`).
> **No cubre:** el método en sí, que está en [../METODOLOGIA.md](../METODOLOGIA.md).

- **Estado:** aceptada
- **Fecha:** 2026-11-16
- **Decisión de:** sesión de documentación (regla de oro pedida por el usuario)

## Contexto

En este repo trabajan **varias sesiones de DSH a la vez** y el conocimiento se
repartía entre `STATUS.md` (estado, más de 750 líneas y creciendo), `FINDINGS.md`
(referencia), `AGENTS.md` (reglas) y `README.md` (uso). Nada decía **qué leer para
cada tarea**: cada sesión abría los ficheros "por si acaso", gastando la ventana de
contexto en historia que no le servía, y lo aprendido se quedaba en la conversación.

La evidencia de 2026 dice tres cosas útiles: un `AGENTS.md` útil ahorra ~29 % de
tiempo y ~17 % de tokens, pero **duplicar el README** lo empeora (+23 % de coste);
la atención del modelo se degrada al crecer el contexto ("context rot"); y la
divulgación progresiva funciona con **un** nivel de índice, no con dos
([detalle y fuentes](../METODOLOGIA.md#2-por-qué-así-lo-que-dice-la-evidencia-de-2026)).

## Decisión

1. La documentación de método y decisión vive en **`docs/`**, en Markdown, con
   cabecera (`Para quién` / `Responde a` / `Verificado` / `No cubre`).
2. **`docs/README.md` es el índice único.** Un documento que no está en él no se
   encuentra.
3. Cada documento declara **un** propósito (Diátaxis) y no pasa de **300 líneas**.
4. El conocimiento se enruta por tipo: estado → `STATUS.md`, dato medido →
   `FINDINGS.md`, regla → `AGENTS.md`, uso → `README.md`, decisión durable →
   `docs/decisions/`, método → `docs/`.
5. **Los ficheros de la raíz no se mueven** (los referencian las otras sesiones y
   el historial); `docs/` los **enlaza**, no los copia.
6. `scripts/test-docs.js` (dentro de `npm test`) comprueba enlaces vivos, índice
   completo, cabecera y tamaño: la documentación tiene la misma red de seguridad
   que el código.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Dejarlo todo en la raíz y confiar en `grep` | Funciona con 4 documentos; con 8 y 750 líneas de estado, la sesión gasta la ventana buscando |
| Mover `STATUS.md`/`FINDINGS.md` a `docs/` | Rompe enlaces del historial y el reparto de ficheros entre sesiones activas, para ganar nada |
| Wiki externa o `llms.txt` servido por web | El canal entre sesiones es **el repo** (ver [AGENTS.md](../../AGENTS.md)); una wiki no la ven los agentes ni el `git log` |
| RAG / embeddings sobre la documentación | Infraestructura para 8 ficheros. El índice cabe en la ventana y no envejece mal |
| Un índice por carpeta (dos niveles) | El estudio de ∞Bench muestra que el segundo nivel de enrutado **no ayuda y a veces empeora** |
| `AGENTS.md` gordo con todo dentro | La evidencia dice lo contrario: duplicar contenido cuesta más y acierta menos |

## Consecuencias

- **A favor:** una sesión nueva sabe qué leer en 30 segundos; el conocimiento
  sobrevive a la conversación; los documentos no se contradicen (un dato, un sitio).
- **En contra:** hay que mantener el índice y la cabecera al día, y pasar `npm test`
  antes de commitear documentación. Es barato, pero es un paso más.
- **Riesgo:** un documento puede quedar obsoleto y **mentir**. Mitigación: campo
  `Verificado` con fecha, y borrar o fundir lo que ya no sea cierto ([§7](../METODOLOGIA.md#7-mantenimiento-el-bucle)).

## Verificación

- `node scripts/test-docs.js` → enlaces, índice, cabeceras y tamaño.
- `npm test` → la suite entra con las demás en el job `verify` del pipeline.
- Los enlaces relativos funcionan en el repo, en GitHub y desde un agente.
