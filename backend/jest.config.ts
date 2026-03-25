// Jest Configuration - V3.0.9 compliant
// Auto-detects available infrastructure and selects appropriate tests:
//
//   Tier 1 (No DB):     semver + *.unit.test.ts only
//   Tier 2 (DB only):   Tier 1 + categoryAutoAssignment + DB integration tests
//   Tier 3 (DB+Server): ALL tests including E2E (supertest → API gateway)
//
// Tier 2 = CI default (Postgres + Redis containers, no running server)
// Tier 3 = local-prod / staging (full backend running)
//
// Override: API_GATEWAY_URL=http://localhost:3000 pnpm test  (forces Tier 3)

import type { Config } from 'jest';

// Auto-detect infrastructure availability
const hasDbConfig = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const hasServer = !!process.env.API_GATEWAY_URL;

// E2E tests that need a running API gateway + backend services.
// These use supertest(API_GATEWAY_URL) with a URL string, not an app import.
// They only run when API_GATEWAY_URL is set (Tier 3).
const e2eTestPatterns = [
  'goldenPath\\.test',
  'events\\.test',
  'orders\\.test',
  'reorder\\.test',
  'inventory\\.test',
  'catalog\\.test',
  'auth\\.test',
];

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: hasDbConfig
    ? ['**/*.test.ts']                                   // Tier 2+3: all test files matched
    : ['**/semver.test.ts', '**/*.unit.test.ts'],        // Tier 1: unit only
  // Tier 2 (CI): exclude E2E tests that need a running server
  testPathIgnorePatterns: hasServer
    ? ['/node_modules/']                                 // Tier 3: run everything
    : ['/node_modules/', ...e2eTestPatterns],             // Tier 1+2: skip E2E
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tests/tsconfig.json',
      diagnostics: false,
    }]
  },
  // Only load DB setup when database is available
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest.suppressConsole.ts',
    ...(hasDbConfig ? ['<rootDir>/tests/setup.ts'] : []),
  ],
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
