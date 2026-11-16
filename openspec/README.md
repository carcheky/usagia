# OpenSpec en Usagia

Este directorio sigue el patrón **OpenSpec** ([openspec.dev](https://openspec.dev/), Fission-AI)
con el **CLI instalado** (`npm i -g @fission-ai/openspec`, sin dependencias en el repo: nada
que instalar para leer o escribir una propuesta). El esquema activo es `spec-driven`
([`config.yaml`](config.yaml)).

## Para quién / Responde a / Verificado

- **Para quién:** cualquier sesión o persona que vaya a cambiar el comportamiento de la app.
- **Responde a:** dónde se especifica un cambio antes de tocar `src/`.
- **Verificado:** 2026-11-16 (estructura con CLI; cambios vivos: *onboarding de cuentas* y
  *carga selectiva de la documentación*).
- **No cubre:** la documentación del proyecto (eso vive en [`docs/`](../docs/README.md)), el
  estado del proyecto ([`STATUS.md`](../STATUS.md)) ni los hechos medidos
  ([`FINDINGS.md`](../FINDINGS.md)).

## Estructura

```
openspec/
├── config.yaml                  # esquema (spec-driven) y contexto del proyecto
├── specs/                       # Verdad canónica (una carpeta por capacidad)
│   └── <capacidad>/spec.md      # Requisitos SHALL + escenarios WHEN/THEN
└── changes/                     # Propuestas
    ├── <fecha>-<id>/            # Activa
    │   ├── proposal.md           # Por qué + qué cambia + impacto
    │   ├── design.md             # Cómo (decisiones y alternativas)
    │   ├── tasks.md              # Pasos numerados, cada uno con su prueba
    │   └── specs/<capacidad>/spec.md   # Delta: ADDED / MODIFIED / REMOVED
    └── archive/                  # Cerradas (histórico inmutable; no se borra)
        └── <fecha>-<id>/
```

## Flujo

```bash
openspec new change <id>          # crea la carpeta del cambio
openspec instructions <artefacto> --change <id> --json   # qué escribir y con qué plantilla
openspec validate <id> --strict   # comprueba proposal/specs/design/tasks
# ... implementar ...
openspec archive <id>             # fusiona el delta en specs/ y mueve el cambio a archive/
```

1. Se escribe `changes/<fecha>-<id>/proposal.md` antes de tocar `src/`.
2. Se escriben `tasks.md` (pasos verificables) y, si el cambio toca requisitos, el **delta**
   `specs/<capacidad>/spec.md`.
3. Al implementar, una tarea = un commit (`feat:`/`fix:` con su prueba, como manda
   [`AGENTS.md`](../AGENTS.md)).
4. Al cerrar, el delta se **fusiona** en `specs/<capacidad>/spec.md` y la carpeta del cambio se
   mueve a `changes/archive/`.

## Cambios vivos

| Cambio | Qué | Estado |
|---|---|---|
| [2026-11-16-onboarding-cuentas](changes/2026-11-16-onboarding-cuentas/proposal.md) | Conectar las cuentas sin adivinar | Propuesta (otra sesión) |
| [2026-11-16-docs-carga-selectiva](changes/archive/2026-11-16-docs-carga-selectiva/proposal.md) | La documentación, con índice y carga selectiva; `STATUS.md` partido | Implementado, pendiente de archivar |

## Qué NO es este directorio

- No es el README de la app (eso es [`README.md`](../README.md)).
- No es un diario: el diario es [`STATUS.md`](../STATUS.md).
- No es documentación de uso: eso es [`docs/`](../docs/README.md).

La regla de oro sigue siendo la de `AGENTS.md`: **un dato, un sitio**.
