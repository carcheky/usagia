# Proposal

## Why

La documentación de Usagia (creada el 2026-11-16 18:20) tiene la estructura correcta pero
**no se cumple**: se mide sobre los ficheros reales que cargar los cuatro documentos de la raíz
(`README` + `AGENTS` + `STATUS` + `FINDINGS`) cuesta **34.132 tokens**, y seguir la receta del
método baja a **3.079** (91 % de ahorro)… **si** el agente la sigue. Con el uso realista (una
sesión que abre `STATUS.md` y `FINDINGS.md` enteros, como es habitual) el ahorro real es del
**18 %**, y hay tres tareas sin cobertura en la tabla de recetas. La nota de calidad sale
**78/100**, y los cinco puntos que faltan son conocidos y acotados.

Además, el método depende de que un agente **recuerde** consultar `AGENTS.md`: no hay ninguna
divulgación progresiva **nativa** que lo dispare, y el fichero más caro del repo (`STATUS.md`,
1.078 líneas / 19.624 tokens) es exactamente el que se necesita para la tarea más frecuente
("retomar el trabajo").

## What Changes

Cinco mejoras, todas sobre la documentación (nada de esto toca el comportamiento de la app):

1. **Partir `STATUS.md`**: se queda con el estado **actual** (≤ 250 líneas: resumen, versiones,
   sesiones activas, qué funciona, pendiente, riesgos) y el historial por fases pasa a
   `docs/historial.md`. El peor caso de la tabla ("retomar tras otra sesión") sube del 75 % al
   ~95 % de ahorro.
2. **Skill DSH `usagia-docs`**: el método pasa de "regla que hay que recordar" a **divulgación
   progresiva nativa**: la skill expone en su `description` *cuándo* se activa ("qué leer",
   "documentar", "qué ficheros tocar") y su cuerpo carga el índice y la receta **solo** cuando
   encaja.
3. **Índice de secciones** al principio de `STATUS.md` y `FINDINGS.md`: una tabla de H2 → línea,
   para que el `read` con `offset`/`limit` sea trivial y no una arqueología.
4. **Recetas completas**: se cubren los huecos (bandeja/hover, instalador NSIS, logs de
   actualización, `config.json`, `npm run probe`, credenciales) y la tabla declara **qué no**
   hace falta leer en cada caso.
5. **Prueba de cobertura de recetas** en `scripts/test-docs.js`: toda tarea de `README.md` tiene
   fila en la tabla de recetas, y cada receta apunta a documentos que existen. Convierte el
   método en algo que se rompe de forma visible cuando deja de cumplirse.

**No cambia**: el comportamiento de la app, los endpoints, la semántica de los porcentajes, el
pipeline de releases ni el esquema de ramas.

## Capabilities

### New Capabilities

- `documentacion`: cómo se documenta este repo para humanos y agentes, cómo se **carga** de
  forma selectiva según la tarea, y qué garantiza que esa carga siga siendo posible (índice,
  recetas, cabeceras, skill y pruebas).

### Modified Capabilities

- Ninguna: `openspec/specs/` está vacío (el único cambio vivo, `onboarding-cuentas`, aún no se
  ha archivado y es de otra sesión).

## Impact

| Fichero | Cambio |
|---|---|
| `STATUS.md` | Se parte: estado actual arriba, historial a `docs/historial.md`; se le añade el índice de secciones |
| `docs/historial.md` | **Nuevo**: el historial por fases que sale de `STATUS.md` (≤ 300 líneas por sección) |
| `docs/METODOLOGIA.md` | Recetas ampliadas (12 → 18) y enlazadas con la skill |
| `docs/README.md` | Se enlazan `historial.md` y la skill; se actualizan los costes medidos |
| `docs/decisions/0002-*.md` | **Nuevo**: ADR de la skill y del reparto índice/documento |
| `~/.dsh/skills/usagia-docs/SKILL.md` | **Nuevo** (perfil global): la skill de DSH |
| `scripts/test-docs.js` | Prueba de cobertura de recetas y de enlaces de la tabla |
| `README.md` · `AGENTS.md` | Enlaces a la skill y al índice; nada de contenido duplicado |

**Riesgo de coordinación**: `STATUS.md` lo reservan otras sesiones ([`AGENTS.md`](../../../../AGENTS.md)
§ *Varias sesiones*). Se parte **fusionando**: no se pisa nada, el historial se traslada tal cual
y la tabla de sesiones activas se deja intacta.
