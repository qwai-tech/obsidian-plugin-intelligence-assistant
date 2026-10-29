const base = require('./jest.config');
module.exports = {
  ...base,
  roots: ['<rootDir>/src/__tests__/features/agent', '<rootDir>/tests/harness', '<rootDir>/tests/missions'],
};
