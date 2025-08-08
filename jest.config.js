/** @type {import('jest').Config} */
export default {
  // Test environment
  testEnvironment: 'node',
  
  // TypeScript support
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },

  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,ts}',
    '<rootDir>/tests/**/*.spec.{js,ts}',
    '<rootDir>/backend/**/__tests__/**/*.{js,ts}',
    '<rootDir>/frontend/**/__tests__/**/*.{js,ts}',
  ],

  // Test organization
  projects: [
    {
      displayName: 'Backend Unit Tests',
      testMatch: ['<rootDir>/tests/unit/**/*.test.{js,ts}'],
      testEnvironment: 'node',
    },
    {
      displayName: 'Backend Integration Tests',
      testMatch: ['<rootDir>/tests/integration/**/*.test.{js,ts}'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
    },
    {
      displayName: 'API Endpoint Tests',
      testMatch: ['<rootDir>/tests/api/**/*.test.{js,ts}'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/api.setup.js'],
    },
    {
      displayName: 'Frontend Tests',
      testMatch: ['<rootDir>/tests/frontend/**/*.test.{js,ts,tsx}'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/frontend.setup.js'],
    },
    {
      displayName: 'E2E Tests',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.{js,ts}'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/e2e.setup.js'],
    },
  ],

  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag
  collectCoverageFrom: [
    'backend/src/**/*.{js,ts}',
    'frontend/src/**/*.{js,ts,tsx}',
    'config/**/*.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/*.config.{js,ts}',
    '!**/tests/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Test setup and teardown
  globalSetup: '<rootDir>/tests/setup/global.setup.js',
  globalTeardown: '<rootDir>/tests/setup/global.teardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],

  // Performance
  maxWorkers: '50%',
  testTimeout: 30000, // 30 seconds for integration tests

  // Mocking
  clearMocks: true,
  restoreMocks: true,

  // Verbose output for debugging
  verbose: process.env.NODE_ENV === 'test',

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
  ],

  // Watch mode configuration
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
    '<rootDir>/logs/',
  ],
};
