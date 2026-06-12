const base = require('./jest.config');
module.exports = {
  ...base,
  roots: ['<rootDir>/src/__tests__/application/agents', '<rootDir>/tests/harness', '<rootDir>/tests/missions'],
};
