module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // @agentic-kernel/core ships ESM-only; transform its .js with ts-jest (allowJs)
  // so the CommonJS Jest runtime can load it. Production bundles it via esbuild.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': ['ts-jest', { tsconfig: { allowJs: true, checkJs: false, isolatedModules: true } }],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src', '<rootDir>/tests/harness', '<rootDir>/tests/missions', '<rootDir>/tests/perf'],
  testMatch: [
    '**/__tests__/**/*.{j,t}s?(x)',
    '**/?(*.)+(spec|test).{j,t}s?(x)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // Jest's resolver ignores the package's `exports` map (it has no legacy
    // `main`), so point directly at the ESM dist entry; its relative .js imports
    // resolve normally and get transformed via the transformIgnorePatterns allowlist.
    '^@agentic-kernel/core$': '<rootDir>/node_modules/@agentic-kernel/core/dist/index.js',
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
    '^marked$': '<rootDir>/__mocks__/marked.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@plugin$': '<rootDir>/main.ts'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test-support/**'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(marked|@agentic-kernel)/)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/test-support/',
    '/tests/e2e/'
  ],
};