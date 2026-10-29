module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // ESM-only dependencies (see transformIgnorePatterns) ship .js; transform it
  // with ts-jest (allowJs) so the CommonJS Jest runtime can load it.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': ['ts-jest', { tsconfig: { allowJs: true, checkJs: false, isolatedModules: true } }],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src', '<rootDir>/packages', '<rootDir>/tests/harness', '<rootDir>/tests/missions', '<rootDir>/tests/perf'],
  testMatch: [
    '**/__tests__/**/*.{j,t}s?(x)',
    '**/?(*.)+(spec|test).{j,t}s?(x)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
    '^marked$': '<rootDir>/__mocks__/marked.ts',
    '^@qwai/obsidian-llm$': '<rootDir>/packages/obsidian-llm/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@plugin$': '<rootDir>/main.ts'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test-support/**'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(marked)/)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/test-support/',
    '/tests/e2e/'
  ],
};