export const AGENT_KERNEL_SCHEMA_VERSION = "2026-05-28.1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AgentStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "waiting_for_user"
  | "waiting_for_approval";

export function isTerminalStatus(status: AgentStatus): boolean {
  return status === "completed" || status === "failed" || status === "stopped";
}

export type Principal = {
  id: string;
  type: "user" | "service_account" | "scheduler" | "agent" | "system";
  tenantId: string;
  displayName?: string;
  roles?: string[];
  metadata?: JsonObject;
};

export type CredentialRef = {
  id: string;
  provider: string;
  scope: string;
  tenantId: string;
  workspaceId?: string;
  expiresAt?: string;
  metadata?: JsonObject;
};

export type EnvironmentDescriptor = {
  id: string;
  kind: string;
  tenantId: string;
  workspaceId?: string;
  networkPolicy?: JsonObject;
  sandboxPolicy?: JsonObject;
  metadata?: JsonObject;
};

export type HostContext = {
  tenantId: string;
  workspaceId?: string;
  principal: Principal;
  effectiveScopes: string[];
  credentialRefs?: CredentialRef[];
  traceId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  environment?: EnvironmentDescriptor;
  metadata?: JsonObject;
};

export type RuntimeControl = {
  abortSignal?: AbortSignal;
};

export type Agent = {
  id: string;
  name: string;
  role: string;
  goal: string;
  instructions: string;
  tools: string[];
  capabilities?: string[];
  memoryScope?: string;
  maxSteps?: number;
  metadata?: JsonObject;
};

export type Task = {
  id: string;
  input: string;
  createdAt?: string;
  metadata?: JsonObject;
};

export type Message = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  metadata?: JsonObject;
};

export type ToolCallAction = {
  id: string;
  type: "tool_call";
  reason?: string;
  reasoning?: string;
  toolName: string;
  arguments: JsonObject;
  idempotencyKey?: string;
  createdAt: string;
};

export type FinalAnswerAction = {
  id: string;
  type: "final_answer";
  reason?: string;
  reasoning?: string;
  content: string;
  artifacts?: string[];
  createdAt: string;
};

export type AskUserAction = {
  id: string;
  type: "ask_user";
  reason?: string;
  question: string;
  expectedResponseShape?: JsonObject;
  createdAt: string;
};

export type StopAction = {
  id: string;
  type: "stop";
  reason: string;
  createdAt: string;
};

export type DelegateAction = {
  id: string;
  type: "delegate";
  reason?: string;
  targetAgentId: string;
  taskInput: string;
  createdAt: string;
};

export type SubagentTaskSpec = {
  id?: string;
  input: string;
  expectedOutputShape?: JsonObject;
  metadata?: JsonObject;
};

export type SubagentBudget = {
  maxSteps?: number;
  maxToolCalls?: number;
  maxRuntimeMs?: number;
  maxChildRuns?: number;
  maxConcurrentChildRuns?: number;
  maxDepth?: number;
};

export type SpawnSubagentAction = {
  id: string;
  type: "spawn_subagent";
  reason?: string;
  subagent: Agent;
  task: SubagentTaskSpec;
  budget?: SubagentBudget;
  joinStrategy?: "wait" | "async";
  createdAt: string;
};

export type JoinSubagentAction = {
  id: string;
  type: "join_subagent";
  reason?: string;
  subtaskId: string;
  createdAt: string;
};

export type CancelSubagentAction = {
  id: string;
  type: "cancel_subagent";
  reason: string;
  subtaskId: string;
  createdAt: string;
};

export type Action =
  | ToolCallAction
  | FinalAnswerAction
  | AskUserAction
  | StopAction
  | DelegateAction
  | SpawnSubagentAction
  | JoinSubagentAction
  | CancelSubagentAction;

export type Observation = {
  id: string;
  actionId: string;
  success: boolean;
  result?: JsonValue;
  error?: string;
  latencyMs?: number;
  startedAt: string;
  completedAt: string;
  retryCount?: number;
  metadata?: JsonObject;
};

export type MemoryItem = {
  id: string;
  scope: string;
  kind: "preference" | "fact" | "summary" | "lesson" | "artifact" | "transient";
  content: string;
  metadata?: JsonObject;
  sourceTaskId?: string;
  sourceObservationId?: string;
  sourceEventIds?: string[];
  visibility?: "private" | "project" | "team" | string;
  confidence?: number;
  writePolicy?: "read_only" | "proposal_only" | "agent_write" | "human_approved" | string;
  embeddingRef?: string;
  supersedes?: string;
  createdAt: string;
  expiresAt?: string;
  tombstonedAt?: string;
  score?: number;
};

export type PolicyDecision =
  | { decision: "allow"; reason: string; sources: string[]; metadata?: JsonObject }
  | {
      decision: "deny";
      reason: string;
      sources: string[];
      violations: string[];
      metadata?: JsonObject;
    }
  | {
      decision: "require_approval";
      reason: string;
      sources: string[];
      approvalRequest: ApprovalRequest;
      metadata?: JsonObject;
    }
  | { decision: "stop"; reason: string; sources: string[]; metadata?: JsonObject };

export type ApprovalRequest = {
  id: string;
  action: Action;
  reason: string;
  createdAt: string;
};

export type ExecutionLogEntry = {
  schemaVersion: typeof AGENT_KERNEL_SCHEMA_VERSION;
  id: string;
  runId: string;
  sequence: number;
  type:
    | "task_started"
    | "context_built"
    | "memory_injected"
    | "memory_retrieved"
    | "memory_written"
    | "memory_write_proposed"
    | "memory_superseded"
    | "memory_tombstoned"
    | "compaction_started"
    | "compaction_completed"
    | "compact_boundary"
    | "action_selected"
    | "policy_decision"
    | "approval_requested"
    | "approval_resolved"
    | "delegation_started"
    | "delegation_completed"
    | "delegation_failed"
    | "tool_started"
    | "tool_completed"
    | "tool_failed"
    | "observation_recorded"
    | "coordination_event"
    | "state_snapshot"
    | "task_completed"
    | "task_stopped"
    | "task_failed";
  timestamp: string;
  payload: JsonObject;
  traceId?: string;
  principalId: string;
  tenantId: string;
  workspaceId?: string;
  redactionPolicy?: "none" | "redact_payload";
};

export type AgentEvent = Omit<ExecutionLogEntry, "schemaVersion" | "sequence"> & {
  agentId?: string;
  taskId?: string;
  step?: number;
};

export type AgentState = {
  taskId: string;
  agentId: string;
  runId: string;
  tenantId: string;
  workspaceId?: string;
  principalId: string;
  effectiveScopes: string[];
  status: AgentStatus;
  step: number;
  messages: Message[];
  actions: Action[];
  observations: Observation[];
  variables: JsonObject;
  failureCount: number;
  toolCallCount: number;
  pendingApproval?: ApprovalRequest;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type AgentContext = {
  agent: Agent;
  task: Task;
  host: HostContext;
  state: AgentContextState;
  recentMessages: Message[];
  recentActions: Action[];
  recentObservations: Observation[];
  retrievedMemory: MemoryItem[];
  availableTools: ToolDescription[];
  capabilities?: CapabilityDescriptor[];
  budgets: {
    maxSteps: number;
    remainingSteps: number;
  };
};

export type AgentContextState = {
  taskId: string;
  agentId: string;
  runId: string;
  tenantId: string;
  workspaceId?: string;
  principalId: string;
  effectiveScopes: string[];
  status: AgentStatus;
  step: number;
  variables: JsonObject;
  failureCount: number;
  toolCallCount: number;
  pendingApproval?: ApprovalRequest;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type ToolDescription = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  sideEffectLevel: "none" | "read" | "write" | "destructive";
  requiredScopes: string[];
};

export type CapabilityKind =
  | "model"
  | "tool"
  | "memory"
  | "planner"
  | "policy"
  | "observer"
  | "environment"
  | "scheduler"
  | string;

export type CapabilityDescriptor = {
  id: string;
  kind: CapabilityKind;
  version: string;
  owner: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  sideEffectLevel: "none" | "read" | "write" | "destructive";
  requiredScopes: string[];
  requiredCredentials: CredentialRef[];
  runtimeTraits: JsonObject;
  costModel: JsonObject;
  limits: JsonObject;
  auditPolicy: JsonObject;
  dependencies?: CapabilityRequirement[];
  requiredEnvironmentKinds?: string[];
  metadata?: JsonObject;
};

export type CapabilityRequirement = {
  id: string;
  kind?: CapabilityKind;
  version?: string;
};

export type AgentResult =
  | { status: "completed"; output: string; state: AgentState }
  | { status: "stopped"; reason: string; state: AgentState }
  | { status: "failed"; error: string; state: AgentState }
  | { status: "waiting_for_user"; output: string; state: AgentState }
  | { status: "waiting_for_approval"; approvalRequest: ApprovalRequest; state: AgentState };
