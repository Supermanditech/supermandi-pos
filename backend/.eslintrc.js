module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-var-requires': 'warn',
    '@typescript-eslint/ban-types': 'warn',
    '@typescript-eslint/no-namespace': 'warn',
    // REQ.AUDIT.W4.BACKEND.UNSTRUCTURED-CONSOLE-LOGGING.001:
    // Warn on all direct console.* calls — use src/lib/logger instead.
    // logger.ts is exempted via overrides (it IS the structured emit layer).
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
  },
  overrides: [
    {
      // logger.ts is the structured emit layer — it wraps console.* intentionally.
      files: ['src/lib/logger.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '!.eslintrc.js', 'scripts/', 'tests/'],
};
