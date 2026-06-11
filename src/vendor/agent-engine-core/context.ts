import type {
  Agent,
  AgentContext,
  AgentContextState,
  AgentState,
  Action,
  HostContext,
  JsonObject,
  JsonValue,
  MemoryItem,
  Message,
  Observation,
  Task
} from "./contracts";
import type { CapabilityRegistry } from "./capabilities";
import { NoopMemory, type MemoryManager } from "./memory";
import { ToolRegistry } from "./tools";

export type ContextBuilderOptions = {
  memory?: MemoryManager;
  tools?: ToolRegistry;
  capabilityRegistry?: CapabilityRegistry;
  memoryLimit?: number;
  recentLimit?: number;
};

export type ContextBuilderInput = {
  agent: Agent;
  task: Task;
  state: AgentState;
  host: HostContext;
};

export class ContextBuilder {
  readonly #memory: MemoryManager;
  readonly #tools: ToolRegistry;
  readonly #capabilityRegistry?: CapabilityRegistry;
  readonly #memoryLimit: number;
  readonly #recentLimit: number;

  constructor(options: ContextBuilderOptions = {}) {
    this.#memory = options.memory ?? new NoopMemory();
    this.#tools = options.tools ?? new ToolRegistry();
    this.#capabilityRegistry = options.capabilityRegistry;
    this.#memoryLimit = boundedLimit(options.memoryLimit ?? 5);
    this.#recentLimit = boundedLimit(options.recentLimit ?? 10);
  }

  async build(input: ContextBuilderInput): Promise<AgentContext> {
    const retrievedMemory = await this.#memory.retrieve({
      tenantId: input.host.tenantId,
      workspaceId: input.host.workspaceId,
      scope: input.agent.memoryScope ?? agentMemoryScope(input.host, input.agent),
      text: input.task.input,
      limit: this.#memoryLimit
    });
    const maxSteps = input.agent.maxSteps ?? 0;

    return {
      agent: input.agent,
      task: input.task,
      host: jsonFriendlyHost(input.host),
      state: boundedState(input.state),
      recentMessages: recentItems(input.state.messages, this.#recentLimit).map(cloneMessage),
      recentActions: recentItems(input.state.actions, this.#recentLimit).map(cloneAction),
      recentObservations: recentItems(input.state.observations, this.#recentLimit).map(
        cloneObservation
      ),
      retrievedMemory: retrievedMemory.map(cloneMemoryItem),
      availableTools: this.#tools.describe(input.agent.tools),
      capabilities: describeAgentCapabilities(
        this.#capabilityRegistry,
        input.agent.capabilities,
        input.host
      ),
      budgets: {
        maxSteps,
        remainingSteps: Math.max(0, maxSteps - input.state.step)
      }
    };
  }
}

function describeAgentCapabilities(
  registry: CapabilityRegistry | undefined,
  ids: string[] | undefined,
  host: HostContext
) {
  if (registry === undefined || ids === undefined || ids.length === 0) {
    return [];
  }

  return registry.resolve({ ids, host }).capabilities;
}

function agentMemoryScope(host: HostContext, agent: Agent): string {
  return [host.tenantId, host.workspaceId, agent.id].filter(Boolean).join("/");
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.floor(limit));
}

function recentItems<T>(items: T[], limit: number): T[] {
  if (limit === 0) {
    return [];
  }

  return items.slice(-limit);
}

function boundedState(state: AgentState): AgentContextState {
  const contextState: AgentContextState = {
    taskId: state.taskId,
    agentId: state.agentId,
    runId: state.runId,
    tenantId: state.tenantId,
    principalId: state.principalId,
    effectiveScopes: [...state.effectiveScopes],
    status: state.status,
    step: state.step,
    variables: cloneJsonObject(state.variables),
    failureCount: state.failureCount,
    toolCallCount: state.toolCallCount,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    version: state.version
  };

  if (state.workspaceId !== undefined) {
    contextState.workspaceId = state.workspaceId;
  }

  if (state.pendingApproval !== undefined) {
    contextState.pendingApproval = cloneApprovalRequest(state.pendingApproval);
  }

  return contextState;
}

function cloneMessage(message: Message): Message {
  const cloned: Message = {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt
  };

  if (message.metadata !== undefined) {
    cloned.metadata = cloneJsonObject(message.metadata);
  }

  return cloned;
}

function cloneAction(action: Action): Action {
  return cloneJsonValue(action) as Action;
}

function cloneObservation(observation: Observation): Observation {
  return cloneJsonValue(observation) as Observation;
}

function cloneMemoryItem(item: MemoryItem): MemoryItem {
  const cloned: MemoryItem = {
    id: item.id,
    scope: item.scope,
    kind: item.kind,
    content: item.content,
    createdAt: item.createdAt
  };

  if (item.metadata !== undefined) {
    cloned.metadata = cloneJsonObject(item.metadata);
  }

  if (item.sourceTaskId !== undefined) {
    cloned.sourceTaskId = item.sourceTaskId;
  }

  if (item.sourceObservationId !== undefined) {
    cloned.sourceObservationId = item.sourceObservationId;
  }

  if (item.sourceEventIds !== undefined) {
    cloned.sourceEventIds = [...item.sourceEventIds];
  }

  if (item.visibility !== undefined) {
    cloned.visibility = item.visibility;
  }

  if (item.confidence !== undefined) {
    cloned.confidence = item.confidence;
  }

  if (item.writePolicy !== undefined) {
    cloned.writePolicy = item.writePolicy;
  }

  if (item.embeddingRef !== undefined) {
    cloned.embeddingRef = item.embeddingRef;
  }

  if (item.supersedes !== undefined) {
    cloned.supersedes = item.supersedes;
  }

  if (item.expiresAt !== undefined) {
    cloned.expiresAt = item.expiresAt;
  }

  if (item.tombstonedAt !== undefined) {
    cloned.tombstonedAt = item.tombstonedAt;
  }

  if (item.score !== undefined) {
    cloned.score = item.score;
  }

  return cloned;
}

function cloneApprovalRequest(
  approvalRequest: NonNullable<AgentContextState["pendingApproval"]>
): NonNullable<AgentContextState["pendingApproval"]> {
  return {
    id: approvalRequest.id,
    action: cloneAction(approvalRequest.action),
    reason: approvalRequest.reason,
    createdAt: approvalRequest.createdAt
  };
}

function jsonFriendlyHost(host: HostContext): HostContext {
  const contextHost: HostContext = {
    tenantId: host.tenantId,
    principal: {
      id: host.principal.id,
      type: host.principal.type,
      tenantId: host.principal.tenantId
    },
    effectiveScopes: [...host.effectiveScopes]
  };

  if (host.workspaceId !== undefined) {
    contextHost.workspaceId = host.workspaceId;
  }

  if (host.principal.displayName !== undefined) {
    contextHost.principal.displayName = host.principal.displayName;
  }

  if (host.principal.roles !== undefined) {
    contextHost.principal.roles = [...host.principal.roles];
  }

  if (host.principal.metadata !== undefined) {
    contextHost.principal.metadata = sanitizeJsonObject(host.principal.metadata);
  }

  if (host.credentialRefs !== undefined) {
    contextHost.credentialRefs = host.credentialRefs.map((credential) => {
      const credentialRef: NonNullable<HostContext["credentialRefs"]>[number] = {
        id: credential.id,
        provider: credential.provider,
        scope: credential.scope,
        tenantId: credential.tenantId
      };
      if (credential.workspaceId !== undefined) {
        credentialRef.workspaceId = credential.workspaceId;
      }
      if (credential.expiresAt !== undefined) {
        credentialRef.expiresAt = credential.expiresAt;
      }
      if (credential.metadata !== undefined) {
        credentialRef.metadata = sanitizeJsonObject(credential.metadata);
      }
      return credentialRef;
    });
  }

  if (host.traceId !== undefined) {
    contextHost.traceId = host.traceId;
  }

  if (host.correlationId !== undefined) {
    contextHost.correlationId = host.correlationId;
  }

  if (host.idempotencyKey !== undefined) {
    contextHost.idempotencyKey = host.idempotencyKey;
  }

  if (host.environment !== undefined) {
    contextHost.environment = {
      id: host.environment.id,
      kind: host.environment.kind,
      tenantId: host.environment.tenantId
    };
    if (host.environment.workspaceId !== undefined) {
      contextHost.environment.workspaceId = host.environment.workspaceId;
    }
    if (host.environment.networkPolicy !== undefined) {
      contextHost.environment.networkPolicy = sanitizeJsonObject(
        host.environment.networkPolicy
      );
    }
    if (host.environment.sandboxPolicy !== undefined) {
      contextHost.environment.sandboxPolicy = sanitizeJsonObject(
        host.environment.sandboxPolicy
      );
    }
    if (host.environment.metadata !== undefined) {
      contextHost.environment.metadata = sanitizeJsonObject(host.environment.metadata);
    }
  }

  if (host.metadata !== undefined) {
    contextHost.metadata = sanitizeJsonObject(host.metadata);
  }

  return contextHost;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
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

function sanitizeJsonObject(value: unknown): JsonObject {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nested]) => {
      const sanitized = sanitizeJsonValue(nested);
      return sanitized === undefined ? [] : [[key, sanitized]];
    })
  );
}

function sanitizeJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitized = sanitizeJsonValue(item);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  if (isPlainObject(value)) {
    return sanitizeJsonObject(value);
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
