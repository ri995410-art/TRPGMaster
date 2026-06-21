module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['_deprecated'],
  moduleNameMapper: {
    '^@trpgmaster/shared$': '<rootDir>/../shared',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        moduleResolution: 'node',
      },
    }],
  },
};