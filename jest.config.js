/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testMatch: ['<rootDir>/src/__tests__/**/*.{test,spec}.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|react-native|@react-native|expo|@expo|expo-.*|@react-navigation|zustand|i18next|react-i18next)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/__tests__/**',
    '!src/**/*.d.ts',
  ],
};
