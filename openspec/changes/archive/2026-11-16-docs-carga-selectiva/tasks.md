# Tasks

## 1. Medición (línea base)

- [x] 1.1 Crear `scripts/docs-metrics.js`: mide tokens por fichero (`chars/3,6`), tokens del
      índice, tokens de cada receta, ahorro por tarea y media ponderada; e imprime el índice de
      secciones (H2 → línea) de un fichero. Verificación: `node scripts/docs-metrics.js` imprime
      la tabla de ficheros y la de ahorro por tarea sin errores.
- [x] 1.2 Fijar en `docs/METODOLOGIA.md` la línea base medida (2026-11-16): 34.132 tokens de la
      raíz frente a 3.079 de la receta. Verificación: el número está en el documento y coincide
      con lo que imprime `docs-metrics.js`.

## 2. Partir `STATUS.md` (estado + historial)

- [x] 2.1 Crear `docs/historial.md` con el historial que sale de `STATUS.md` (los "Lo último:
      …", "Pausa del día", "Cola de la revisión", "Verificación de la UI", "Historial de
      releases"), **trasladado tal cual** y con su propia tabla de secciones. Verificación: cada
      bloque de `STATUS.md` aparece una vez, en un solo sitio.
- [x] 2.2 Dejar `STATUS.md` con el estado actual (≤ 250 líneas): resumen, versiones, sesiones
      activas, qué funciona, pendiente, riesgos y puntos abiertos; y un enlace a
      `docs/historial.md`. Verificación: `STATUS.md` baja de 1.078 a ≤ 250 líneas y no pierde
      ninguna de las secciones que una sesión necesita para trabajar (versiones, sesiones
      activas, pendiente, riesgos).
- [x] 2.3 Fusionar (no pisar): la tabla de sesiones activas y la de pendientes de `STATUS.md` se
      conservan tal cual. Verificación: `git diff` no borra filas de esas tablas.

## 3. Índice de secciones en los documentos largos

- [x] 3.1 Añadir al principio de `STATUS.md` y de `FINDINGS.md` una tabla con sus secciones y la
      línea en que empieza cada una. Verificación: `node scripts/docs-metrics.js --index
      STATUS.md` y `--index FINDINGS.md` devuelven la misma tabla.
- [x] 3.2 Comprobar en `scripts/test-docs.js` que la tabla de secciones de cada uno de los dos
      documentos **coincide con sus títulos reales**. Verificación: la suite pasa; al añadir una
      sección a `FINDINGS.md` sin actualizar la tabla, la suite falla.

## 4. Recetas completas

- [x] 4.1 Ampliar la tabla de recetas de `docs/METODOLOGIA.md` (12 → 18) con los huecos:
      bandeja/hover, instalador NSIS, logs de actualización (`updater/update.log`), `config.json`,
      `npm run probe` y credenciales. Cada fila dice qué leer **y qué no**. Verificación: la tabla
      tiene 18 filas y cada una cita documentos que existen.
- [x] 4.2 Enlazar las recetas nuevas desde `docs/README.md` y actualizar los costes medidos.
      Verificación: `scripts/test-docs.js` en verde.

## 5. Prueba de cobertura de recetas

- [x] 5.1 En `scripts/test-docs.js`, comprobar que toda tarea descrita en `README.md` (secciones
      de "qué se puede hacer": instalar, configurar cuentas, añadir proveedor, empaquetado,
      releases, actualizaciones, Android) tiene fila en la tabla de recetas. Verificación: al
      quitar una fila de la tabla, la suite falla nombrando la tarea sin cubrir.
- [x] 5.2 Comprobar que cada receta apunta a documentos que existen (mismo criterio de enlaces,
      aplicado a las celdas de la tabla). Verificación: al renombrar un documento citado en una
      receta, la suite falla.
- [x] 5.3 Explicitar en el propio test la exención de `docs/historial.md` del tope de 300
      líneas, con su motivo (documento de archivo, se consulta por secciones). Verificación: la
      suite pasa con el historial largo.

## 6. Skill DSH del método

- [x] 6.1 Crear `~/.dsh/skills/usagia-docs/SKILL.md` con frontmatter `name` + `description`
      que describa **cuándo** activarla (qué leer, documentar, qué ficheros tocar, carga
      documental) y un cuerpo que solo apunte al índice y a la receta, sin duplicar reglas.
      Verificación: el cuerpo no repite ninguna frase de `docs/METODOLOGIA.md`.
- [x] 6.2 Enlazar la skill desde `docs/README.md` y `AGENTS.md`, con cómo instalarla para quien
      no tiene ese perfil. Verificación: `scripts/test-docs.js` en verde.

## 7. ADR y cierre

- [x] 7.1 Escribir `docs/decisions/0002-*.md`: la skill, el reparto índice/documento y la
      exención del historial, con las alternativas descartadas. Verificación: enlazado desde
      `docs/README.md` y con la cabecera que exige la suite.
- [x] 7.2 Actualizar `docs/METODOLOGIA.md` y `AGENTS.md` con los números medidos después de los
      cambios. Verificación: `node scripts/docs-metrics.js` da un ahorro medio ≥ 85 % y el
      peor caso ("retomar") ≥ 90 %.
- [x] 7.3 `npm test` en verde (10 suites) y commit `docs:` en `beta` con **solo** los ficheros de
      este cambio. Verificación: `git status --porcelain` no muestra ficheros ajenos en el
      commit.

## Workflow follow-up

- Archivar el cambio con OpenSpec al terminar (fusiona el delta en
  `openspec/specs/documentacion/spec.md` y mueve el cambio a `changes/archive/`).
- Comprobar el resultado archivado.
