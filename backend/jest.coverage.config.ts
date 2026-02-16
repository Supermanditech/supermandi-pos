// TEST-006: Jest Coverage Configuration
// Enforces coverage thresholds per service area.
// Run: pnpm test:coverage

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    // Exclude container tests (they need Docker)
    'containers/',
    // Exclude E2E tests (they need running server)
    'goldenPath\\.test',
    'events\\.test',
    'orders\\.test',
  ],
  moduleNameMapper: {
    '^@supermandi/common(.*)$': '<rootDir>/packages/common/src$1',
  },
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'services/*/src/**/*.ts',
    'packages/common/src/**/*.ts',
    // Exclude non-testable files
    '!src/server.ts',
    '!**/index.ts',
    '!**/*.d.ts',
    '!**/types.ts',
    '!**/types/**',
  ],
  coverageThreshold: {
    // Global minimum thresholds
    global: {
      branches: 40,
      functions: 50,
      lines: 50,
      statements: 50,
    },
    // Critical business logic — higher thresholds
    'src/services/': {
      branches: 45,
      functions: 55,
      lines: 55,
      statements: 55,
    },
    // Shared package — high coverage requirement
    'packages/common/src/': {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  maxWorkers: 1,
  testTimeout: 30000,
};

export default config;
