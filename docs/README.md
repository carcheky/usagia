# Documentación de Usagia

> **Para quién:** humanos y agentes que llegan al repo sin saber qué leer.
> **Responde a:** qué documento contesta a qué, y en qué orden cargarlos.
> **Verificado:** 2026-11-16 · `npm test` comprueba que este índice enlaza todos los documentos.
> **No cubre:** las reglas de carga ni el reparto de conocimiento, que están en [METODOLOGIA.md](METODOLOGIA.md).
>
> Se lee primero este fichero (≈800 tokens) y se carga **solo** el documento que la
> tarea pida.

## Cómo se lee esto (30 segundos)

1. Busca tu tarea en [METODOLOGIA.md §4 · Recetas](METODOLOGIA.md#4-recetas-qué-cargar-según-la-tarea).
2. Carga **esos** documentos, en ese orden. Si son largos, por secciones (`grep '^## '` y `read` con `offset`).
3. Si escribes algo nuevo, [§5](METODOLOGIA.md#5-dónde-va-cada-cosa) dice dónde va y [§7](METODOLOGIA.md#7-mantenimiento-el-bucle) cómo cerrar el bucle.

## Documentos

| Documento | Responde a | Cuándo cargarlo | Coste |
|---|---|---|---|
| [METODOLOGIA.md](METODOLOGIA.md) | Dónde se documenta cada cosa y qué se carga en cada tarea | Al empezar a documentar o si dudas de qué leer | ~2 k · corto |
| [decisions/0001](decisions/0001-documentacion-para-humanos-y-agentes.md) | Por qué la documentación vive en `docs/` con índice y carga selectiva (y qué alternativas se descartaron) | Al cuestionar o cambiar el esquema documental | ~1 k · corto |
| [README.md](../README.md) | Qué es la app, cómo se instala y se configura, cómo se añade un proveedor, releases e interacción | Casi cualquier tarea de producto | ~3 k |
| [AGENTS.md](../AGENTS.md) | Reglas de trabajo: ramas, releases, pruebas, coordinación entre sesiones | Antes de commitear, tocar el pipeline o compartir ficheros | ~2 k |
| [STATUS.md](../STATUS.md) | Qué está publicado, qué está a medias, qué toca después *(caduca: mirar la fecha)* | Al retomar el repo o antes de tocar algo reservado | > 750 líneas · **por secciones** |
| [FINDINGS.md](../FINDINGS.md) | Endpoints, credenciales y semántica de cada proveedor; cifras medidas *(fuente única de verdad)* | Al tocar un proveedor, una cuota o una credencial | ~470 líneas · por secciones |
| [PLAN-ANDROID.md](../PLAN-ANDROID.md) | El plan de Android: arquitectura, fases, firma y pipeline | Solo si la tarea es Android (es la excepción: se lee entero) | ~largo |

## Por tarea

La tabla completa (12 tareas, con "qué **no** hace falta leer") está en
[METODOLOGIA.md §4](METODOLOGIA.md#4-recetas-qué-cargar-según-la-tarea). No se copia
aquí a propósito: duplicar el índice es la forma más rápida de que uno de los dos
mienta.

## Decisiones (ADR)

- [0001 · Documentar para humanos y agentes, en `docs/`, con carga selectiva](decisions/0001-documentacion-para-humanos-y-agentes.md) — 2026-11-16, aceptada.

## Optional

Lo que un agente puede saltarse si va justo de contexto:

- El historial (`git log --oneline`, `STATUS.md` entero) sirve para entender cómo se
  llegó aquí, no para cambiar una línea.
- Las cifras de `FINDINGS.md §3` están fechadas: si la tarea no depende de un número
  exacto, no hace falta re-medirlas.
- Las notas de entorno de las pruebas (GPU, `ELECTRON_RUN_AS_NODE`, sandbox) están en
  `README.md` y `STATUS.md`; solo se cargan al ejecutar la app de verdad.
