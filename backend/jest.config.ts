// Jest Configuration - V3.0.9 compliant
// Auto-detects database availability:
//   - With DB (TEST_DATABASE_URL set): runs ALL tests (unit + integration)
//   - Without DB: runs unit tests only (no hang, no false failures)
//
// Override: TEST_DATABASE_URL=postgresql://... pnpm test

import type { Config } from 'jest';

// Auto-detect: if TEST_DATABASE_URL is explicitly set, run integration tests
const hasDbConfig = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: hasDbConfig
    ? ['**/*.test.ts']
    : ['**/semver.test.ts', '**/*.unit.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tests/tsconfig.json'
    }]
  },
  // Only load DB setup when database is available
  setupFilesAfterEnv: hasDbConfig ? ['<rootDir>/tests/setup.ts'] : [],
  testTimeout: hasDbConfig ? 30000 : 10000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  collectCoverageFrom: [
    'services/**/src/**/*.ts',
    '!services/**/src/**/*.d.ts',
    '!services/**/src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Run tests sequentially for integration tests
  maxWorkers: 1,
};

export default config;
