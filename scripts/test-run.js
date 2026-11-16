'use strict';

// Pruebas de la logica de scripts/run.js (watchdog y respaldo de GPU).
//
// No se puede ejecutar run.js directamente porque lanzaria Electron.
// En su lugar se prueba la logica extraida: el orden de las comprobaciones
// y cuando se relanza vs cuando se sale.

const t = require('./test-lib');

// Simulamos la logica del manejador de exit de run.js, tal como esta AHORA
// (despues del fix). La prueba fija el comportamiento esperado.
//
// Parametros:
//   code: codigo de salida (number o null si mato una señal)
//   signal: 'SIGTERM' etc., o null
//   ONE_SHOT: true si es --preview/--settings/--probe
//   gpuFallbackUsed: true si ya se uso el respaldo de GPU
//
// Devuelve: { action, ... } donde action es:
//   'gpu-fallback' - relanzar sin GPU
//   'exit-clean'   - salir con 0 (cierre normal)
//   'exit-error'   - salir con el codigo de error
//   'restart'      - relanzar (watchdog, solo app de larga vida)
function simulateExitHandler({ code, signal, ONE_SHOT, gpuFallbackUsed }) {
  const GPU_FATAL_CODE = 2147483651; // 0x80000003
  const killedBySignal = code === null;
  const exitCode = killedBySignal ? 128 + 15 : code; // simplificado: SIGTERM=15

  // PRIMERO se comprueba si toca respaldo de GPU (el fix)
  if (exitCode === GPU_FATAL_CODE && !gpuFallbackUsed) {
    return { action: 'gpu-fallback', exitCode };
  }

  // DESPUES se comprueba si es one-shot o cierre limpio
  if (code === 0 || ONE_SHOT) {
    if (code === 0) {
      return { action: 'exit-clean', exitCode: 0 };
    }
    return { action: 'exit-error', exitCode };
  }

  // Si no, relanzamiento normal (watchdog)
  return { action: 'restart', exitCode };
}

// Simulamos el orden INCORRECTO (antes del fix) para verificar que el bug existia
function simulateExitHandlerBuggy({ code, signal, ONE_SHOT, gpuFallbackUsed }) {
  const GPU_FATAL_CODE = 2147483651;
  const killedBySignal = code === null;
  const exitCode = killedBySignal ? 128 + 15 : code;

  // BUG: comprobaba ONE_SHOT ANTES del respaldo de GPU
  if (code === 0 || ONE_SHOT) {
    if (code === 0) {
      return { action: 'exit-clean', exitCode: 0 };
    }
    return { action: 'exit-error', exitCode };
  }

  // El respaldo de GPU nunca se alcanzaba en modos one-shot
  if (exitCode === GPU_FATAL_CODE && !gpuFallbackUsed) {
    return { action: 'gpu-fallback', exitCode };
  }

  return { action: 'restart', exitCode };
}

t.section('run.js (respaldo de GPU):');

t.check('app de larga vida: GPU fatal -> gpu-fallback', () => {
  const result = simulateExitHandler({
    code: 2147483651,
    signal: null,
    ONE_SHOT: false,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(result.action, 'gpu-fallback');
});

t.check('app de larga vida: GPU fatal ya usado -> restart', () => {
  const result = simulateExitHandler({
    code: 2147483651,
    signal: null,
    ONE_SHOT: false,
    gpuFallbackUsed: true, // ya se uso
  });
  t.assert.strictEqual(result.action, 'restart');
});

t.check('app de larga vida: cierre normal -> exit-clean', () => {
  const result = simulateExitHandler({
    code: 0,
    signal: null,
    ONE_SHOT: false,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(result.action, 'exit-clean');
});

t.check('app de larga vida: otro error -> restart', () => {
  const result = simulateExitHandler({
    code: 1,
    signal: null,
    ONE_SHOT: false,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(result.action, 'restart');
});

t.section('run.js (modos one-shot, el fix):');

t.check('one-shot: GPU fatal -> gpu-fallback (FIX)', () => {
  // Este es el caso que fallaba antes del fix
  const result = simulateExitHandler({
    code: 2147483651,
    signal: null,
    ONE_SHOT: true,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(result.action, 'gpu-fallback');
});

t.check('one-shot: GPU fatal ya usado -> exit-error', () => {
  // Ya se probo sin GPU, ahora sale con error
  const result = simulateExitHandler({
    code: 2147483651,
    signal: null,
    ONE_SHOT: true,
    gpuFallbackUsed: true,
  });
  t.assert.strictEqual(result.action, 'exit-error');
});

t.check('one-shot: otro error -> exit-error (no reintenta)', () => {
  const result = simulateExitHandler({
    code: 1,
    signal: null,
    ONE_SHOT: true,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(result.action, 'exit-error');
});

t.check('one-shot: cierre normal -> exit-clean', () => {
  const result = simulateExitHandler({
    code: 0,
    signal: null,
    ONE_SHOT: true,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(result.action, 'exit-clean');
});

t.section('run.js (regresion - el bug que el fix arregla):');

t.check('BUG: one-shot con GPU fatal salia sin probar respaldo', () => {
  // El codigo INCORRECTO (antes del fix) no llegaba a gpu-fallback
  const buggy = simulateExitHandlerBuggy({
    code: 2147483651,
    signal: null,
    ONE_SHOT: true,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(buggy.action, 'exit-error', 'el bug salia con error');

  // El codigo CORRECTO (despues del fix) si llega
  const fixed = simulateExitHandler({
    code: 2147483651,
    signal: null,
    ONE_SHOT: true,
    gpuFallbackUsed: false,
  });
  t.assert.strictEqual(fixed.action, 'gpu-fallback', 'el fix relanza sin GPU');
});

t.finish('OK: run.js');
