/**
 * Workflow System V2 - Secure Code Execution Service
 *
 * Provides a secure sandboxed environment for executing user-provided code snippets
 * in workflow nodes like Transform, Filter, and Condition nodes.
 *
 * Uses isolated-vm for a secure V8 isolate-based sandbox.
 */

import * as ivm from 'isolated-vm';
import { WorkflowServices } from '../core/types';
import { WorkflowLogger as log } from '../../../utils/logger';

const SAFE_GLOBALS = {
  console: {
    log: (...args: unknown[]) => log.debug('[SANDBOX]', ...args),
    warn: (...args: unknown[]) => log.warn('[SANDBOX]', ...args),
    error: (...args: unknown[]) => log.error('[SANDBOX]', ...args),
    info: (...args: unknown[]) => log.debug('[SANDBOX]', ...args),
  },
  Math,
  Date,
  RegExp,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  isNaN,
  isFinite,
  parseFloat,
  parseInt,
  decodeURI,
  decodeURIComponent,
  encodeURI,
  encodeURIComponent,
};

export interface SecureExecutionOptions {
  timeout?: number;
  memoryLimit?: number;
  context?: Record<string, unknown>;
}

export interface SecureExecutionResult {
  result: unknown;
  executionTime: number;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
  };
}

export class SecureCodeExecutionService {
  private static instance: SecureCodeExecutionService;
  private isolate: ivm.Isolate;
  private isIsolateReady: boolean = false;

  private constructor() {
    try {
      this.isolate = new ivm.Isolate({ memoryLimit: 128 });
      this.isIsolateReady = true;
    } catch (error) {
      log.error(
        'Failed to initialize isolated-vm. Secure execution will not be available.',
        undefined,
        error,
      );
      this.isIsolateReady = false;
    }
  }

  static getInstance(): SecureCodeExecutionService {
    if (!SecureCodeExecutionService.instance) {
      SecureCodeExecutionService.instance = new SecureCodeExecutionService();
    }
    return SecureCodeExecutionService.instance;
  }

  dispose() {
    if (this.isIsolateReady && !this.isolate.isDisposed) {
      this.isolate.dispose();
    }
  }

  async executeCode(
    code: string,
    args: Record<string, unknown>,
    _services: WorkflowServices,
    options: SecureExecutionOptions = {}
  ): Promise<SecureExecutionResult> {
    if (!this.isIsolateReady) {
      throw new Error('Secure execution environment is not available.');
    }

    const startTime = Date.now();
    const timeout = options.timeout ?? 5000;

    // Validate code before execution
    this.validateCodeSafety(code);

    const context = await this.isolate.createContext();

    try {
      const jail = context.global;
      await jail.set('global', jail.derefInto());

      // Set up sandbox environment
      const sandbox = this.createSandboxEnvironment(args, _services, options);
      for (const key of Object.keys(sandbox)) {
        // Functions need to be transferred as references
        if (typeof sandbox[key] === 'function') {
          await jail.set(key, new ivm.Callback(sandbox[key] as (...args: unknown[]) => unknown));
        } else {
          // Other values can be transferred by value, but structuredClone is safer
          await jail.set(key, new ivm.ExternalCopy(sandbox[key]).copyInto());
        }
      }

      const argNames = Object.keys(args);
      const argValues: unknown[] = Object.values(args);
      
      const scriptText = `
        new Promise(async (resolve, reject) => {
          try {
            const result = await (async (${argNames.join(', ')}
) => {
              "use strict";
              ${code}
            })(...args);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
      `;

      const script = await this.isolate.compileScript(scriptText, {
        filename: 'workflow-script'
      });
      
      const resultPromise = await script.run(context, {
        arguments: {
          copy: true,
          internal: true,
          values: [ new ivm.ExternalCopy(argValues).copyInto() ]
        },
        result: { promise: true, copy: true },
        timeout,
      }) as Promise<unknown>;

      const result = await resultPromise;
      const executionTime = Date.now() - startTime;
      const heapStatistics = await this.isolate.getHeapStatistics();

      return {
        result,
        executionTime,
        memoryUsage: {
          heapUsed: heapStatistics.total_heap_size,
          heapTotal: heapStatistics.heap_size_limit,
        },
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Secure code execution failed: ${errorMessage}`);
    } finally {
      try {
        context.release();
      } catch (err) {
        log.warn('Failed to release context', err);
      }
    }
  }

  private createSandboxEnvironment(
    args: Record<string, unknown>,
    _services: WorkflowServices,
    options: SecureExecutionOptions
  ): Record<string, unknown> {
    const sandbox: Record<string, unknown> = {
      ...SAFE_GLOBALS,
      ...args,
      ...options.context,
    };
    // No need for complex sanitization as isolated-vm provides a clean environment
    return sandbox;
  }

  private validateCodeSafety(code: string): void {
    const dangerousPatterns = [
      /import\s/,
      /require\s*\(/,
      /eval\s*\(/,
      /\b(process|Buffer|__dirname|__filename|module|exports)\b/,
      /\b(Function|Worker|WebAssembly)\b/,
      /\b(fs|path|os|net|http|https|crypto)\b/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        const match = code.match(pattern);
        throw new Error(`Potentially dangerous code pattern detected: "${match ? match[0] : 'unknown'}"`);
      }
    }
  }
}
