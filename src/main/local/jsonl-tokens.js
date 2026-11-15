'use strict';

// Agregador de consumo leído de transcripciones locales en JSONL.
// Se usa como fuente secundaria cuando un proveedor no expone cuota por API
// (por ejemplo, Claude Code con suscripción: no hay endpoint público de cuota
// para la sesión de login, pero sí queda rastro local de los tokens gastados).

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_FILES = 400;

function listJsonl(dir, out = [], depth = 0) {
  if (depth > 6 || out.length >= MAX_FILES) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJsonl(full, out, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
      if (out.length >= MAX_FILES) return out;
    }
  }
  return out;
}

function pickUsage(obj) {
  const usage = obj?.message?.usage || obj?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const cacheRead = Number(usage.cache_read_input_tokens || 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens || 0);
  if (input + output + cacheRead + cacheWrite === 0) return null;
  return { input, output, cacheRead, cacheWrite };
}

/**
 * Suma los tokens de las transcripciones en una ventana temporal.
 * @param {string} rootDir carpeta raíz de proyectos
 * @param {number} sinceMs inicio de la ventana (epoch ms)
 */
function aggregate(rootDir, sinceMs) {
  const files = listJsonl(rootDir);
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let requests = 0;

  for (const file of files) {
    let content;
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < sinceMs) continue;
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      if (!line || line.length < 2) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = Date.parse(obj?.timestamp || obj?.ts || '');
      if (Number.isFinite(ts) && ts < sinceMs) continue;
      const usage = pickUsage(obj);
      if (!usage) continue;
      input += usage.input;
      output += usage.output;
      cacheRead += usage.cacheRead;
      cacheWrite += usage.cacheWrite;
      requests += 1;
    }
  }

  return { input, output, cacheRead, cacheWrite, requests, files: files.length };
}

function claudeProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

module.exports = { aggregate, claudeProjectsDir };
