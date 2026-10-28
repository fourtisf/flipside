/** Shared lint rules for every TypeScript workspace. apps/web extends next/core-web-vitals on top. */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { es2022: true, node: true },
  ignorePatterns: ['node_modules', 'dist', '.next', '.turbo', 'coverage', 'target', 'prototype.html'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    // Money is bigint lamports. Number() on a lamport value silently loses precision above 2^53.
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.name='parseFloat'][arguments.0.name=/[Ll]amports?$/]",
        message: 'Lamport amounts are bigint. Use parseSol / lamports helpers from @flipside/core.',
      },
    ],
  },
};
