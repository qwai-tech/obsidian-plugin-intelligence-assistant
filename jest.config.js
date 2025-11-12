module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.{j,t}s?(x)',
    '**/?(*.)+(spec|test).{j,t}s?(x)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
    '^marked$': '<rootDir>/__mocks__/marked.ts'
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
    '/src/test-support/'
  ]
};