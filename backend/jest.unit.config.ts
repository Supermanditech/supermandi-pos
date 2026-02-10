// SA-P2-003: Jest config for pure unit tests (no database required)
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/semver.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tests/tsconfig.json'
    }]
  },
  // No setupFilesAfterEnv — pure unit tests, no DB needed
  testTimeout: 10000,
  verbose: true,
};

export default config;
