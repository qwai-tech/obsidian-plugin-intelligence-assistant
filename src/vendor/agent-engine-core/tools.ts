import { Ajv } from "ajv/dist/ajv.js";
import type { AnySchema } from "ajv/dist/ajv.js";

import type {
  AgentState,
  HostContext,
  JsonObject,
  JsonValue,
  Observation,
  PolicyDecision,
  RuntimeControl,
  ToolCallAction,
  ToolDescription
} from "./contracts";
import type { Clock, IdGenerator } from "./ids";
import { createDefaultClock, createRandomIdGenerator } from "./ids";
import type { PolicyManager } from "./policy";

export type ToolSideEffectLevel = "none" | "read" | "write" | "destructive";

export type ToolContext = {
  host: HostContext;
  state: AgentState;
  action: ToolCallAction;
  abortSignal?: AbortSignal;
  idempotencyKey?: string;
  tool: ToolDescription;
  reportProgress?: (event: JsonObject) => void;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
  sideEffectLevel: ToolSideEffectLevel;
  requiredScopes: string[];
  timeoutMs?: number;
  concurrencySafe?: boolean;
  idempotent?: boolean;
  maxResultBytes?: number;
  sanitizeInput?: (args: JsonObject, context: ToolContext) => JsonObject | Promise<JsonObject>;
  validateInput?: (
    args: JsonObject,
    context: ToolContext
  ) => string | undefined | Promise<string | undefined>;
  beforeExecute?: (args: JsonObject, context: ToolContext) => void | Promise<void>;
  afterExecute?: (
    args: JsonObject,
    result: JsonValue,
    context: ToolContext
  ) => void | Promise<void>;
  onError?: (
    error: Error,
    args: JsonObject,
    context: ToolContext
  ) => void | Promise<void>;
  execute: (args: JsonObject, context: ToolContext) => JsonValue | Promise<JsonValue>;
};

export class ToolRegistry {
  readonly #tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.#tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.#tools.get(name);
  }

  describe(names?: string[]): ToolDescription[] {
    const tools = names
      ? names.flatMap((name) => {
          const tool = this.#tools.get(name);
          return tool ? [tool] : [];
        })
      : [...this.#tools.values()];

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: cloneJsonObject(tool.inputSchema),
      sideEffectLevel: tool.sideEffectLevel,
      requiredScopes: [...tool.requiredScopes]
    }));
  }
}

export type ToolExecutorInput = {
  action: ToolCallAction;
  state: AgentState;
  host: HostContext;
  runtime?: RuntimeControl;
  policyDecision?: PolicyDecision;
};

export type ToolExecutorOptions = {
  registry: ToolRegistry;
  policy: PolicyManager;
  clock?: Clock;
  idGenerator?: IdGenerator;
  ajv?: Ajv;
};

export class ToolExecutor {
  readonly #registry: ToolRegistry;
  readonly #policy: PolicyManager;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #ajv: Ajv;

  constructor(options: ToolExecutorOptions) {
    this.#registry = options.registry;
    this.#policy = options.policy;
    this.#clock = options.clock ?? createDefaultClock();
    this.#idGenerator = options.idGenerator ?? createRandomIdGenerator("observation");
    this.#ajv = options.ajv ?? new Ajv({ allErrors: true });
  }

  async execute(input: ToolExecutorInput): Promise<Observation> {
    const startedAt = this.#clock.now();
    const tool = this.#registry.get(input.action.toolName);
    const progressEvents: JsonObject[] = [];

    if (!tool) {
      return this.#failedObservation(
        input.action,
        startedAt,
        `Tool not found: ${input.action.toolName}`
      );
    }

    const baseContext = this.#toolContext(tool, input, progressEvents);

    const policyDecision =
      input.policyDecision ??
      (await this.#policy.validate({
        action: input.action,
        state: input.state
      }));

    if (policyDecision.decision !== "allow") {
      return this.#failedObservation(
        input.action,
        startedAt,
        `Policy denied: ${policyDecision.reason}`
      );
    }

    let args = input.action.arguments;
    try {
      if (tool.sanitizeInput !== undefined) {
        args = await tool.sanitizeInput(args, baseContext);
      }
    } catch (error) {
      const normalized = toError(error);
      await this.#runErrorHook(tool, normalized, args, baseContext);
      return this.#failedObservation(
        input.action,
        startedAt,
        `Input sanitization failed: ${normalized.message}`,
        progressEvents
      );
    }

    const validateInput = this.#ajv.compile(tool.inputSchema as AnySchema);
    if (!validateInput(args)) {
      return this.#failedObservation(
        input.action,
        startedAt,
        `Schema validation failed: ${this.#ajv.errorsText(validateInput.errors)}`,
        progressEvents
      );
    }

    if (tool.validateInput !== undefined) {
      const validationError = await tool.validateInput(args, baseContext);
      if (validationError !== undefined) {
        const error = new Error(`Semantic validation failed: ${validationError}`);
        await this.#runErrorHook(tool, error, args, baseContext);
        return this.#failedObservation(
          input.action,
          startedAt,
          error.message,
          progressEvents
        );
      }
    }

    const missingScopes = missingRequiredScopes(tool, input.host);
    if (missingScopes.length > 0) {
      return this.#failedObservation(
        input.action,
        startedAt,
        `Missing required tool scopes: ${missingScopes.join(", ")}`,
        progressEvents
      );
    }

    try {
      await tool.beforeExecute?.(args, baseContext);
      const result = await this.#callTool(tool, input, args, progressEvents);

      if (!isJsonValue(result)) {
        return this.#failedObservation(
          input.action,
          startedAt,
          "Tool result is not JSON-serializable",
          progressEvents
        );
      }

      if (tool.outputSchema) {
        const validateOutput = this.#ajv.compile(tool.outputSchema as AnySchema);
        if (!validateOutput(result)) {
          return this.#failedObservation(
            input.action,
            startedAt,
            `Output schema validation failed: ${this.#ajv.errorsText(validateOutput.errors)}`,
            progressEvents
          );
        }
      }

      await tool.afterExecute?.(args, result, baseContext);
      const mapped = mapResult(result, tool.maxResultBytes);

      return this.#observation(input.action, startedAt, {
        success: true,
        result: mapped.result
      }, mergeMetadata(mapped.metadata, progressEvents));
    } catch (error) {
      const normalized = toError(error);
      await this.#runErrorHook(tool, normalized, args, baseContext);
      return this.#failedObservation(
        input.action,
        startedAt,
        normalized.message,
        progressEvents
      );
    }
  }

  async #callTool(
    tool: ToolDefinition,
    input: ToolExecutorInput,
    args: JsonObject,
    progressEvents: JsonObject[]
  ): Promise<JsonValue> {
    if (tool.timeoutMs === undefined) {
      return tool.execute(args, {
        ...this.#toolContext(tool, input, progressEvents),
        abortSignal: input.runtime?.abortSignal
      });
    }

    const timeoutMs = Math.max(0, Math.floor(tool.timeoutMs));
    const abortController = new AbortController();
    const runtimeSignal = input.runtime?.abortSignal;
    const abortFromRuntime = () => abortController.abort(runtimeSignal?.reason);

    if (runtimeSignal?.aborted) {
      abortFromRuntime();
    } else {
      runtimeSignal?.addEventListener("abort", abortFromRuntime, { once: true });
    }

    let timeout: number | undefined;
    let timedOut = false;
    const toolPromise = Promise.resolve().then(() =>
      tool.execute(args, {
        ...this.#toolContext(tool, input, progressEvents),
        abortSignal: abortController.signal
      })
    );
    const timeoutPromise = new Promise<JsonValue>((_resolve, reject) => {
      timeout = window.setTimeout(() => {
        timedOut = true;
        abortController.abort();
        reject(new Error(`Tool timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([toolPromise, timeoutPromise]);
    } finally {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      runtimeSignal?.removeEventListener("abort", abortFromRuntime);
      if (timedOut) {
        toolPromise.catch(() => undefined);
      }
    }
  }

  #failedObservation(
    action: ToolCallAction,
    startedAt: string,
    error: string,
    progressEvents: JsonObject[] = []
  ): Observation {
    return this.#observation(action, startedAt, {
      success: false,
      error
    }, mergeMetadata(undefined, progressEvents));
  }

  #observation(
    action: ToolCallAction,
    startedAt: string,
    outcome: Pick<Observation, "success" | "result" | "error">,
    metadata?: JsonObject
  ): Observation {
    const completedAt = this.#clock.now();
    const latencyMs = Date.parse(completedAt) - Date.parse(startedAt);

    return {
      id: this.#idGenerator.nextId(),
      actionId: action.id,
      ...outcome,
      latencyMs: Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : undefined,
      startedAt,
      completedAt,
      ...(metadata === undefined ? {} : { metadata })
    };
  }

  #toolContext(
    tool: ToolDefinition,
    input: ToolExecutorInput,
    progressEvents: JsonObject[]
  ): ToolContext {
    return {
      host: input.host,
      state: input.state,
      action: input.action,
      idempotencyKey: input.action.idempotencyKey,
      tool: describeTool(tool),
      reportProgress: (event) => {
        progressEvents.push(cloneJsonObject(event));
      }
    };
  }

  async #runErrorHook(
    tool: ToolDefinition,
    error: Error,
    args: JsonObject,
    context: ToolContext
  ): Promise<void> {
    try {
      await tool.onError?.(error, args, context);
    } catch {
      // Tool failure hooks are diagnostic; the original observation remains authoritative.
    }
  }
}

export type ToolSchedulerOptions = ToolExecutorOptions;

export class ToolScheduler {
  readonly #registry: ToolRegistry;
  readonly #executor: ToolExecutor;

  constructor(options: ToolSchedulerOptions) {
    this.#registry = options.registry;
    this.#executor = new ToolExecutor(options);
  }

  async execute(inputs: ToolExecutorInput[]): Promise<Observation[]> {
    const observations: Array<Observation | undefined> = new Array<Observation | undefined>(inputs.length);
    const safeBatch: Array<{ input: ToolExecutorInput; index: number }> = [];

    const flushSafeBatch = async () => {
      if (safeBatch.length === 0) {
        return;
      }

      const current = safeBatch.splice(0, safeBatch.length);
      const results = await Promise.all(
        current.map(({ input }) => this.#executor.execute(input))
      );
      results.forEach((observation, index) => {
        observations[current[index].index] = observation;
      });
    };

    for (const [index, input] of inputs.entries()) {
      const tool = this.#registry.get(input.action.toolName);
      if (isConcurrentSafe(tool)) {
        safeBatch.push({ input, index });
        continue;
      }

      await flushSafeBatch();
      observations[index] = await this.#executor.execute(input);
    }

    await flushSafeBatch();

    return observations.map((observation) => {
      if (observation === undefined) {
        throw new Error("tool_scheduler_missing_observation");
      }

      return observation;
    });
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function missingRequiredScopes(tool: ToolDefinition, host: HostContext): string[] {
  const effectiveScopes = new Set(host.effectiveScopes);

  return tool.requiredScopes.filter((scope) => !effectiveScopes.has(scope));
}

function describeTool(tool: ToolDefinition): ToolDescription {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: cloneJsonObject(tool.inputSchema),
    sideEffectLevel: tool.sideEffectLevel,
    requiredScopes: [...tool.requiredScopes]
  };
}

function isConcurrentSafe(tool: ToolDefinition | undefined): boolean {
  return (
    tool !== undefined &&
    tool.concurrencySafe === true &&
    (tool.sideEffectLevel === "none" || tool.sideEffectLevel === "read")
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      if (Array.isArray(value)) {
        return value.every(isJsonValue);
      }

      if (!isPlainObject(value)) {
        return false;
      }

      return Object.values(value).every(isJsonValue);
    default:
      return false;
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function mergeMetadata(
  metadata: JsonObject | undefined,
  progressEvents: JsonObject[]
): JsonObject | undefined {
  if (metadata === undefined && progressEvents.length === 0) {
    return undefined;
  }

  return {
    ...(metadata ?? {}),
    ...(progressEvents.length === 0
      ? {}
      : { progressEvents: progressEvents.map(cloneJsonObject) })
  };
}

function mapResult(
  result: JsonValue,
  maxResultBytes: number | undefined
): { result: JsonValue; metadata?: JsonObject } {
  if (maxResultBytes === undefined) {
    return { result };
  }

  const limitBytes = Math.max(0, Math.floor(maxResultBytes));
  const serialized = JSON.stringify(result);
  const originalBytes = new TextEncoder().encode(serialized).byteLength;
  if (originalBytes <= limitBytes) {
    return { result };
  }

  return {
    result: {
      truncated: true,
      preview: trimByBytes(serialized, limitBytes)
    },
    metadata: {
      resultTruncated: true,
      artifactSpillover: {
        kind: "tool_result",
        originalBytes,
        limitBytes
      }
    }
  };
}

function trimByBytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(value);
  return decoder.decode(bytes.slice(0, maxBytes));
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneJsonValue(nested)])
    );
  }

  return value;
}
