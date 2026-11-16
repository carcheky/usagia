# OpenSpec en Usagia

Este directorio sigue el patrón **OpenSpec** ([openspec.dev](https://openspec.dev/), Fission-AI)
adaptado a este repositorio: se usa la **estructura de carpetas y el flujo**, no el CLI de npm.
Igual que en `woptimizer`, la dependencia es cero: nada que instalar para leer o escribir una
propuesta.

## Para quién / Responde a / Verificado

- **Para quién:** cualquier sesión o persona que vaya a cambiar el comportamiento de la app.
- **Responde a:** dónde se especifica un cambio antes de tocar `src/`.
- **Verificado:** 2026-11-16 (estructura nueva; sin cambios de código todavía).
- **No cubre:** la documentación del proyecto (eso vive en [`docs/`](../docs/README.md)), el
  estado del proyecto ([`STATUS.md`](../STATUS.md)) ni los hechos medidos
  ([`FINDINGS.md`](../FINDINGS.md)).

## Estructura

```
openspec/
├── specs/                         # Verdad canónica (una carpeta por capacidad)
│   └── <capacidad>/spec.md        # Requisitos SHALL + escenarios WHEN/THEN
└── changes/                       # Propuestas
    ├── <fecha>-<id>/              # Activa
    │   ├── proposal.md            # Por qué + qué cambia + impacto
    │   ├── tasks.md              # Pasos numerados, cada uno con su prueba
    │   └── specs/<capacidad>/spec.md   # Delta: ADDED / MODIFIED / REMOVED
    └── archive/                   # Cerradas (histórico inmutable; no se borra)
        └── <fecha>-<id>/
```

## Flujo

1. Se escribe `changes/<fecha>-<id>/proposal.md` antes de tocar `src/`.
2. Se escriben `tasks.md` (pasos verificables) y, si el cambio toca requisitos, el **delta**
   `specs/<capacidad>/spec.md`.
3. Al implementar, una tarea = un commit (`feat:`/`fix:` con su prueba, como manda
   [`AGENTS.md`](../AGENTS.md)).
4. Al cerrar, el delta se **fusiona** en `specs/<capacidad>/spec.md` y la carpeta del cambio se
   mueve a `changes/archive/`.

## Qué NO es este directorio

- No es el README de la app (eso es [`README.md`](../README.md)).
- No es un diario: el diario es [`STATUS.md`](../STATUS.md).
- No es documentación de uso: eso es [`docs/`](../docs/README.md).

La regla de oro sigue siendo la de `AGENTS.md`: **un dato, un sitio**.
