import globals from 'globals';
import { FlatCompat } from '@eslint/eslintrc';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsEslintParser from '@typescript-eslint/parser';
import eslintPluginTsdoc from 'eslint-plugin-tsdoc';
import js from '@eslint/js';

const compat = new FlatCompat();

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  { ignores: ['node_modules', 'dist', 'eslint.config.js'] },
  js.configs.recommended,
  ...compat.extends('plugin:@typescript-eslint/eslint-recommended'),
  ...compat.extends('plugin:@typescript-eslint/recommended'),
  {
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
      parser: tsEslintParser,
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
      'eslint-plugin-tsdoc': eslintPluginTsdoc,
    },
    rules: {
      'eslint-plugin-tsdoc/syntax': 'error',
    },
  },
];
