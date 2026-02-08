// Jest Configuration for Batch K Invariant Tests
// Uses ts-jest instead of react-native preset to avoid Flow syntax issues
// Run with: npx jest --config e2e/jest.invariants.config.js

module.exports = {
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/batchKInvariants.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': ['babel-jest', { presets: ['module:@react-native/babel-preset'] }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: [],
  testTimeout: 10000,
  verbose: true,
};
