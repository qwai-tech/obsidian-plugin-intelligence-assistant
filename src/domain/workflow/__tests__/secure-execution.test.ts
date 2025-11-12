/**
 * Test suite for Secure Code Execution Service
 */

import { SecureCodeExecutionService } from '../services/secure-execution';

describe('SecureCodeExecutionService', () => {
  let secureExecutor: SecureCodeExecutionService;

  beforeEach(() => {
    secureExecutor = SecureCodeExecutionService.getInstance();
  });

  describe('executeCode', () => {
    it('should execute simple JavaScript code securely', async () => {
      const result = await secureExecutor.executeCode(
        'input.value * 2', // Expression instead of return statement
        { input: { value: 5 } },
        {} as any, // Mock services
        { timeout: 1000 }
      );

      expect(result.result).toBe(10);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should prevent access to dangerous globals', async () => {
      await expect(
        secureExecutor.executeCode(
          'process.env.SECRET', // Expression instead of return statement
          {},
          {} as any,
          { timeout: 1000 }
        )
      ).rejects.toThrow(/Potentially dangerous code pattern detected/);
    });

    it('should prevent access to file system', async () => {
      await expect(
        secureExecutor.executeCode(
          'const fs = require("fs"); fs.readFileSync("/etc/passwd")', // Expression instead of return statement
          {},
          {} as any,
          { timeout: 1000 }
        )
      ).rejects.toThrow(/Potentially dangerous code pattern detected/);
    });

    it('should timeout on infinite loops', async () => {
      await expect(
        secureExecutor.executeCode(
          'for(;;) {}', // Infinite loop
          {},
          {} as any,
          { timeout: 100 } // Short timeout
        )
      ).rejects.toThrow(/timed out/);
    });

    it('should handle syntax errors gracefully', async () => {
      await expect(
        secureExecutor.executeCode(
          'input.value *', // Invalid syntax
          { input: { value: 5 } },
          {} as any,
          { timeout: 1000 }
        )
      ).rejects.toThrow(/Code compilation failed/);
    });
  });
});