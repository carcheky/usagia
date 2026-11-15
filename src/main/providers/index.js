'use strict';

// Registro de proveedores. Para añadir uno nuevo basta con crear un módulo
// en esta carpeta que exporte { id, label, color, resolve, fetchUsage }.

const minimax = require('./minimax');
const claude = require('./claude');
const antigravity = require('./antigravity');
const deepseek = require('./deepseek');

const providers = [minimax, claude, antigravity, deepseek];

function byId(id) {
  return providers.find((p) => p.id === id) || null;
}

module.exports = { providers, byId };
