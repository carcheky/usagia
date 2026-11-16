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
| [METODOLOGIA.md](METODOLOGIA.md) | Dónde se documenta cada cosa, cómo se mide el ahorro y qué se carga en cada tarea | Al empezar a documentar, al elegir qué leer, o si dudas de qué leer | ~3,5 k · corto |
| [historial.md](historial.md) | Qué se hizo y por qué, fase por fase (lo ya cerrado) | Solo si necesitas el porqué de una decisión pasada. **Por secciones** | largo · por secciones |
| [decisions/0001](decisions/0001-documentacion-para-humanos-y-agentes.md) | Por qué la documentación vive en `docs/` con índice y carga selectiva (y qué alternativas se descartaron) | Al cuestionar o cambiar el esquema documental | ~1 k · corto |
| [decisions/0002](decisions/0002-skill-y-reparto-del-contexto.md) | Por qué hay una skill y por qué el estado se separa del historial | Al tocar la skill, `STATUS.md` o el reparto de documentos | ~1 k · corto |
| [README.md](../README.md) | Qué es la app, cómo se instala y se configura, cómo se añade un proveedor, releases e interacción | Casi cualquier tarea de producto | ~4 k |
| [AGENTS.md](../AGENTS.md) | Reglas de trabajo: ramas, releases, pruebas, coordinación entre sesiones | Antes de commitear, tocar el pipeline o compartir ficheros | ~3 k |
| [STATUS.md](../STATUS.md) | Qué está publicado, qué está a medias, qué toca después *(caduca: mirar la fecha)* | Al retomar el repo o antes de tocar algo reservado | ~8 k · **por secciones** |
| [FINDINGS.md](../FINDINGS.md) | Endpoints, credenciales y semántica de cada proveedor; cifras medidas *(fuente única de verdad)* | Al tocar un proveedor, una cuota o una credencial | ~7,4 k · por secciones |
| [PLAN-ANDROID.md](../PLAN-ANDROID.md) | El plan de Android: arquitectura, fases, firma y pipeline | Solo si la tarea es Android (es la excepción: se lee entero) | ~8,3 k · largo |

## Por tarea

La tabla completa (12 tareas, con "qué **no** hace falta leer") está en
[METODOLOGIA.md §4](METODOLOGIA.md#4-recetas-qué-cargar-según-la-tarea). No se copia
aquí a propósito: duplicar el índice es la forma más rápida de que uno de los dos
mienta.

## Decisiones (ADR)

- [0001 · Documentar para humanos y agentes, en `docs/`, con carga selectiva](decisions/0001-documentacion-para-humanos-y-agentes.md) — 2026-11-16, aceptada.
- [0002 · La skill del método y el reparto del contexto](decisions/0002-skill-y-reparto-del-contexto.md) — 2026-11-16, aceptada.

Los cambios de **comportamiento** de la app se especifican aparte, con OpenSpec:
[`openspec/specs/documentacion/spec.md`](../openspec/specs/documentacion/spec.md) es la
spec de este método, y [`openspec/`](../openspec/README.md) guarda las propuestas.

## La skill del método

`usagia-docs`: el método con **divulgación progresiva nativa**. Se activa sola cuando la
tarea encaja ("qué leer", "documentar esto", "qué ficheros tocar"). Su cuerpo **no repite**
el método: apunta aquí.

| Dónde | Cuándo |
|---|---|
| [`.agents/skills/usagia-docs/SKILL.md`](../.agents/skills/usagia-docs/SKILL.md) | En este repo: DSH la detecta sola (ya está en el catálogo de skills) |
| `~/.dsh/skills/usagia-docs/SKILL.md` | Instalada en el perfil, para que sirva en **cualquier** repo |

```powershell
# reinstalar en el perfil (una vez, o tras editar la del repo)
Copy-Item .agents\skills\usagia-docs\SKILL.md $env:USERPROFILE\.dsh\skills\usagia-docs\SKILL.md -Force
```

Para quien no tenga ese perfil, el contenido completo es [METODOLOGIA.md](METODOLOGIA.md).

## Optional

Lo que un agente puede saltarse si va justo de contexto:

- El historial (`git log --oneline`, [historial.md](historial.md)) sirve para entender cómo se
  llegó aquí, no para cambiar una línea.
- Las cifras de `FINDINGS.md §3` están fechadas: si la tarea no depende de un número
  exacto, no hace falta re-medirlas.
- Las notas de entorno de las pruebas (GPU, `ELECTRON_RUN_AS_NODE`, sandbox) están en
  `README.md` y `STATUS.md`; solo se cargan al ejecutar la app de verdad.
