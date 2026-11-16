# Design

## Context

Estado actual (medido sobre los ficheros del repo, 2026-11-16 18:30):

| Fichero | Líneas | Tokens (chars/3,6) |
|---|---|---|
| `STATUS.md` | 1.078 | **19.624** |
| `FINDINGS.md` | 479 | 7.391 |
| `README.md` | 347 | 4.088 |
| `AGENTS.md` | 176 | 3.029 |
| `PLAN-ANDROID.md` | 570 | 8.309 |
| `docs/README.md` (índice) | 50 | 902 |
| `docs/METODOLOGIA.md` | 161 | 3.038 |

Cargar los cuatro documentos de la raíz cuesta **34.132 tokens**; seguir la receta, **3.079**
(91 % de ahorro). El ahorro **real** es el que depende del cumplimiento, y ahí está el hueco:
no hay ninguna prueba que compruebe que las recetas existen, que cubren las tareas, o que sus
enlaces siguen vivos.

Restricciones:

- `STATUS.md` lo reservan otras sesiones ([`AGENTS.md`](../../../../AGENTS.md) § *Varias sesiones
  en el mismo repo*): se **fusiona**, no se pisa.
- El árbol tiene trabajo ajeno **sin commitear** (`src/main/update-install.js`,
  `scripts/test-updates.js`): este cambio no toca `src/` ni esos ficheros.
- El método se define en `docs/METODOLOGIA.md` y la skill no puede duplicarlo.

## Goals / Non-Goals

**Goals:**

- Que el coste de la tarea más frecuente ("retomar el trabajo") no dependa del tamaño del
  historial.
- Que el método se dispare **solo** cuando la tarea encaja, sin depender de que el agente lea
  `AGENTS.md` y se acuerde.
- Que la tabla de recetas sea **completa y verificable**: sin receta, la suite falla.
- Que el ahorro se pueda **medir y volver a medir**, no estimar.

**Non-Goals:**

- No se reescribe el contenido de `STATUS.md` ni de `FINDINGS.md`: solo se parten y se indexan.
- No se toca el comportamiento de la app ni el pipeline de releases.
- No se introduce RAG, wiki ni ningún servicio: son ficheros versionados.
- No se mueve `README.md`/`AGENTS.md`/`FINDINGS.md` de la raíz (los referencian otras sesiones).

## Decisions

### D-1 · `STATUS.md` se parte en estado + historial

El estado actual (resumen, versiones, sesiones activas, qué funciona, pendiente, riesgos) se
queda en `STATUS.md`; el historial por fases ("Lo último: …", "Pausa del día", "Cola de la
revisión", "Verificación de la UI", "Historial de releases") pasa a `docs/historial.md`.

- **Alternativa descartada**: borrar el historial. Es lo que más caro sale: la próxima sesión
  que pregunta "¿por qué se hizo así?" no encuentra nada y lo repite.
- **Alternativa descartada**: `docs/historial/2026-11-16.md` por fecha. Multiplica los ficheros
  y rompe el "un nivel de índice" (el estudio de ∞Bench muestra que el enrutado de segundo nivel
  no ayuda).
- **Consecuencia**: `docs/historial.md` puede pasar de 300 líneas. Se exime del tope de
  `test-docs.js` **explícitamente** (lista de exenciones con motivo), porque es un documento de
  archivo, no de carga: se consulta por secciones, con su propio índice.

### D-2 · La skill vive en el perfil global, no en el repo

La skill `usagia-docs` se instala en `~/.dsh/skills/usagia-docs/SKILL.md` (perfil DSH), no en el
repo.

- **Por qué global**: el método no es de Usagia, es de "cómo se documenta y se carga". Sirve en
  cualquier repo, y así está disponible en sesiones cuyo `cwd` no es este repo.
- **Por qué el repo además**: el repo la **enlaza** desde `docs/README.md` y `AGENTS.md`, para
  que otra persona (o otra IA) la encuentre sin saber que está en el perfil.
- **Contenido**: solo el **disparador** (qué tareas la activan) y los **punteros** (índice,
  receta). Cero reglas duplicadas: si la skill y `docs/METODOLOGIA.md` coinciden en algo, es
  un defecto.

### D-3 · La prueba comprueba la **cobertura**, no la obediencia

Una prueba no puede obligar a un agente a seguir una receta. Lo que sí puede es **fallar
cuando la receta deja de ser válida**: una tarea sin receta, una receta que apunta a un
documento inexistente, un documento sin índice, un documento largo, una cabecera sin fecha.

- **Qué NO se prueba**: que el agente lea lo que toca (no es observable).
- **Alternativa descartada**: medir en tiempo de ejecución cuántos tokens se cargan. Requiere
  instrumentar el harness, que está fuera del repo.

### D-4 · La medición es un script en el repo, no un cálculo mental

`scripts/docs-metrics.js` mide el coste: tokens por fichero, tokens de la receta, ahorro por
tarea y media. Se ejecuta a mano (`node scripts/docs-metrics.js`) y **no** entra en `npm test`
(depende del contenido de `STATUS.md`, que cambia con cada sesión: una prueba que se rompe cada
vez que otra sesión actualiza el estado no sirve de red de seguridad).

- El criterio es `chars/3,6` (español técnico). El **porcentaje de ahorro no depende del
  divisor**, porque se aplica igual a los dos lados: el número absoluto se lee como
  aproximado, el ratio es exacto.
- Se versiona la salida del 2026-11-16 en `docs/METODOLOGIA.md` como línea base.

### D-5 · El índice de secciones se genera, no se escribe a mano

Añadir a mano la tabla «H2 → línea» en `STATUS.md` y `FINDINGS.md` es una Letras de Cambiar
(la tabla caduca en cuanto se añade una sección). Se genera con un comando de una línea
(`node scripts/docs-metrics.js --index`) y se pega; la prueba comprueba que **coincide** con los
títulos reales, así que si caduca, la suite falla en vez de mentir.

## Risks / Trade-offs

- **[Partir `STATUS.md` choca con otra sesión]** → Se fusiona: el historial se traslada **tal
  cual**, la tabla de sesiones activas y la de pendientes se dejan intactas, y el cambio se
  commitea solo con `docs/`, `STATUS.md`, `docs/historial.md` y `scripts/`. Si otra sesión
  está editando `STATUS.md`, se espera a su commit.
- **[Un histórico sin índice se carga entero]** → `docs/historial.md` lleva su propia tabla de
  secciones y la receta dice explícitamente que se lee por fragmentos.
- **[La skill global no la ve quien no tiene ese perfil]** → El repo la enlaza y documenta cómo
  instalarla; el contenido completo está en `docs/METODOLOGIA.md`, que es la fuente.
- **[La prueba de recetas es frágil al añadir tareas al README]** → Es el objetivo: que añadir
  una tarea al README sin receta se note en `npm test`, no tres meses después.
- **[El tope de 300 líneas puede pedirse partir un documento que no conviene partir]** → Las
  exenciones están explícitas en la propia prueba, con motivo.

## Migration Plan

1. Medir (línea base) → 2. Partir `STATUS.md` → 3. Índice de secciones en los dos documentos
   largos → 4. Recetas completas → 5. Prueba de cobertura → 6. Skill global → 7. Medir de
   nuevo y publicar el resultado.

**Rollback**: todo son ficheros (documentación y pruebas). `git revert` del commit `docs:`
deja el repo como estaba; la skill global se borra a mano de `~/.dsh/skills/usagia-docs/`.

## Open Questions

- ¿Fusionar `docs/historial.md` con `FINDINGS.md` (los dos son "lo que se descubrió")? **Se
  decide que no**: `FINDINGS.md` es la fuente de verdad de los endpoints (vive, no caduca) y el
  historial es por fases (caduca). Fusionarlos volvería a tener un documento de 900 líneas.
