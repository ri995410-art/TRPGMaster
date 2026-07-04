const js = require('@eslint/js');
const ts = require('typescript-eslint');

module.exports = ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/',
      '**/dist/**',
      '**/node_modules/**',
      '**/__tests__/**',
    ],
  },
);
