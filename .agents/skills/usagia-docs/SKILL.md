---
name: usagia-docs
description: Use when you need to know WHAT TO READ or WHERE TO WRITE documentation in the Usagia repo, or when you are asked to "documentar" something, "qué leer", "qué ficheros tocar", "qué documenta esta tarea", or to write a decision, a procedure or a finding. Also use before adding a file to docs/ (it must be linked from the index), before editing STATUS.md or FINDINGS.md (they are read by sections), and when you need to measure the documentation token cost. Points at the index and the per-task recipes; it does not repeat them.
---

# Documentación de Usagia: qué leer y dónde escribir

Este repo tiene **un índice** y **un método de carga selectiva**. La skill es solo el
**disparador**: el contenido vive en los documentos, y aquí están los punteros.

## 1. Antes de leer nada: la receta de la tarea

Abre `docs/README.md` (el índice, ~900 tokens) y busca tu tarea en la tabla de recetas de
`docs/METODOLOGIA.md` §4. Cada fila dice **qué leer** y **qué no hace falta leer**.

```
docs/README.md          -> indice: que documento responde a que
docs/METODOLOGIA.md §4  -> receta de tu tarea (leer / no leer)
```

**No abras los cuatro documentos de la raíz** (`README`, `AGENTS`, `STATUS`, `FINDINGS`):
cuestan ~22.000 tokens y la receta entera cuesta ~2.600.

## 2. Documentos largos: por secciones

`STATUS.md` y `FINDINGS.md` llevan al principio una **tabla de secciones** (H2 → línea).
Usa `read` con `offset`/`limit` sobre el rango que te interesa; no los leas enteros.

Si la tabla ha caducado (una sección nueva, una línea que se movió), se regenera con:

```powershell
node scripts/docs-metrics.js --fix STATUS.md
node scripts/docs-metrics.js --fix FINDINGS.md
```

## 3. Dónde escribir (un dato, un sitio)

| Qué es | Dónde |
|---|---|
| Estado **actual** del proyecto (publicado, a medias, pendiente) | `STATUS.md` (se **fusiona**, no se sobrescribe) |
| Por qué se hizo algo ya cerrado | `docs/historial.md` (por secciones) |
| Endpoint, credencial, semántica, cifras medidas | `FINDINGS.md` |
| Regla de trabajo, ramas, releases, pruebas | `AGENTS.md` |
| Uso de la app | `README.md` |
| Decisión durable con alternativas descartadas | `docs/decisions/NNNN-*.md` (ADR) |
| Método o procedimiento | `docs/*.md` |

Un documento nuevo en `docs/` **tiene que enlazarse** desde `docs/README.md`: si no, la
suite `scripts/test-docs.js` falla (es lo que lo hace invisible).

## 4. Al terminar una tarea

1. Escribe el hallazgo en su sitio, con **fecha** y **cómo se verificó**.
2. Enlázalo desde el índice o desde el documento que ya lo cubre.
3. `npm test` (incluye `scripts/test-docs.js`: enlaces, índice, cabeceras, tamaño y
   cobertura de recetas).
4. Commit `docs:`.

## 5. Medir el ahorro

```powershell
node scripts/docs-metrics.js
```

Da los tokens por fichero, el ahorro por tarea, la media y el peor caso. No entra en
`npm test` a propósito: depende del estado del proyecto, que cambia con cada sesión.

## 6. Lo que esta skill NO hace

- No repite el método: si una regla está aquí y en `docs/METODOLOGIA.md`, es un defecto.
- No es el índice: para saber qué documento leer, abre `docs/README.md`.
- No sustituye a `STATUS.md`: el estado del proyecto es de ahí, no de aquí.
