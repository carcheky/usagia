'use strict';

// ESLint 9 "flat config": un solo archivo, sin extends heredados.
// Reglas mínimas que cazan bugs reales sin ser molestas.

module.exports = [
  {
    // Aplica a todo el JS del proyecto.
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        // Browser (renderer)
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
      },
    },
    rules: {
      // === Errores que rompen cosas ===
      'no-undef': 'error',                    // variable no definida
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',              // _event, _err están permitidos
        varsIgnorePattern: '^_',
      }],
      'no-dupe-keys': 'error',                // { a: 1, a: 2 }
      'no-dupe-args': 'error',                // function(a, a)
      'no-duplicate-case': 'error',           // switch con casos repetidos
      'no-unreachable': 'error',              // código después de return
      'no-constant-condition': 'error',       // if (true)
      'no-empty': ['error', { allowEmptyCatch: true }],
      'valid-typeof': 'error',                // typeof x === 'strng'

      // === Bugs sutiles ===
      'eqeqeq': ['error', 'always'],          // === en vez de ==
      'no-self-assign': 'error',              // x = x
      'no-self-compare': 'error',             // x === x
      'no-cond-assign': 'error',              // if (x = 1) en vez de if (x === 1)
      'no-unsafe-negation': 'error',          // !key in obj en vez de !(key in obj)
      'use-isnan': 'error',                   // x === NaN no funciona

      // === Estilo mínimo (sin ser molesto) ===
      'semi': ['error', 'always'],            // punto y coma obligatorio
      'quotes': ['error', 'single', { avoidEscape: true }],
      'no-trailing-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 2 }],
    },
  },
  {
    // Ignorar carpetas que no son nuestro código.
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'www/**',
      'android/**',
      '*.min.js',
    ],
  },
];
