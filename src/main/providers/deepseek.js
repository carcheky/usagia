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

const { fetchJson } = require('../http');
const creds = require('../credentials');

const PLATFORM = 'https://platform.deepseek.com';
const BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance';

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

  const wallet = (data.normal_wallets || []).find((w) => w.currency === 'USD') || data.normal_wallets?.[0];
  if (wallet) {
    const value = money(wallet.balance, wallet.currency);
    if (value) metrics.push({ label: 'saldo', value, pct: null, tone: 'neutral' });
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
  }

  // Gasto acumulado historico (ultimo, para no saturar la tarjeta).
  for (const costRow of data.total_costs || []) {
    const value = money(costRow.amount, costRow.currency);
    if (value && Number(costRow.amount) > 0) {
      metrics.push({ label: `gasto ${costRow.currency}`, value, pct: null, tone: 'neutral' });
    }
  }

  return {
    status: 'ok',
    summary: metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
    metrics,
    note: notes.join(' · '),
    source: credential.source,
  };
}

function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(n);
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
};
