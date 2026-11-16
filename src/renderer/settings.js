'use strict';

// Ventana de configuración: una fila por cuenta. Se admiten varias cuentas
// del mismo proveedor; cada una tiene su nombre, su credencial y su interruptor.

const accountsEl = document.getElementById('accounts');
const emptyEl = document.getElementById('empty');
const statusEl = document.getElementById('status');
const refreshEl = document.getElementById('refresh');
const hoverDelayEl = document.getElementById('hoverDelay');
const showOnHoverEl = document.getElementById('showOnHover');
const debugEl = document.getElementById('debug');
const updateCheckEl = document.getElementById('updateCheck');
const updateAutoDownloadEl = document.getElementById('updateAutoDownload');
const updateInstallOnQuitEl = document.getElementById('updateInstallOnQuit');
const updateChannelEl = document.getElementById('updateChannel');
const checkNowEl = document.getElementById('checkNow');
const applyUpdateEl = document.getElementById('applyUpdate');
const versionInfoEl = document.getElementById('versionInfo');

const state = {
  catalog: [],
  accounts: [],
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function providerMeta(id) {
  return state.catalog.find((c) => c.id === id) || null;
}

function setStatus(text, kind = '') {
  statusEl.textContent = text || '';
  statusEl.className = `status ${kind}`.trim();
}

/* --------------------------------------------------------------- cuentas */

function buildAccount(account) {
  const row = el('div', 'account');
  row.dataset.id = account.id || '';

  const top = el('div', 'acc-top');

  const swatch = el('span', 'swatch');
  top.appendChild(swatch);

  const select = el('select');
  select.className = 'prov';
  for (const meta of state.catalog) {
    const option = el('option', '', meta.label);
    option.value = meta.id;
    select.appendChild(option);
  }
  select.value = account.provider;
  top.appendChild(select);

  const name = el('input', 'name');
  name.type = 'text';
  name.placeholder = 'Nombre de la cuenta';
  name.value = account.label || '';
  top.appendChild(name);

  const toggle = el('label', 'check');
  const enabled = el('input');
  enabled.type = 'checkbox';
  enabled.className = 'enabled';
  enabled.checked = account.enabled !== false;
  toggle.appendChild(enabled);
  toggle.appendChild(el('span', '', 'Activa'));
  top.appendChild(toggle);

  const del = el('button', 'icon del');
  del.type = 'button';
  del.title = 'Eliminar esta cuenta';
  del.textContent = '✕';
  top.appendChild(del);

  row.appendChild(top);

  const bottom = el('div', 'acc-bottom');
  const cred = el('input', 'cred');
  cred.type = 'password';
  cred.autocomplete = 'off';
  cred.spellcheck = false;
  cred.value = account.credentials?.apiKey || '';
  bottom.appendChild(cred);

  const show = el('button', 'btn tiny');
  show.type = 'button';
  show.textContent = 'Ver';
  bottom.appendChild(show);

  const test = el('button', 'btn tiny');
  test.type = 'button';
  test.textContent = 'Probar';
  bottom.appendChild(test);

  row.appendChild(bottom);

  const hint = el('p', 'acc-hint');
  row.appendChild(hint);

  const note = el('p', 'acc-note');
  row.appendChild(note);

  const data = {
    id: account.id || `new-${Math.random().toString(36).slice(2, 9)}`,
    provider: account.provider,
    label: account.label || '',
    enabled: account.enabled !== false,
    credentials: { apiKey: account.credentials?.apiKey || '' },
  };

  function applyMeta() {
    const meta = providerMeta(data.provider);
    if (!meta) return;
    swatch.style.background = meta.color;
    cred.placeholder = meta.credential.placeholder || '';
    cred.title = meta.credential.hint || '';
    hint.textContent = meta.credential.hint || '';
    select.value = data.provider;
  }

  select.addEventListener('change', () => {
    const previous = providerMeta(data.provider);
    const next = providerMeta(select.value);
    const autoNamed = !data.label || (previous && data.label === previous.label);
    data.provider = select.value;
    if (autoNamed && next) data.label = next.label;
    if (autoNamed) name.value = data.label;
    applyMeta();
    note.textContent = '';
    note.className = 'acc-note';
  });

  name.addEventListener('input', () => {
    data.label = name.value;
  });

  enabled.addEventListener('change', () => {
    data.enabled = enabled.checked;
    // OJO: `enabled` es el <input>, siempre truthy; lo que vale es .checked.
    row.classList.toggle('disabled', !enabled.checked);
  });

  cred.addEventListener('input', () => {
    data.credentials.apiKey = cred.value;
  });

  show.addEventListener('click', () => {
    const visible = cred.type === 'text';
    cred.type = visible ? 'password' : 'text';
    show.textContent = visible ? 'Ver' : 'Ocultar';
  });

  test.addEventListener('click', async () => {
    test.disabled = true;
    test.textContent = 'Probando…';
    note.className = 'acc-note';
    note.textContent = '';
    try {
      const result = await window.usagiaSettings.test({
        provider: data.provider,
        label: data.label,
        credentials: data.credentials,
      });
      if (result.status === 'ok') {
        note.className = 'acc-note ok';
        note.textContent = `${result.summary || 'sin datos'}${result.note ? ` · ${result.note}` : ''}`;
      } else if (result.status === 'warning') {
        // Hay datos, pero no la CUOTA (por ejemplo, Claude cae a las
        // transcripciones locales). No es un error: se avisa en amarillo.
        note.className = 'acc-note warning';
        note.textContent = `${result.summary || 'cuota no disponible'}${result.note ? ` · ${result.note}` : ''}`;
      } else if (result.status === 'unconfigured') {
        note.className = 'acc-note warning';
        // La nota explica POR QUE no hay cuota (p.ej. el 429 del endpoint de
        // Claude): sin ella, "sin credencial" miente.
        note.textContent = result.note
          ? `Sin cuota disponible. ${result.note}`
          : 'No se ha encontrado ninguna credencial para esta cuenta.';
      } else {
        note.className = 'acc-note error';
        const detalle = [result.error || 'error al consultar', result.note].filter(Boolean).join(' · ');
        note.textContent = detalle;
      }
    } catch (err) {
      note.className = 'acc-note error';
      note.textContent = err?.message || String(err);
    } finally {
      test.disabled = false;
      test.textContent = 'Probar';
    }
  });

  del.addEventListener('click', () => {
    const index = state.accounts.findIndex((a) => a.id === data.id);
    if (index >= 0) state.accounts.splice(index, 1);
    row.remove();
    updateEmpty();
  });

  row.classList.toggle('disabled', !data.enabled);
  applyMeta();

  row._data = data;
  return row;
}

function updateEmpty() {
  emptyEl.hidden = state.accounts.length > 0;
}

function render() {
  accountsEl.textContent = '';
  for (const account of state.accounts) {
    accountsEl.appendChild(buildAccount(account));
  }
  updateEmpty();
}

/* ------------------------------------------------------------- acciones */

function collect() {
  const accounts = [];
  for (const row of accountsEl.querySelectorAll('.account')) {
    const data = row._data;
    accounts.push({
      id: data.id,
      provider: data.provider,
      label: data.label,
      enabled: data.enabled,
      credentials: { apiKey: data.credentials.apiKey },
    });
  }
  return accounts;
}

document.getElementById('add').addEventListener('click', () => {
  const first = state.catalog[0];
  if (!first) return;
  const account = {
    id: `new-${Math.random().toString(36).slice(2, 9)}`,
    provider: first.id,
    label: '',
    enabled: true,
    credentials: { apiKey: '' },
  };
  state.accounts.push(account);
  const row = buildAccount(account);
  accountsEl.appendChild(row);
  updateEmpty();
  row.querySelector('.name').focus();
});

document.getElementById('save').addEventListener('click', async () => {
  setStatus('Guardando…');
  try {
    const result = await window.usagiaSettings.save({
      accounts: collect(),
      general: {
        refreshSeconds: Number(refreshEl.value),
        hoverCloseDelayMs: Number(hoverDelayEl.value),
        showOnHover: showOnHoverEl.checked,
        debug: debugEl.checked,
        updateCheck: updateCheckEl.checked,
        updateAutoDownload: updateAutoDownloadEl.checked,
        updateInstallOnQuit: updateInstallOnQuitEl.checked,
        updateChannel: updateChannelEl.value,
      },
    });
    if (!result.ok) {
      // Se deja el formulario tal cual: el usuario puede reintentar.
      setStatus(result.error || 'no se pudo guardar', 'error');
      return;
    }
    state.accounts = result.accounts || [];
    render();
    setStatus('Guardado', 'ok');
    setTimeout(() => setStatus(''), 2500);
  } catch (err) {
    setStatus(err?.message || String(err), 'error');
  }
});

document.getElementById('cancel').addEventListener('click', () => window.usagiaSettings.close());

document.getElementById('reveal').addEventListener('click', async () => {
  try {
    await window.usagiaSettings.reveal();
  } catch (err) {
    setStatus(err?.message || String(err), 'error');
  }
});

checkNowEl?.addEventListener('click', async () => {
  checkNowEl.disabled = true;
  checkNowEl.textContent = 'Buscando…';
  try {
    const result = await window.usagiaSettings.checkUpdates();
    if (result.available && result.latest) {
      setStatus(`¡Nueva versión ${result.latest.version} disponible!`, 'ok');
    } else if (result.error) {
      setStatus(`Error: ${result.error}`, 'error');
    } else {
      setStatus('Ya tienes la última versión', 'ok');
    }
    setTimeout(() => setStatus(''), 4000);
  } catch (err) {
    setStatus(err?.message || String(err), 'error');
  } finally {
    checkNowEl.disabled = false;
    checkNowEl.textContent = 'Buscar ahora';
  }
});

applyUpdateEl?.addEventListener('click', async () => {
  applyUpdateEl.disabled = true;
  applyUpdateEl.textContent = 'Instalando…';
  try {
    const result = await window.usagiaSettings.applyUpdate();
    if (!result.ok) {
      setStatus('No hay ninguna actualización lista: pulsa "Buscar ahora"', 'error');
      applyUpdateEl.disabled = false;
      applyUpdateEl.textContent = 'Instalar ahora y reiniciar';
    }
    // Si sale bien, la app se cierra sola y el instalador la vuelve a abrir.
  } catch (err) {
    setStatus(err?.message || String(err), 'error');
    applyUpdateEl.disabled = false;
    applyUpdateEl.textContent = 'Instalar ahora y reiniciar';
  }
});

async function init() {
  try {
    const data = await window.usagiaSettings.get();
    state.catalog = data.catalog || [];
    state.accounts = (data.accounts || []).map((a) => ({
      ...a,
      credentials: { apiKey: a.credentials?.apiKey || '' },
    }));
    const general = data.general || {};
    refreshEl.value = general.refreshSeconds ?? 120;
    hoverDelayEl.value = general.hoverCloseDelayMs ?? 400;
    showOnHoverEl.checked = general.showOnHover !== false;
    debugEl.checked = general.debug === true;
    updateCheckEl.checked = general.updateCheck !== false;
    updateAutoDownloadEl.checked = general.updateAutoDownload !== false;
    updateInstallOnQuitEl.checked = general.updateInstallOnQuit !== false;
    updateChannelEl.value = general.updateChannel || 'auto';
    if (versionInfoEl) {
      const auto = data.autoUpdate;
      const motivo = auto && !auto.ok ? ` · ${auto.reason}` : '';
      const version = data.currentVersion || '—';
      versionInfoEl.textContent = auto && auto.ok
        ? `Versión actual: ${version} · se actualiza sola`
        : `Versión actual: ${version} · este binario no se actualiza solo${motivo}`;
    }
    // Sin auto-actualización, el botón de instalar no tiene nada que hacer.
    if (applyUpdateEl && !(data.autoUpdate && data.autoUpdate.ok)) {
      applyUpdateEl.disabled = true;
      applyUpdateEl.title = 'Este binario no se puede actualizar solo (portable, .deb o desarrollo)';
    }
    render();
  } catch (err) {
    setStatus(`No se pudo cargar la configuración: ${err?.message || err}`, 'error');
  }
}

init();
