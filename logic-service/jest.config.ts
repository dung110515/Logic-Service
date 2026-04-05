/**
 * Jest Configuration
 * Supports TypeScript, mocking, test isolation
 */

import type { Config } from 'jest';

const config: Config = {
  // Preset với TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root directories
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/index.ts',
  ],
  coveragePathIgnorePatterns: [
    'node_modules',
    'dist',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },

  // Test timeout
  testTimeout: 10000,

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Verbose output
  verbose: true,
  bail: false, // Continue running tests after failure

  // Transform files (ts-jest)
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },

  // Module extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
