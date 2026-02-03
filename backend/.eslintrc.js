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
    'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '!.eslintrc.js', 'scripts/', 'tests/'],
};
