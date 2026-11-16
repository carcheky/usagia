# Spec Delta

## Purpose

Define cómo se documenta el repositorio Usagia para personas y para agentes, y cómo se carga
esa documentación de forma selectiva según la tarea, de modo que el coste de contexto de una
sesión se mantenga bajo control y el conocimiento no se pierda entre sesiones.

## ADDED Requirements

### Requirement: Índice único de la documentación
El repositorio SHALL tener un único índice (`docs/README.md`) que liste cada documento de
`docs/` con la pregunta que responde y el momento en que debe cargarse. Un documento que no
figura en el índice SHALL considerarse invisible para una sesión que no conoce el repo.

#### Scenario: Documento nuevo sin indexar
- **WHEN** se añade un documento a `docs/` y no se enlaza desde `docs/README.md`
- **THEN** la suite de documentación falla y el commit no puede completarse en verde

#### Scenario: Documento indexado
- **WHEN** se añade un documento a `docs/` y se enlaza desde `docs/README.md`
- **THEN** la suite de documentación pasa y el documento queda localizable desde el índice

### Requirement: Carga selectiva por receta de tarea
El repositorio SHALL ofrecer una tabla de recetas que, para cada tarea habitual, indique los
documentos que hay que leer y los que **no** hacen falta. La tabla SHALL cubrir toda tarea
descrita en `README.md`.

#### Scenario: Tarea sin receta
- **WHEN** `README.md` describe una tarea (por ejemplo, "instalar con el instalador NSIS") que
  no tiene fila en la tabla de recetas
- **THEN** la suite de documentación falla indicando la tarea sin cubrir

#### Scenario: Receta que apunta a un documento inexistente
- **WHEN** una receta de la tabla cita un documento que no existe en el repositorio
- **THEN** la suite de documentación falla, aunque el enlace sea relativo y el fichero se haya
  borrado

### Requirement: Documentos cortos y con cabecera verificable
Cada documento de `docs/` SHALL tener una cabecera con `Para quién`, `Responde a`, `Verificado`
(con fecha) y `No cubre`, y SHALL ocupar como máximo 300 líneas. Los documentos de la raíz que
superen ese tamaño (por ejemplo `STATUS.md`) SHALL estar partidos, de modo que la tarea
frecuente de retomar el trabajo no exija cargar el historial.

#### Scenario: Documento largo
- **WHEN** un documento de `docs/` supera las 300 líneas
- **THEN** la suite de documentación falla pidiendo partirlo

#### Scenario: Cabecera incompleta
- **WHEN** un documento de `docs/` no declara `Verificado` con fecha
- **THEN** la suite de documentación falla, porque no se puede saber si el contenido sigue siendo
  cierto

### Requirement: Estado del proyecto separado del historial
`STATUS.md` SHALL contener el estado **actual** del proyecto (versiones publicadas, sesiones
activas, qué funciona, qué queda pendiente) y el historial de fases SHALL vivir en un documento
aparte. Un cambio de estado SHALL NO requerir reescribir el historial.

#### Scenario: Retomar el trabajo
- **WHEN** una sesión nueva necesita saber qué está publicado, qué está a medias y qué le toca
- **THEN** lee el estado actual y el historial solo si necesita el porqué de una decisión

### Requirement: Índice de secciones en los documentos largos
Los documentos de la raíz que superen las 300 líneas (`STATUS.md` y `FINDINGS.md`) SHALL
incluir al principio una tabla con sus secciones y la línea en que empieza cada una, para que
puedan cargarse por fragmentos.

#### Scenario: Buscar una sección
- **WHEN** se busca una sección concreta de `FINDINGS.md`
- **THEN** la tabla de secciones indica su línea y el fragmento se puede leer sin cargar el
  fichero entero

### Requirement: Divulgación progresiva nativa del método
El método de carga selectiva SHALL estar disponible como skill del agente, de modo que su
descripción indique cuándo activarlo y su cuerpo se cargue solo cuando la tarea encaja. La skill
SHALL apuntar al índice y a la receta, sin duplicar su contenido.

#### Scenario: Tarea de documentación
- **WHEN** se pide "qué leer" o "documentar esto" en este repositorio
- **THEN** la skill del método está disponible y lleva al índice y a la receta de la tarea

#### Scenario: Skill sin contenido duplicado
- **WHEN** se compara el cuerpo de la skill con `docs/METODOLOGIA.md`
- **THEN** la skill solo contiene el disparador y los punteros: ninguna regla está duplicada

### Requirement: El método se mide, no se supone
El repositorio SHALL ofrecer una forma de **medir** el coste de la carga documental (tokens de
la raíz frente a tokens de la receta) para que las mejoras se puedan comprobar en lugar de
suponerse.

#### Scenario: Medición del coste
- **WHEN** se mide la carga siguiendo la receta frente a abrir los cuatro documentos de la raíz
- **THEN** el ahorro resultante es un número reproducible, con el mismo criterio de tokens en
  los dos lados

### Requirement: Un dato, un sitio
Cada hecho SHALL vivir en un único documento: el estado en `STATUS.md`, los hechos medidos en
`FINDINGS.md`, las reglas de trabajo en `AGENTS.md`, el uso de la app en `README.md`, el método
en `docs/`. La documentación SHALL enlazar en lugar de copiar.

#### Scenario: Dato duplicado
- **WHEN** un mismo dato aparece en dos documentos con valores distintos
- **THEN** es un defecto a corregir: uno de los dos miente, y el índice dice cuál es el sitio
  bueno
