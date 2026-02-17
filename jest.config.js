/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testMatch: ['<rootDir>/src/__tests__/**/*.{test,spec}.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|react-native|@react-native|expo|@expo|expo-.*|@react-navigation|zustand|i18next|react-i18next|react-native-qrcode-svg)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // T1: Mock expo/RN native modules for Jest
    '^expo-modules-core$': '<rootDir>/src/__tests__/__mocks__/expo-modules-core.js',
    '^expo-linear-gradient$': '<rootDir>/src/__tests__/__mocks__/expo-linear-gradient.js',
    '^react-native-reanimated$': '<rootDir>/src/__tests__/__mocks__/react-native-reanimated.js',
  },
  setupFiles: ['<rootDir>/src/__tests__/jest.setup.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/__tests__/**',
    '!src/**/*.d.ts',
  ],
};
