'use strict';

// Minimax — suscripción M Plan.
// Endpoint público del panel de cuota: devuelve el % restante de la ventana de
// 5 h y de la ventana semanal, por modelo.

const { fetchJson, pct100, used, tone, fmtDuration, sortMetrics } = require('../http');
const creds = require('../credentials');

const ENDPOINT = 'https://api.minimax.io/v1/token_plan/remains';

async function resolve(ctx) {
  return creds.firstValid([
    creds.fromUserConfig(ctx.config, 'minimax', 'apiKey', ctx.instance),
    creds.fromEnv('minimax'),
    creds.fromDsh('minimax'),
  ]);
}

async function fetchUsage(ctx) {
  const credential = await resolve(ctx);
  if (!credential) {
    return { status: 'unconfigured', summary: 'sin clave', metrics: [] };
  }

  const res = await fetchJson(ENDPOINT, {
    headers: { Authorization: `Bearer ${credential.value}` },
  });

  if (!res.ok) {
    return { status: 'error', summary: 'error', metrics: [], error: res.error };
  }

  const buckets = res.data?.model_remains || [];
  // El bucket "general" es el que agrupa el chat; el resto son multimodales.
  const bucket =
    buckets.find((b) => b.model_name === 'general') ||
    buckets.find((b) => Number(b.current_interval_status) === 1) ||
    buckets[0];

  if (!bucket) {
    return { status: 'error', summary: 'sin datos', metrics: [], error: 'respuesta vacía' };
  }

  // La API devuelve el porcentaje 0-100 de lo que QUEDA; el panel de Minimax
  // muestra lo USADO.
  const metrics = [];
  const addMetric = (label, remainingPercent, window) => {
    if (remainingPercent === null) return;
    const remaining = pct100(remainingPercent);
    if (remaining === null) return;
    const consumed = used(remaining);
    metrics.push({
      label,
      window,
      value: `${Math.round(consumed * 100)}% usado`,
      short: `${Math.round(consumed * 100)}%`,
      remaining: `queda ${Math.round(remaining * 100)}%`,
      pct: consumed,
      tone: tone(remaining),
    });
  };
  addMetric('ventana 5 h', bucket.current_interval_remaining_percent, '5h');
  addMetric('semanal', bucket.current_weekly_remaining_percent, 'weekly');

  const reset5h = fmtDuration(Number(bucket.remains_time));
  const resetWeek = fmtDuration(Number(bucket.weekly_remains_time));

  // El reinicio va en la propia metrica (junto a su barra), no en una nota
  // aparte: asi cada ventana dice la suya y la nota global no crece.
  // En Minimax es una DURACION ("en 3 h 12 min"), no una fecha.
  const fiveHour = metrics.find((m) => m.window === '5h');
  if (fiveHour && reset5h) fiveHour.reset = `en ${reset5h}`;
  const weekly = metrics.find((m) => m.window === 'weekly');
  if (weekly && resetWeek) weekly.reset = `en ${resetWeek}`;

  return {
    status: 'ok',
    summary: metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
    metrics: sortMetrics(metrics),
    note: '',
    source: credential.source,
  };
}

module.exports = {
  id: 'minimax',
  label: 'Minimax',
  color: '#ff6a3d',
  url: 'https://platform.minimaxi.com/',
  credential: {
    label: 'Clave API',
    placeholder: 'sk-cp-…',
    hint: 'Clave del plan M (empieza por sk-cp-). Si la dejas vacía se busca sola en el sistema.',
  },
  resolve,
  fetchUsage,
};
