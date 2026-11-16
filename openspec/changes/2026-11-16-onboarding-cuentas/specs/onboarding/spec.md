# Delta de capacidad: `onboarding`

Capacidad nueva. Al cerrar el cambio `2026-11-16-onboarding-cuentas` este delta se fusiona en
`openspec/specs/onboarding/spec.md`.

## ADDED Requirements

### Requirement: Estado de conexión por cuenta

The system SHALL exponer, para cada cuenta configurada, uno de estos estados: `conectada`
(probada con éxito en esta sesión), `detectada` (hay credencial localizada pero no se ha probado),
`sin_conectar` (no hay credencial) o `error` (la credencial existe y el proveedor la rechazó, con
su motivo).

#### Scenario: Arranque sin ninguna credencial
- WHEN la app arranca y ninguna cuenta tiene credencial
- THEN cada fila muestra «Falta conectar» (no «sin credencial» a secas)
- AND la tarjeta ofrece la acción **Conectar**

#### Scenario: Credencial del sistema sin probar
- WHEN `resolve()` encuentra la sesión de Claude Code o la de Antigravity en el sistema
- THEN el estado es `detectada` con la fuente («sesión de Claude Code», «Administrador de
  credenciales») y no se presenta como `conectada` hasta que «Probar» tenga éxito

#### Scenario: Credencial rechazada
- WHEN «Probar» recibe un 401/403 del proveedor
- THEN el estado es `error` con el motivo en lenguaje llano
- AND la fila NO dice «Falta conectar» (la credencial existe; está mal o caducada)

### Requirement: Instrucciones sin enlaces externos

The system SHALL describir cómo conectar cada cuenta con 1-2 pasos en texto local, y SHALL NOT
abrir el navegador ni enlazar a páginas externas en el flujo de conexión.

#### Scenario: Sección Conexiones
- WHEN el usuario abre Configuración → Conexiones
- THEN cada cuenta muestra qué es, su estado y sus pasos
- AND ningún paso contiene una URL ni dispara `shell.openExternal`

#### Scenario: Clic en una fila
- WHEN el usuario pulsa la fila de una cuenta en la tarjeta o en el menú de la bandeja
- THEN se abre Configuración enfocada en esa cuenta
- AND no se abre ninguna web

### Requirement: Probar sin gastar cuota

The system SHALL validar una credencial con la acción **Probar**, que usa los mismos endpoints de
metadatos que el refresco y NUNCA una llamada de inferencia, de modo que no consume ventanas de
cuota de ningún proveedor.

#### Scenario: Probar una clave de Minimax
- WHEN el usuario pega una clave y pulsa Probar
- THEN en ≤5 s se muestra el resultado (cuota o motivo del fallo)
- AND no se ha enviado ninguna petición a un modelo

#### Scenario: Probar con el IDE de Antigravity cerrado
- WHEN la sesión de Antigravity existe y el IDE no está abierto
- THEN Probar responde con la cuota (la credencial se lee del almacén, no del proceso)

### Requirement: Recetas declaradas por proveedor

The system SHALL obtener las instrucciones de conexión de un campo `setup` declarado en el módulo
de cada proveedor, y SHALL rechazar en las pruebas un proveedor que no lo declare.

#### Scenario: Proveedor nuevo
- WHEN se añade un proveedor al catálogo
- THEN su `setup` aparece en Configuración → Conexiones sin tocar la UI
- AND `test-providers` falla si `setup` no tiene `action` o `steps`

### Requirement: Progreso y descarte persistente

The system SHALL mostrar el progreso («n de N conectadas») mientras quede alguna cuenta sin
conectar, y SHALL recordar el descarte para no volver a mostrarlo.

#### Scenario: Primera ejecución
- WHEN no hay ninguna cuenta conectada
- THEN la tarjeta muestra «Conectar cuentas · 0 de 4»

#### Scenario: Descarte
- WHEN el usuario descarta el aviso
- THEN se guarda `onboarding.dismissedAt` en `config.json`
- AND no vuelve a aparecer tras reiniciar

### Requirement: Sin modales ni tours bloqueantes

The system SHALL NOT abrir diálogos automáticos al arrancar ni bloquear la interacción con un tour;
si en el futuro se añade un micro-tour, SHALL ser contextual, de 2-3 pasos y descartable.

#### Scenario: Arranque normal
- WHEN la app arranca con cuentas sin conectar
- THEN no se abre ninguna ventana emergente
- AND el aviso de conexión espera en la tarjeta y en Configuración

### Requirement: Estado fiable y redacción llana

The system SHALL etiquetar los estados en lenguaje llano y SHALL NOT presentar un fallo de
autenticación como falta de credencial, ni al revés.

#### Scenario: Proveedor sin credencial posible
- WHEN una cuenta requiere una sesión creada por otra app (p. ej. Antigravity) y esa sesión no
  existe
- THEN la explicación dice que hace falta iniciar sesión en esa app una vez
- AND se ofrece quitar la cuenta para no dejar una fila muerta
