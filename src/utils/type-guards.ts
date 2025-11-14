/**
 * Type Guard Utilities
 * Provides safe type checking functions for common patterns
 */

/**
 * Check if value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if value has a message property
 */
export function hasMessage(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && 'message' in value && 
         typeof (value as { message: unknown }).message === 'string';
}

/**
 * Safely extract error message from unknown error value
 */
export function safeGetMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (hasMessage(error)) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Check if value is an object with specific property
 */
export function hasProperty<T extends string>(
  value: unknown, 
  property: T
): value is Record<T, unknown> {
  return typeof value === 'object' && value !== null && property in value;
}

/**
 * Safely access nested property
 */
export function safeGet<T>(
  obj: unknown, 
  path: string[], 
  defaultValue: T
): T {
  let current = obj;
  
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[key];
  }
  
  return current as T;
}

/**
 * Promise wrapper for event handlers
 */
export function handleAsyncEvent(asyncFn: () => Promise<void>): () => void {
  return () => {
    void asyncFn().catch((error: unknown) => {
      console.error('Async event handler error:', safeGetMessage(error));
    });
  };
}

/**
 * Promise wrapper with custom error handler
 */
export function handleAsyncEventWithHandler(
  asyncFn: () => Promise<void>,
  errorHandler: (error: unknown) => void
): () => void {
  return () => {
    void asyncFn().catch(errorHandler);
  };
}

/**
 * Safe method call on potentially undefined object
 */
export function safeCall<T extends unknown[], R>(
  obj: unknown,
  methodName: string,
  args: T,
  defaultReturn: R
): R {
  if (typeof obj === 'object' && obj !== null && methodName in obj) {
    const method = (obj as Record<string, unknown>)[methodName];
    if (isFunction(method)) {
      try {
        return method.apply(obj, args) as R;
      } catch (error) {
        console.error(`Error calling ${methodName}:`, safeGetMessage(error));
      }
    }
  }
  return defaultReturn;
}

/**
 * Type guard for Obsidian App with settings
 */
export function hasSettings(app: unknown): app is { setting: { open: () => void; openTabById: (id: string) => void } } {
  return hasProperty(app, 'setting') && 
         typeof app.setting === 'object' && 
         app.setting !== null &&
         hasProperty(app.setting, 'open') &&
         hasProperty(app.setting, 'openTabById') &&
         isFunction(app.setting.open) &&
         isFunction(app.setting.openTabById);
}

/**
 * Safe settings access for Obsidian app
 */
export function safeOpenSettings(app: unknown, tabId?: string): void {
  if (hasSettings(app)) {
    try {
      app.setting.open();
      if (tabId) {
        app.setting.openTabById(tabId);
      }
    } catch (error) {
      console.error('Error opening settings:', safeGetMessage(error));
    }
  } else {
    console.warn('App settings not available');
  }
}

/**
 * Type guard for objects with specific methods
 */
export function hasMethod<T extends string>(
  obj: unknown,
  methodName: T
): obj is Record<T, (...args: unknown[]) => unknown> {
  return hasProperty(obj, methodName) && isFunction((obj)[methodName]);
}

/**
 * Safe array access
 */
export function safeArrayAccess<T>(
  arr: unknown,
  index: number,
  defaultValue: T
): T {
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    return arr[index] as T;
  }
  return defaultValue;
}

/**
 * Check if value is a valid string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is a valid number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}
