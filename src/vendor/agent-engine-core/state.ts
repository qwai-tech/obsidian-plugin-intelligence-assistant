import type {
  Agent,
  AgentState,
  ExecutionLogEntry,
  HostContext,
  Task
} from "./contracts";
import { AGENT_KERNEL_SCHEMA_VERSION } from "./contracts";
import { AgentKernelError } from "./errors";
import type { Clock, IdGenerator } from "./ids";
import { createDefaultClock, createRandomIdGenerator } from "./ids";
import type { Observer } from "./observer";
import { NoopObserver } from "./observer";

export type CreateStateInput = {
  agent: Agent;
  task: Task;
  host: HostContext;
};

export type AppendLogInput = Omit<ExecutionLogEntry, "schemaVersion" | "sequence">;

export type StateStore = {
  create(input: CreateStateInput): Promise<AgentState>;
  load(runId: string): Promise<AgentState>;
  save(state: AgentState): Promise<AgentState>;
  appendLog(entry: AppendLogInput): Promise<ExecutionLogEntry>;
  listLog(runId: string): Promise<ExecutionLogEntry[]>;
};

export type InMemoryStateStoreOptions = {
  idGenerator?: IdGenerator;
  clock?: Clock;
  observer?: Observer;
};

function cloneState(state: AgentState): AgentState {
  return structuredClone(state);
}

function cloneLogEntry(entry: ExecutionLogEntry): ExecutionLogEntry {
  return structuredClone(entry);
}

export class InMemoryStateStore implements StateStore {
  readonly #states = new Map<string, AgentState>();
  readonly #logs = new Map<string, ExecutionLogEntry[]>();
  readonly #traceIds = new Map<string, string>();
  readonly #idGenerator: IdGenerator;
  readonly #clock: Clock;
  readonly #observer: Observer;

  constructor(options: InMemoryStateStoreOptions = {}) {
    this.#idGenerator = options.idGenerator ?? createRandomIdGenerator("run");
    this.#clock = options.clock ?? createDefaultClock();
    this.#observer = options.observer ?? new NoopObserver();
  }

  async create(input: CreateStateInput): Promise<AgentState> {
    const runId = this.#idGenerator.nextId();
    const now = this.#clock.now();
    const state: AgentState = {
      taskId: input.task.id,
      agentId: input.agent.id,
      runId,
      tenantId: input.host.tenantId,
      workspaceId: input.host.workspaceId,
      principalId: input.host.principal.id,
      effectiveScopes: [...input.host.effectiveScopes],
      status: "running",
      step: 0,
      messages: [],
      actions: [],
      observations: [],
      variables: {},
      failureCount: 0,
      toolCallCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    this.#states.set(runId, cloneState(state));
    this.#logs.set(runId, []);
    if (input.host.traceId !== undefined) {
      this.#traceIds.set(runId, input.host.traceId);
    }
    await this.appendLog({
      id: this.#idGenerator.nextId(),
      runId,
      type: "task_started",
      timestamp: now,
      payload: {
        agentId: input.agent.id,
        taskId: input.task.id,
        effectiveScopes: [...input.host.effectiveScopes]
      },
      traceId: input.host.traceId,
      principalId: input.host.principal.id,
      tenantId: input.host.tenantId,
      workspaceId: input.host.workspaceId
    });

    return cloneState(state);
  }

  async load(runId: string): Promise<AgentState> {
    const state = this.#states.get(runId);
    if (state === undefined) {
      throw new AgentKernelError("RUN_NOT_FOUND", `Run not found: ${runId}`, { runId });
    }

    return cloneState(state);
  }

  async save(state: AgentState): Promise<AgentState> {
    const current = this.#states.get(state.runId);
    if (current === undefined) {
      throw new AgentKernelError("RUN_NOT_FOUND", `Run not found: ${state.runId}`, {
        runId: state.runId
      });
    }

    if (state.version !== current.version) {
      throw new AgentKernelError(
        "STATE_VERSION_CONFLICT",
        `State version conflict for run: ${state.runId}`,
        {
          runId: state.runId,
          expectedVersion: current.version,
          receivedVersion: state.version
        }
      );
    }

    const updated = cloneState({
      ...state,
      updatedAt: this.#clock.now(),
      version: state.version + 1
    });
    this.#states.set(updated.runId, updated);

    return cloneState(updated);
  }

  async appendLog(input: AppendLogInput): Promise<ExecutionLogEntry> {
    const log = this.#logs.get(input.runId);
    if (log === undefined) {
      throw new AgentKernelError("RUN_NOT_FOUND", `Run not found: ${input.runId}`, {
        runId: input.runId
      });
    }

    const entry: ExecutionLogEntry = {
      ...input,
      traceId: input.traceId ?? this.#traceIds.get(input.runId),
      schemaVersion: AGENT_KERNEL_SCHEMA_VERSION,
      sequence: log.length + 1
    };
    log.push(cloneLogEntry(entry));
    try {
      await this.#observer.emit({
        id: entry.id,
        runId: entry.runId,
        type: entry.type,
        timestamp: entry.timestamp,
        payload: entry.payload,
        traceId: entry.traceId,
        principalId: entry.principalId,
        tenantId: entry.tenantId,
        workspaceId: entry.workspaceId
      });
    } catch {
      // Observer delivery is best-effort; state and log writes remain authoritative.
    }

    return cloneLogEntry(entry);
  }

  async listLog(runId: string): Promise<ExecutionLogEntry[]> {
    const log = this.#logs.get(runId);
    if (log === undefined) {
      throw new AgentKernelError("RUN_NOT_FOUND", `Run not found: ${runId}`, { runId });
    }

    return log.map(cloneLogEntry);
  }
}
