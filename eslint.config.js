import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tsdoc from 'eslint-plugin-tsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['node_modules', 'dist', 'eslint.config.js'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2026,
      sourceType: 'module',
      globals: {
        ...globals.es2026,
        ...globals.node,
      },
    },
    plugins: {
      tsdoc: tsdoc,
    },
    rules: {
      'tsdoc/syntax': 'error',
    },
  }
);
