/**
 * Workflow System V2 - Secure Code Execution Service
 *
 * Provides a secure sandboxed environment for executing user-provided code snippets
 * in workflow nodes like Transform, Filter, and Condition nodes.
 * 
 * Uses VM2 sandbox for secure JavaScript execution with configurable restrictions.
 */

import { NodeVM, VMScript } from 'vm2';
import { WorkflowServices } from '../core/types';

// Predefined safe globals that can be accessed in the sandbox
const SAFE_GLOBALS = {
  console: {
    log: (...args: any[]) => console.log('[SANDBOX]', ...args),
    warn: (...args: any[]) => console.warn('[SANDBOX]', ...args),
    error: (...args: any[]) => console.error('[SANDBOX]', ...args),
    info: (...args: any[]) => console.info('[SANDBOX]', ...args),
  },
  Math: Math,
  Date: Date,
  RegExp: RegExp,
  JSON: JSON,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Boolean: Boolean,
  isNaN: isNaN,
  isFinite: isFinite,
  parseFloat: parseFloat,
  parseInt: parseInt,
  decodeURI: decodeURI,
  decodeURIComponent: decodeURIComponent,
  encodeURI: encodeURI,
  encodeURIComponent: encodeURIComponent,
};

// Restricted modules that are explicitly forbidden
const FORBIDDEN_MODULES = [
  'fs', 'path', 'child_process', 'process', 'os', 'net', 'http', 'https', 
  'crypto', 'cluster', 'dgram', 'dns', 'domain', 'events', 'punycode', 
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'tls', 
  'tty', 'url', 'util', 'v8', 'vm', 'zlib', 'inspector'
];

export interface SecureExecutionOptions {
  /** Maximum execution time in milliseconds (default: 5000ms) */
  timeout?: number;
  /** Maximum memory allocation in MB (default: 100MB) */
  memoryLimit?: number;
  /** Allowed built-in modules (default: []) */
  builtinModules?: string[];
  /** External modules that can be required (default: {}) */
  externalModules?: Record<string, any>;
  /** Whether to allow asynchronous operations (default: false) */
  allowAsync?: boolean;
  /** Custom context variables to inject */
  context?: Record<string, any>;
}

export interface SecureExecutionResult {
  /** Execution result */
  result: any;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Memory usage information */
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
  };
  /** Warnings during execution */
  warnings?: string[];
}

export class SecureCodeExecutionService {
  private static instance: SecureCodeExecutionService;
  
  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): SecureCodeExecutionService {
    if (!SecureCodeExecutionService.instance) {
      SecureCodeExecutionService.instance = new SecureCodeExecutionService();
    }
    return SecureCodeExecutionService.instance;
  }

  /**
   * Execute user-provided code securely in a sandboxed environment
   */
  async executeCode(
    code: string,
    args: Record<string, any>,
    services: WorkflowServices,
    options: SecureExecutionOptions = {}
  ): Promise<SecureExecutionResult> {
    const startTime = Date.now();
    
    // Default options
    const opts: Required<SecureExecutionOptions> = {
      timeout: options.timeout ?? 5000,
      memoryLimit: options.memoryLimit ?? 100,
      builtinModules: options.builtinModules ?? [],
      externalModules: options.externalModules ?? {},
      allowAsync: options.allowAsync ?? false,
      context: options.context ?? {},
    };

    try {
      // Validate code length to prevent abuse
      if (code.length > 100000) { // 100KB limit
        throw new Error('Code snippet too large (maximum 100KB)');
      }

      // Validate code safety to prevent dangerous patterns
      this.validateCodeSafety(code);

      // Create sandbox environment with restricted access
      const sandbox = this.createSandboxEnvironment(args, services, opts);

      // Configure VM with strict security settings
      const vm = new NodeVM({
        console: 'redirect',
        sandbox,
        require: {
          external: false, // No external modules allowed by default
          builtin: opts.builtinModules,
          root: './', // Restrict to current directory if needed
          mock: opts.externalModules,
        },
        nesting: false, // No nesting allowed
        wrapper: 'commonjs', // Use CommonJS module wrapper
        sourceExtensions: ['js'],
        compiler: 'javascript',
        eval: false, // No eval allowed
        wasm: false, // No WebAssembly
        allowAsync: opts.allowAsync,
        fixAsync: !opts.allowAsync, // Fix async if not allowed
      });

      // Set execution timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Code execution timed out after ${opts.timeout}ms`));
        }, opts.timeout);
      });

      // Execute code with timeout protection
      const executionPromise = (async () => {
        try {
          // Compile script for better performance on repeated executions
          const script = new VMScript(`module.exports = (function(${Object.keys(args).join(', ')})) { ${code} })`);
          const compiledFunction = vm.run(script);
          
          // Execute the function with provided arguments
          const result = await compiledFunction(...Object.values(args));
          
          return {
            result,
            executionTime: Date.now() - startTime,
            memoryUsage: this.getMemoryUsage(),
          };
        } catch (compileError) {
          // If compilation fails, try executing as an expression
          if (compileError.message.includes('Unexpected token')) {
            try {
              const script = new VMScript(`module.exports = ${code}`);
              const result = vm.run(script);
              return {
                result,
                executionTime: Date.now() - startTime,
                memoryUsage: this.getMemoryUsage(),
              };
            } catch (exprError) {
              throw new Error(`Code compilation failed: ${compileError.message}`);
            }
          }
          throw new Error(`Code execution failed: ${compileError.message}`);
        }
      })();

      // Race execution against timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);
      return result;
    } catch (error: any) {
      throw new Error(`Secure code execution failed: ${error.message}`);
    }
  }

  /**
   * Create a secure sandbox environment with whitelisted globals
   */
  private createSandboxEnvironment(
    args: Record<string, any>,
    services: WorkflowServices,
    options: Required<SecureExecutionOptions>
  ): Record<string, any> {
    const sandbox: Record<string, any> = {
      // Safe globals
      ...SAFE_GLOBALS,
      
      // User-provided arguments
      ...args,
      
      // Limited services access
      services: {
        // Only expose safe service methods
        log: services.vault ? (message: string) => {
          console.log(`[Workflow Service] ${message}`);
        } : undefined,
      },
      
      // Custom context variables
      ...options.context,
      
      // Utility functions
      setTimeout: (fn: Function, delay: number) => {
        if (delay > options.timeout) {
          throw new Error('setTimeout delay exceeds execution timeout');
        }
        return setTimeout(fn, Math.min(delay, options.timeout));
      },
      clearTimeout: clearTimeout,
    };

    // Remove dangerous properties
    this.sanitizeSandbox(sandbox);
    
    return sandbox;
  }

  /**
   * Sanitize sandbox to remove potentially dangerous properties
   */
  private sanitizeSandbox(sandbox: Record<string, any>): void {
    // Remove or neutralize dangerous global properties
    if (sandbox.global) {
      if ('process' in sandbox.global) {
        delete (sandbox.global as Record<string, unknown>).process;
      }
      if ('Buffer' in sandbox.global) {
        delete (sandbox.global as Record<string, unknown>).Buffer;
      }
      if ('console' in sandbox.global) {
        delete (sandbox.global as Record<string, unknown>).console;
      }
    }
    
    if ('constructor' in sandbox) {
      Reflect.deleteProperty(sandbox, 'constructor');
    }

    if ('prototype' in sandbox) {
      Reflect.deleteProperty(sandbox, 'prototype');
    }
    
    // Prevent access to forbidden modules
    for (const moduleName of FORBIDDEN_MODULES) {
      if (moduleName in sandbox) {
        delete sandbox[moduleName];
      }
    }
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): { heapUsed: number; heapTotal: number } | undefined {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
      };
    }
    return undefined;
  }

  /**
   * Validate that code doesn't contain dangerous patterns
   */
  private validateCodeSafety(code: string): void {
    const dangerousPatterns = [
      /\b(process|global|require|Buffer|__dirname|__filename|module|exports)\b/,
      /\b(import|export)\b/,
      /eval\s*\(/,
      /\b(Function|VM|Worker|WebAssembly)\b/,
      /\b(child_process|fs|path|os|net|http|https|crypto)\b/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        const match = code.match(pattern);
        throw new Error(`Potentially dangerous code pattern detected: ${match ? match[0] : 'unknown'}`);
      }
    }
  }

  /**
   * Execute a function with additional safety checks
   */
  async executeFunction<T>(
    func: (...args: any[]) => T,
    args: any[],
    timeout: number = 5000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Function execution timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = func(...args);
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
}
