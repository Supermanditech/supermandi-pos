const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['<rootDir>/src/**/*.{test,spec}.{ts,tsx}'],
  testTimeout: 15000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/__tests__/**',
    '!src/**/layout.tsx',
  ],
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 20,
      functions: 20,
      lines: 25,
    },
  },
};

module.exports = createJestConfig(config);
