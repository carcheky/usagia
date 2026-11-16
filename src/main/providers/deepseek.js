'use strict';

// DeepSeek — saldo y gasto de la cuenta prepagada (la que se consume a precios
// de pay-as-you-go y no se recarga).
//
// Dos formas de autenticarse:
//  1) API key "sk-..." -> GET https://api.deepseek.com/user/balance
//  2) Sesion de la plataforma (grant OAuth del harness DSH) -> API privada de
//     platform.deepseek.com con la cabecera "x-dsh-auth-token":
//       /api/v0/users/get_user_summary  -> saldos y gasto acumulado
//       /api/v0/usage/amount?month&year  -> tokens del mes por modelo
//       /api/v0/usage/cost?month&year    -> coste del mes

const { fetchJson, tone, formatTokens } = require('../http');
const creds = require('../credentials');

const PLATFORM = 'https://platform.deepseek.com';
const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance';

// Umbrales de la BARRA DE SALDO: cuanto saldo queda, en fraccion.
// El saldo no se repone solo: es dinero prepaid que hay que recargar a
// mano, asi que agotarse es un problema REAL (no un contratiempo como la
// ventana de 5 h de una cuota por tiempo).
const BALANCE_THRESHOLDS = { critical: 0.1, warning: 0.3 };

async function resolve(ctx) {
  const manual = creds.firstValid([
    creds.fromUserConfig(ctx.config, 'deepseek', 'apiKey', ctx.instance),
    creds.fromEnv('deepseek'),
  ]);
  if (manual) return { ...manual, kind: 'apiKey' };

  const session = creds.fromDsh('deepseek');
  if (session) return { ...session, kind: 'session' };
  return null;
}

function money(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${n.toFixed(2)}`;
}

/** GET privado de la plataforma con el token de sesion. */
async function platformGet(credential, route) {
  const res = await fetchJson(`${PLATFORM}${route}`, {
    headers: {
      'x-dsh-auth-token': credential.value,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { error: res.error };
  if (res.data?.code) return { error: res.data.msg || `code ${res.data.code}` };
  const biz = res.data?.data;
  if (biz?.biz_code) return { error: biz.biz_msg || `code ${biz.biz_code}` };
  return { data: biz?.biz_data ?? res.data };
}

function sumUsage(rows, type) {
  let total = 0;
  for (const row of rows || []) {
    for (const item of row.usage || []) {
      if (item.type === type) total += Number(item.amount || 0);
    }
  }
  return total;
}

/** Suma todos los tipos de token (excepto el conteo de peticiones). */
function sumTokens(rows) {
  let total = 0;
  for (const row of rows || []) {
    for (const item of row.usage || []) {
      if (item.type === 'REQUEST') continue;
      total += Number(item.amount || 0);
    }
  }
  return total;
}

/** Suma el coste (en USD) de todos los tipos de una fila de modelo. */
function sumCost(row) {
  let total = 0;
  for (const item of row?.usage || []) {
    total += Number(item.amount || 0);
  }
  return total;
}

async function fetchUsage(ctx) {
  const credential = await resolve(ctx);
  if (!credential) {
    return { status: 'unconfigured', summary: 'sin credencial', metrics: [] };
  }

  if (credential.kind === 'apiKey') {
    const res = await fetchJson(BALANCE_ENDPOINT, {
      headers: { Authorization: `Bearer ${credential.value}` },
    });
    if (!res.ok) {
      return { status: 'error', summary: 'error', metrics: [], error: res.error };
    }
    const info = res.data?.balance_infos?.[0];
    if (!info) {
      return { status: 'error', summary: 'sin datos', metrics: [], error: 'respuesta vacía' };
    }
    const currency = info.currency || 'USD';
    const metrics = [];
    const total = money(info.total_balance, currency);
    const topped = money(info.topped_up_balance, currency);
    const granted = money(info.granted_balance, currency);
    if (total) metrics.push({ label: 'saldo', value: total, pct: null, tone: 'neutral' });
    if (topped) metrics.push({ label: 'recargado', value: topped, pct: null, tone: 'neutral' });
    if (granted) metrics.push({ label: 'cortesía', value: granted, pct: null, tone: 'neutral' });
    return {
      status: 'ok',
      summary: metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
      metrics,
      note: res.data?.is_available === false ? 'saldo agotado' : '',
      source: credential.source,
    };
  }

  // Sesion de la plataforma.
  const summary = await platformGet(credential, '/api/v0/users/get_user_summary');
  if (summary.error || !summary.data) {
    return { status: 'error', summary: 'error', metrics: [], error: summary.error || 'sin datos' };
  }

  const data = summary.data;
  const metrics = [];
  const notes = [];

  // ---------------------------------------------------------------------
  // DeepSeek NO es una cuota por ventanas de tiempo: es una cuenta con
  // SALDO PREPAGADO. El API no tiene ventanas (ni "5 h" ni "semanal"):
  // tiene `normal_wallets` (saldo), `bonus_wallets` y `total_costs`.
  //
  // Por eso no se inventa un "% de cuota": no hay denominador. Lo que si
  // tiene sentido es:
  //
  //   1. El SALDO: una barra que se vacia conforme se gasta. El color va
  //      por lo que QUEDA, y es mas severo que el de una cuota por tiempo,
  //      porque el saldo no se repone solo (hay que recargar).
  //   2. La AUTONOMIA: cuantos dias aguanta el saldo al ritmo actual. Es
  //      el equivalente de la "ventana" de los demas proveedores, y se
  //      puede comparar de un vistazo con las ventanas de los otros.
  // ---------------------------------------------------------------------

  const wallet = (data.normal_wallets || []).find((w) => w.currency === 'USD') || data.normal_wallets?.[0];
  const balance = wallet ? Number(wallet.balance) : null;
  if (wallet) {
    const value = money(wallet.balance, wallet.currency);
    if (value) {
      // El saldo NO lleva barra con "pct": la fraccion que queda respecto a
      // que no es comparable con las de los demas (su 100 % es el tope de
      // cuota, aqui el saldo es el que hay). La barra se calcula con el
      // gasto acumulado: cuanto de lo que has gastado es este saldo.
      metrics.push({
        label: 'saldo',
        value,
        short: value,
        remaining: null,
        pct: null,
        tone: 'neutral',
        kind: 'balance',
        balance,
      });
    }
  }

  for (const bonus of data.bonus_wallets || []) {
    const value = money(bonus.balance, bonus.currency);
    if (value && Number(bonus.balance) > 0) {
      metrics.push({ label: `bonus ${bonus.currency}`, value, pct: null, tone: 'neutral' });
    }
  }

  // Consumo del mes en curso.
  const now = new Date();
  const query = `?month=${now.getMonth() + 1}&year=${now.getFullYear()}`;
  const amount = await platformGet(credential, `/api/v0/usage/amount${query}`);
  const cost = await platformGet(credential, `/api/v0/usage/cost${query}`);

  if (amount.data) {
    const rows = amount.data.total || [];
    const totalTokens = sumTokens(rows);
    if (totalTokens > 0) {
      metrics.push({
        label: `tokens ${now.getMonth() + 1}/${now.getFullYear()}`,
        value: formatTokens(totalTokens),
        pct: null,
        tone: 'neutral',
      });
    }
    const requests = sumUsage(rows, 'REQUEST');
    if (requests > 0) {
      metrics.push({ label: 'peticiones mes', value: String(requests), pct: null, tone: 'neutral' });
    }
  }

  if (cost.data) {
    const rows = Array.isArray(cost.data) ? cost.data[0]?.total || [] : cost.data.total || [];
    for (const row of rows) {
      const value = sumCost(row);
      if (value > 0.0001) {
        notes.push(`${row.model || 'coste'} ${value.toFixed(2)} USD este mes`);
      }
    }

    // Ritmo de gasto y AUTONOMIA: cuantos dias aguanta el saldo.
    //
    // El desglose por dias viene en `days`, con lo gastado cada dia. El
    // ritmo se calcula sobre los dias que HAN TRANSCURRIDO del mes (no
    // solo los que tienen gasto: un dia sin uso tambien consume saldo en
    // el sentido de que el calendario corre igual). Con el mes a medias,
    // esto da el ritmo real y no el del mes entero.
    const days = Array.isArray(cost.data) ? cost.data[0]?.days || [] : cost.data.days || [];
    const runway = runwayFrom(days, balance);
    if (runway) {
      metrics.push({
        label: 'aguanta',
        value: formatRunway(runway.days),
        short: formatRunway(runway.days),
        remaining: null,
        pct: null,
        tone: 'neutral',
        kind: 'runway',
        // Para el icono: los dias que quedan se comparan con los de una
        // ventana de cuota (la 5 h son 0,2 dias, la mensual 30).
        runwayDays: runway.days,
        window: runwayWindow(runway.days),
      });
      notes.push(`ritmo ${runway.perDay.toFixed(3)} USD/día`);
    }
  }

  // Gasto acumulado historico (ultimo, para no saturar la tarjeta).
  let totalSpent = 0;
  for (const costRow of data.total_costs || []) {
    const value = money(costRow.amount, costRow.currency);
    if (value && Number(costRow.amount) > 0) {
      totalSpent += Number(costRow.amount);
      metrics.push({ label: `gasto ${costRow.currency}`, value, pct: null, tone: 'neutral' });
    }
  }

  // La barra del SALDO, ya con su estado: cuanto de lo que se zoo en total
  // sigue en la cuenta, y de que color es (se agota en serio: no se repone
  // solo).
  const balanceMetric = metrics.find((m) => m.kind === 'balance');
  if (balanceMetric) {
    const state = balanceState(balance, totalSpent);
    balanceMetric.pct = state.pct;
    balanceMetric.tone = state.tone;
  }

  // La AUTONOMIA es la "ventana" de DeepSeek para la disponibilidad global:
  // sin ella, el saldo no entraria en la cuenta y el proveedor no pesaria.
  const runwayMetric = metrics.find((m) => m.kind === 'runway');
  if (runwayMetric) {
    runwayMetric.window = runwayWindow(runwayMetric.runwayDays);
  }

  // ORDEN: la tarjeta solo teach 4 metricas por proveedor, asi que las
  // importantes van primero: el saldo y la autonomia. Despues, el bonus, los
  // tokens y las peticiones. El gasto acumulado, al final (es historico y
  // no dice nada del estado actual).
  const ORDER = { balance: 0, runway: 1 };
  const priority = (m) => {
    if (m.kind && m.kind in ORDER) return ORDER[m.kind];
    if (m.label.startsWith('bonus')) return 2;
    if (m.label.startsWith('tokens')) return 3;
    if (m.label.startsWith('peticiones')) return 4;
    return 5;
  };
  metrics.sort((a, b) => priority(a) - priority(b));

  return {
    status: 'ok',
    summary: metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
    metrics,
    // La cabecera de la fila dice lo que importa: cuanto dinero hay y
    // cuanto aguanta. Las demas metricas (bonus, tokens, gasto) son
    // detalle.
    headline: runwayMetric
      ? `${balanceMetric ? balanceMetric.value : ''} · aguanta ${runwayMetric.value}`.trim()
      : balanceMetric
        ? balanceMetric.value
        : '',
    note: notes.join(' · '),
    source: credential.source,
  };
}

/** ¿Hubo gasto en este dia del desglose? */
function dayHasSpend(day) {
  for (const group of day?.data || []) {
    for (const item of group.usage || []) {
      if (item.type === 'REQUEST') continue;
      if (Number(item.amount || 0) > 0) return true;
    }
  }
  return false;
}

/**
 * ¿Este dia del desglose ya ha pasado (o es hoy)?
 *
 * El desglose del mes incluye el dia de hoy, que todavia no ha terminado:
 * contarlo entero como un dia mas inflaria el ritmo hacia abajo (y la
 * autonomia hacia arriba). El dia de hoy cuenta como medio.
 *
 * @param {object} day
 * @returns {number} 1 si el dia cuenta entero, 0,5 si es el de hoy, 0 si es futuro
 */
function dayIsPast(day) {
  const date = day?.date;
  if (!date) return 0;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  if (date === todayKey) return 0.5;
  return date < todayKey ? 1 : 0;
}

/**
 * Ritmo de gasto y autonomia a partir del desglose por dias.
 *
 * @param {Array<object>} days desglose del mes (`days` del endpoint de coste)
 * @param {number|null} balance saldo actual
 * @returns {{days: number, perDay: number}|null}
 */
function runwayFrom(days, balance) {
  if (!Array.isArray(days) || !days.length) return null;
  if (balance === null || !Number.isFinite(balance) || balance <= 0) return null;

  let spent = 0;
  for (const day of days) {
    for (const group of day?.data || []) {
      for (const item of group.usage || []) {
        if (item.type === 'REQUEST') continue;
        spent += Number(item.amount || 0);
      }
    }
  }
  if (spent <= 0.0001) return null;

  // El dia de hoy va a medias: todavia no ha terminado.
  const elapsed = days.reduce((sum, day) => sum + dayIsPast(day), 0);
  if (elapsed <= 0) return null;

  const perDay = spent / elapsed;
  if (!Number.isFinite(perDay) || perDay <= 0) return null;
  return { days: Math.floor(balance / perDay), perDay };
}

/** autonomy en dias -> texto legible ("358 dias" / "12 meses"). */
function formatRunway(days) {
  if (!Number.isFinite(days) || days <= 0) return '—';
  if (days >= 60) return `${Math.round(days / 30)} meses`;
  if (days >= 2) return `${Math.round(days)} días`;
  return `${Math.max(1, Math.round(days))} día`;
}

/**
 * Estado del SALDO: que parte del dinero queda, en comparacion con lo que
 * se ha gastado en total.
 *
 * La cuenta tiene un detalle: la recarga del saldo no se sabe cuando va a
 * pasar, asi que no se puede decir "queda X % de la cuota". Lo que si se
 * puede decir es cuanto dinero hay (que es el valor de la metrica) y, con
 * el ritmo de gasto, **cuanto tiempo aguanta** (que es su ventana).
 *
 * El `pct` que sale es la fraccion RESTANTE de la barra: saldo / (saldo +
 * gastado). Solo se usa para pintar la barra; no entra en la cuenta global
 * de ventanas, porque no es una ventana de tiempo.
 *
 * @param {number|null} balance saldo actual
 * @param {number} spent gastado (histórico o del mes)
 * @returns {{pct: number|null, tone: string}}
 */
function balanceState(balance, spent) {
  if (balance === null || !Number.isFinite(balance)) {
    return { pct: null, tone: 'neutral' };
  }
  if (balance <= 0) return { pct: 0, tone: 'critical' };

  // El total historico es el "punto de partida" contra el que se mide lo que
  // queda: saldo + gastado = lo que se zoo en total.
  const total = balance + spent;
  const pct = total > 0 ? balance / total : null;
  return {
    pct: pct === null ? null : Math.max(0, Math.min(1, pct)),
    tone: balanceTone(balance),
  };
}

/** Color del saldo segun lo que QUEDA (no se repone solo: hay que recargar). */
function balanceTone(balance) {
  if (!Number.isFinite(balance) || balance <= 0) return 'critical';
  // Sin un total con el que comparar, se usa el saldo absoluto: por debajo
  // de 5 USD es poco (una recarga de 10 lasts poco), por encima, sobra.
  if (balance < 5) return 'critical';
  if (balance < 15) return 'warning';
  return 'ok';
}

/**
 * Peso de la cuenta de DeepSeek en la disponibilidad global.
 *
 * El saldo no es una ventana de tiempo, asi que no se compara con la 5 h
 * ni con la mensual. Su equivalente es la AUTONOMIA: los dias que quedan.
 * Los umbrales son los de las ventanas de cuota, para que la cuenta global
 * siga siendo coherente:
 *
 * | Dias que quedan | Ventana |
 * |---|---|
 * | hasta 1 dia | `5h` (se repone en horas) |
 * | hasta 2 dias | `daily` |
 * | hasta 7 dias | `weekly` |
 * | mas de 7 dias | `monthly` |
 */
function runwayWindow(runwayDays) {
  if (!Number.isFinite(runwayDays) || runwayDays <= 0) return 'monthly';
  if (runwayDays <= 1) return '5h';
  if (runwayDays <= 2) return 'daily';
  if (runwayDays <= 7) return 'weekly';
  return 'monthly';
}

module.exports = {
  id: 'deepseek',
  label: 'DeepSeek',
  color: '#4d6bfe',
  url: 'https://platform.deepseek.com/usage',
  credential: {
    label: 'Clave API o token de sesión',
    placeholder: 'sk-…',
    hint: 'Clave sk- de la API, o el token x-dsh-auth-token de la plataforma. Vacío = sesión del harness.',
  },
  resolve,
  fetchUsage,
  // Expuestos para las pruebas (funciones puras).
  runwayFrom,
  formatRunway,
  balanceState,
  balanceTone,
  runwayWindow,
  dayIsPast,
};
