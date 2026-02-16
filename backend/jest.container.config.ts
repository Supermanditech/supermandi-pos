// TEST-001: Jest config for testcontainer-based integration tests
// Usage: pnpm test:container
//
// Spins up a real PostgreSQL container via testcontainers,
// runs all 156 migrations, then executes integration tests.
// No local PostgreSQL installation required.

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],

  // Run all test files (unit + integration) — container provides real DB
  testMatch: ['**/*.test.ts'],

  // Exclude E2E tests that need a running API gateway server
  testPathIgnorePatterns: [
    '/node_modules/',
    'goldenPath\\.test',
    'events\\.test',
    'orders\\.test',
    'reorder\\.test',
    'inventory\\.test',
    'catalog\\.test',
    'auth\\.test',
  ],

  moduleFileExtensions: ['ts', 'js', 'json'],

  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tests/tsconfig.json',
    }],
  },

  // Testcontainer lifecycle
  globalSetup: '<rootDir>/tests/containers/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/containers/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/containers/setup.ts'],

  // Container startup + migrations can take time
  testTimeout: 60000,

  verbose: true,
  forceExit: true,
  detectOpenHandles: true,

  // Sequential — integration tests may share state
  maxWorkers: 1,

  collectCoverageFrom: [
    'services/**/src/**/*.ts',
    '!services/**/src/**/*.d.ts',
    '!services/**/src/**/index.ts',
  ],
  coverageDirectory: 'coverage-container',
  coverageReporters: ['text', 'lcov', 'html'],
};

export default config;
