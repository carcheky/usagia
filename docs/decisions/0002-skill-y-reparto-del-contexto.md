# 0002 · La skill del método y el reparto del contexto

> **Para quién:** quien vaya a tocar la skill `usagia-docs`, `STATUS.md` o el reparto de
> documentos.
> **Responde a:** por qué el método se expone como skill y por qué el estado se separa del
> historial.
> **Verificado:** 2026-11-16 · `npm test` (suite `scripts/test-docs.js`) y
> `node scripts/docs-metrics.js`.
> **No cubre:** el método en sí, que está en [../METODOLOGIA.md](../METODOLOGIA.md), ni el
> motivo de que exista `docs/`, que está en [0001](0001-documentacion-para-humanos-y-agentes.md).

- **Estado:** aceptada
- **Fecha:** 2026-11-16
- **Decisión de:** sesión de documentación (segunda tanda, tras medir el ahorro real)

## Contexto

La primera tanda (ADR 0001) creó `docs/` con índice y recetas. Al medirlo sobre los ficheros
reales salió un dato incómodo: seguir la receta costaba 3.079 tokens frente a 34.132 de la
raíz (91 % de ahorro) **si se cumplía**, pero el uso real (una sesión que abre `STATUS.md` y
`FINDINGS.md` enteros) bajaba el ahorro al 18 %. Tres cosas lo causaban:

1. **El método no se disparaba solo.** Estaba escrito en `AGENTS.md`, es decir, que un agente
   tiene que acordarse de mirarlo. El fichero más caro del repo (`STATUS.md`, 1.078 líneas /
   19.624 tokens) era además el de la tarea más frecuente.
2. **El documento más caro era el más consultado.** Retomar el trabajo exigía el historial
   entero, que es justo lo que no hace falta para continuar.
3. **Las recetas no eran verificables.** Nada obligaba a que una tarea nueva del README
   tuviera receta, ni a que las recetas apuntaran a documentos que existieran.

## Decisión

1. **`STATUS.md` se parte**: estado actual (≤ 250 líneas) en la raíz; historial por fases en
   `docs/historial.md`, con su propio índice de secciones. El estado se **fusiona** con lo que
   otra sesión haya escrito, nunca se sobrescribe.
2. **Los documentos largos de la raíz llevan índice de secciones** (H2 → línea) al principio:
   `STATUS.md` y `FINDINGS.md`. Se genera con `node scripts/docs-metrics.js --fix <fichero>` y
   la prueba comprueba que **coincide con los títulos reales**, así que si caduca, la suite
   falla en vez de mentir.
3. **El método se expone como skill** (`usagia-docs`, en el perfil DSH): la `description` dice
   **cuándo** activarla y el cuerpo solo apunta al índice y a la receta. Cero reglas
   duplicadas.
4. **La cobertura de recetas es verificable**: `scripts/test-docs.js` comprueba que toda tarea
   del README tiene fila, que la fila apunta a documentos que existen y que declara también
   lo que **no** hace falta leer.
5. **El ahorro se mide** con `scripts/docs-metrics.js`, fuera de `npm test` (depende del estado
   del proyecto, que cambia con cada sesión).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Dejar `STATUS.md` como estaba y avisar en la receta | El peor caso se queda en el 75 %: el fichero que se carga para "retomar" es el más caro |
| Mover el historial a `docs/historial/2026-11-16.md` (uno por fecha) | Multiplica los ficheros y rompe el "un nivel de índice" (§2 del método) |
| Meter la medición en `npm test` | Se rompe cada vez que otra sesión actualiza el estado: una prueba que falla por el mundo es ruido |
| Poner la skill en el repo (`.agents/skills/`) | El método no es de este repo: sirve en cualquiera. En el perfil está disponible en cualquier `cwd` |
| Escribir las reglas del método dentro de la skill | Duplicaría el contenido: dos sitios que se contradicen al cabo de un mes |
| Fusionar `docs/historial.md` con `FINDINGS.md` | Los dos son "lo que se descubrió", pero uno caduca y el otro no: juntarlos devuelve un documento de 900 líneas |

## Consecuencias

- **A favor:** el peor caso ("retomar") sube del 75 % al 86 % de ahorro; la media de 12
  tareas queda en el 87 %; el método se activa sin que nadie se acuerde; y las recetas no
  pueden pudrirse en silencio.
- **En contra:** `STATUS.md` es ahora un fichero que se regenera y hay que reindexar
  (`docs-metrics.js --fix`), y `docs/historial.md` es largo a propósito (exento del tope, con
  el motivo escrito en la propia prueba).
- **Riesgo:** partir `STATUS.md` mientras otra sesión lo edita. Mitigación: se fusiona, se
  commitea solo lo de este cambio y se anota en `STATUS.md`.

## Verificación

- `node scripts/docs-metrics.js` → media **87 %** de ahorro, peor caso 68 % (Android, plan
  entero).
- `node scripts/test-docs.js` → índices, cobertura de recetas y enlaces, en verde.
- **Pruebas negativas** (lo que de verdad importa: que la prueba *falle* cuando debe):
  - quitar la receta de la sección *Instalación y arranque* → la suite falla nombrando la
    sección sin receta;
  - añadir una sección nueva al README → la suite falla nombrándola;
  - añadir una sección a `FINDINGS.md` sin regenerar el índice → la suite falla contando
    secciones.
- `npm test` → las 10 suites en verde.
