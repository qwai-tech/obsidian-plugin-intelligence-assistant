/**
 * Test suite for Secure Code Execution Service
 */

import { SecureCodeExecutionService } from '../services/secure-execution';

jest.mock('isolated-vm', () => {
  const mockRun = jest.fn().mockResolvedValue(10);
  const mockScript = {
    run: mockRun,
  };
  const mockCompileScript = jest.fn().mockResolvedValue(mockScript);
  const mockContext = {
    global: {
      set: jest.fn(),
      derefInto: jest.fn(),
    },
    release: jest.fn(),
  };
  const mockCreateContext = jest.fn().mockResolvedValue(mockContext);
  const mockIsolate = {
    createContext: mockCreateContext,
    compileScript: mockCompileScript,
    getHeapStatistics: jest.fn().mockResolvedValue({
      total_heap_size: 100,
      heap_size_limit: 500,
    }),
    isDisposed: false,
    dispose: jest.fn(),
  };
  return {
    Isolate: jest.fn().mockImplementation(() => mockIsolate),
    mockRun, // Export for individual test customization
  };
});

describe('SecureCodeExecutionService', () => {
  let secureExecutor: SecureCodeExecutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    secureExecutor = SecureCodeExecutionService.getInstance();
  });

  describe('executeCode', () => {
    it('should execute simple JavaScript code securely', async () => {
      const { mockRun } = require('isolated-vm');
      mockRun.mockResolvedValue(10);

      const result = await secureExecutor.executeCode(
        'return input.value * 2',
        { input: { value: 5 } },
        {} as any, // Mock services
        { timeout: 1000 }
      );

      expect(result.result).toBe(10);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should prevent access to dangerous globals', async () => {
      await expect(
        secureExecutor.executeCode(
          'process.env.SECRET',
          {},
          {} as any,
          { timeout: 1000 }
        )
      ).rejects.toThrow(/Potentially dangerous code pattern detected/);
    });

    it('should prevent access to file system', async () => {
      await expect(
        secureExecutor.executeCode(
          'const fs = require("fs"); fs.readFileSync("/etc/passwd")',
          {},
          {} as any,
          { timeout: 1000 }
        )
      ).rejects.toThrow(/Potentially dangerous code pattern detected/);
    });

    it('should timeout on infinite loops', async () => {
      const { mockRun } = require('isolated-vm');
      mockRun.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('should have timed out'), 200)));

      await expect(
        secureExecutor.executeCode(
          'while(true) {}', // Infinite loop
          {},
          {} as any,
          { timeout: 100 } // Short timeout
        )
      ).rejects.toThrow(/timed out/);
    });

    it('should handle syntax errors gracefully', async () => {
      const { mockCompileScript } = require('isolated-vm');
      mockCompileScript.mockRejectedValue(new Error('Syntax error'));

      await expect(
        secureExecutor.executeCode(
          'return input.value *', // Invalid syntax
          { input: { value: 5 } },
          {} as any,
          { timeout: 1000 }
        )
      ).rejects.toThrow(/Secure code execution failed: Syntax error/);
    });
  });
});