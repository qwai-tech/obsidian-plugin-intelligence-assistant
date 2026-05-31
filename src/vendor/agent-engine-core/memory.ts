import type {
  Agent,
  AgentState,
  HostContext,
  JsonObject,
  JsonValue,
  MemoryItem,
  Task
} from "./contracts";
import type { Clock, IdGenerator } from "./ids";
import { createDefaultClock, createRandomIdGenerator } from "./ids";

export type MemoryQuery = {
  tenantId: string;
  workspaceId?: string;
  scope?: string;
  text?: string;
  limit?: number;
};

export type MemoryManager = {
  retrieve(query: MemoryQuery): Promise<MemoryItem[]>;
  write(item: MemoryItem): Promise<void>;
};

export type MemoryWriteDecision =
  | {
      accepted: true;
      reason: string;
      candidate: MemoryItem;
    }
  | {
      accepted: false;
      reason: string;
      candidate: MemoryItem;
    };

export type MemorySupersedeResult = {
  oldId: string;
  newId: string;
  reason: string;
};

export type MemoryTombstoneResult = {
  id: string;
  reason: string;
};

export type MemoryExplainResult = {
  id: string;
  provenance: string[];
  item?: MemoryItem;
};

export type LongTermMemoryManager = MemoryManager & {
  proposeWrite(candidate: MemoryItem, sourceEventIds: string[]): Promise<MemoryWriteDecision>;
  supersede(
    oldId: string,
    replacement: MemoryItem,
    reason: string
  ): Promise<MemorySupersedeResult>;
  tombstone(id: string, reason: string): Promise<MemoryTombstoneResult>;
  explain(id: string): Promise<MemoryExplainResult>;
  export(scope: string): Promise<MemoryItem[]>;
};

export type MemoryGovernanceInput = {
  agent: Agent;
  task: Task;
  host: HostContext;
  state: AgentState;
  sourceEventIds?: string[];
};

export type MemorySummarizer = (input: MemoryGovernanceInput) => Promise<string>;

export type SessionMemoryExtractionResult =
  | { status: "skipped"; reason: "below_threshold" | "unsafe_tool_tail" | "empty_summary" }
  | { status: "extracted"; item: MemoryItem };

export type SessionMemoryExtractorOptions = {
  summarize: MemorySummarizer;
  clock?: Clock;
  idGenerator?: IdGenerator;
  minCompletedToolCalls?: number;
  maxContentBytes?: number;
};

export class SessionMemoryExtractor {
  readonly #summarize: MemorySummarizer;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #minCompletedToolCalls: number;
  readonly #maxContentBytes: number;

  constructor(options: SessionMemoryExtractorOptions) {
    this.#summarize = options.summarize;
    this.#clock = options.clock ?? createDefaultClock();
    this.#idGenerator = options.idGenerator ?? createRandomIdGenerator("memory");
    this.#minCompletedToolCalls = Math.max(0, options.minCompletedToolCalls ?? 1);
    this.#maxContentBytes = Math.max(1, options.maxContentBytes ?? 8_000);
  }

  async extract(input: MemoryGovernanceInput): Promise<SessionMemoryExtractionResult> {
    if (hasUnsafeToolTail(input.state)) {
      return { status: "skipped", reason: "unsafe_tool_tail" };
    }

    if (input.state.observations.length < this.#minCompletedToolCalls) {
      return { status: "skipped", reason: "below_threshold" };
    }

    const summary = trimByBytes((await this.#summarize(input)).trim(), this.#maxContentBytes);
    if (summary.length === 0) {
      return { status: "skipped", reason: "empty_summary" };
    }

    const lastObservation = input.state.observations[input.state.observations.length - 1];
    const item: MemoryItem = {
      id: this.#idGenerator.nextId(),
      scope: input.agent.memoryScope ?? agentMemoryScope(input.host, input.agent),
      kind: "summary",
      content: summary,
      metadata: {
        channel: "session"
      },
      sourceTaskId: input.task.id,
      sourceObservationId: lastObservation?.id,
      sourceEventIds: [...(input.sourceEventIds ?? [])],
      visibility: input.host.workspaceId === undefined ? "private" : "project",
      confidence: 0.5,
      writePolicy: "proposal_only",
      createdAt: this.#clock.now()
    };

    return { status: "extracted", item };
  }
}

export type CompactBoundary = {
  runId: string;
  sourceEventIds: string[];
  sourceMessageIds: string[];
  sourceActionIds: string[];
  sourceObservationIds: string[];
};

export type ContextCompactionResult =
  | {
      status: "skipped";
      reason:
        | "below_threshold"
        | "compaction_already_active"
        | "compaction_circuit_open"
        | "empty_summary";
    }
  | { status: "compacted"; summary: string; boundary: CompactBoundary };

export type ContextCompactorOptions = {
  summarize: MemorySummarizer;
  minMessages?: number;
  minActions?: number;
  maxConsecutiveFailures?: number;
  maxSummaryBytes?: number;
};

export class ContextCompactor {
  readonly #summarize: MemorySummarizer;
  readonly #minMessages: number;
  readonly #minActions: number;
  readonly #maxConsecutiveFailures: number;
  readonly #maxSummaryBytes: number;

  constructor(options: ContextCompactorOptions) {
    this.#summarize = options.summarize;
    this.#minMessages = Math.max(0, options.minMessages ?? 20);
    this.#minActions = Math.max(0, options.minActions ?? 0);
    this.#maxConsecutiveFailures = Math.max(1, options.maxConsecutiveFailures ?? 3);
    this.#maxSummaryBytes = Math.max(1, options.maxSummaryBytes ?? 12_000);
  }

  async compact(input: MemoryGovernanceInput): Promise<ContextCompactionResult> {
    if (input.state.variables.__compactionActive === true) {
      return { status: "skipped", reason: "compaction_already_active" };
    }

    const failures = numberVariable(input.state.variables.__compactionFailures);
    if (failures >= this.#maxConsecutiveFailures) {
      return { status: "skipped", reason: "compaction_circuit_open" };
    }

    if (
      input.state.messages.length < this.#minMessages &&
      input.state.actions.length < this.#minActions
    ) {
      return { status: "skipped", reason: "below_threshold" };
    }

    const summary = trimByBytes((await this.#summarize(input)).trim(), this.#maxSummaryBytes);
    if (summary.length === 0) {
      return { status: "skipped", reason: "empty_summary" };
    }

    return {
      status: "compacted",
      summary,
      boundary: {
        runId: input.state.runId,
        sourceEventIds: [...(input.sourceEventIds ?? [])],
        sourceMessageIds: input.state.messages.map((message) => message.id),
        sourceActionIds: input.state.actions.map((action) => action.id),
        sourceObservationIds: input.state.observations.map(
          (observation) => observation.id
        )
      }
    };
  }
}

export class NoopMemory implements MemoryManager {
  async retrieve(): Promise<MemoryItem[]> {
    return [];
  }

  async write(): Promise<void> {
    return undefined;
  }
}

export class InMemoryMemory implements MemoryManager {
  readonly #items = new Map<string, MemoryItem>();

  async retrieve(query: MemoryQuery): Promise<MemoryItem[]> {
    const limit = boundedLimit(query.limit ?? 10);
    const tenantWorkspacePrefix = memoryScopePrefix(query.tenantId, query.workspaceId);
    const scopePrefix = query.scope ?? tenantWorkspacePrefix;
    const searchText = query.text?.trim().toLowerCase();

    return [...this.#items.values()]
      .filter((item) => isWithinScope(item.scope, tenantWorkspacePrefix))
      .filter((item) => isWithinScope(item.scope, scopePrefix))
      .filter(
        (item) =>
          !searchText || item.content.toLowerCase().includes(searchText)
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit)
      .map(cloneMemoryItem);
  }

  async write(item: MemoryItem): Promise<void> {
    this.#items.set(memoryKey(item), cloneMemoryItem(item));
  }
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.floor(limit));
}

function memoryScopePrefix(tenantId: string, workspaceId?: string): string {
  return workspaceId ? `${tenantId}/${workspaceId}` : tenantId;
}

function agentMemoryScope(host: HostContext, agent: Agent): string {
  return [host.tenantId, host.workspaceId, agent.id].filter(Boolean).join("/");
}

function isWithinScope(scope: string, prefix: string): boolean {
  return scope === prefix || scope.startsWith(`${prefix}/`);
}

function memoryKey(item: MemoryItem): string {
  return `${item.scope}\0${item.id}`;
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

function hasUnsafeToolTail(state: AgentState): boolean {
  const lastAction = state.actions[state.actions.length - 1];
  if (lastAction?.type !== "tool_call") {
    return false;
  }

  return !state.observations.some((observation) => observation.actionId === lastAction.id);
}

function numberVariable(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function trimByBytes(value: string, maxBytes: number): string {
  let bytes = 0;
  let output = "";
  for (const char of value) {
    const charBytes = new TextEncoder().encode(char).byteLength;
    if (bytes + charBytes > maxBytes) {
      break;
    }

    bytes += charBytes;
    output += char;
  }

  return output;
}
