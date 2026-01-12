// Jest Configuration for E2E Tests - V3.0.9 compliant
// Frontend integration test configuration

module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.test.ts'],
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
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage/e2e',
  // Skip Maestro YAML files
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.yaml$',
  ],
};
