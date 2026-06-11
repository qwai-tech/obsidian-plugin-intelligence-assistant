import {
  isTerminalStatus,
  type Action,
  type Agent,
  type AgentEvent,
  type AgentResult,
  type AgentState,
  type ExecutionLogEntry,
  type HostContext,
  type JsonObject,
  type Observation,
  type PolicyDecision,
  type Principal,
  type RuntimeControl,
  type Task,
  type ToolCallAction
} from "./contracts";
import type { ApprovalProvider } from "./approval";
import type { CapabilityRegistry } from "./capabilities";
import { ContextBuilder } from "./context";
import { isDelegationAction, type DelegationManager } from "./delegation";
import { AgentKernelError } from "./errors";
import type { Clock, IdGenerator } from "./ids";
import { createDefaultClock, createRandomIdGenerator } from "./ids";
import type {
  ContextCompactionResult,
  MemoryGovernanceInput,
  MemoryManager
} from "./memory";
import type { Observer } from "./observer";
import type { Planner } from "./planner";
import type { PolicyManager } from "./policy";
import { InMemoryStateStore, type CreateStateInput, type StateStore } from "./state";
import { ToolRegistry, ToolScheduler } from "./tools";

export type AgentRunInput = {
  agent: Agent;
  task: Task;
  host: HostContext;
  runtime?: RuntimeControl;
};

export type AgentStepInput = AgentRunInput & {
  runId?: string;
};

export type AgentResumeInput = AgentRunInput & {
  runId: string;
};

export type ApprovalResolutionInput = AgentResumeInput & {
  approvalId: string;
  decision: "approved" | "rejected";
  approver: Principal;
  reason?: string;
  modifiedAction?: Action;
};

export type AgentStepCompletedResult = {
  status: "step_completed";
  state: AgentState;
};

export type AgentStepResult = AgentResult | AgentStepCompletedResult;

export type AgentEngineOptions = {
  planner: Planner;
  policy: PolicyManager;
  stateStore?: StateStore;
  memory?: MemoryManager;
  compactor?: RuntimeCompactor;
  toolRegistry?: ToolRegistry;
  observer?: Observer;
  approvalProvider?: ApprovalProvider;
  capabilityRegistry?: CapabilityRegistry;
  delegationManager?: DelegationManager;
  clock?: Clock;
  idGenerator?: IdGenerator;
};

export type RuntimeCompactor = {
  compact(input: MemoryGovernanceInput): Promise<ContextCompactionResult>;
};

export class AgentEngine {
  readonly #planner: Planner;
  readonly #policy: PolicyManager;
  readonly #stateStore: StateStore;
  readonly #contextBuilder: ContextBuilder;
  readonly #toolScheduler: ToolScheduler;
  readonly #compactor?: RuntimeCompactor;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #observer?: Observer;
  readonly #approvalProvider?: ApprovalProvider;
  readonly #delegationManager?: DelegationManager;
  readonly #emitObserverDirectly: boolean;

  constructor(options: AgentEngineOptions) {
    const toolRegistry = options.toolRegistry ?? new ToolRegistry();

    this.#planner = options.planner;
    this.#policy = options.policy;
    this.#clock = options.clock ?? createDefaultClock();
    this.#idGenerator = options.idGenerator ?? createRandomIdGenerator("event");
    this.#observer = options.observer;
    this.#approvalProvider = options.approvalProvider;
    this.#delegationManager = options.delegationManager;
    this.#compactor = options.compactor;
    this.#emitObserverDirectly =
      options.stateStore !== undefined && options.observer !== undefined;
    this.#stateStore =
      options.stateStore ??
      new InMemoryStateStore({
        observer: options.observer,
        clock: this.#clock
      });
    this.#contextBuilder = new ContextBuilder({
      memory: options.memory,
      tools: toolRegistry,
      capabilityRegistry: options.capabilityRegistry
    });
    this.#toolScheduler = new ToolScheduler({
      registry: toolRegistry,
      policy: this.#policy,
      clock: this.#clock,
      idGenerator: this.#idGenerator
    });
  }

  async run(input: AgentRunInput): Promise<AgentResult> {
    let state = await this.#createState({
      agent: input.agent,
      task: input.task,
      host: input.host
    });

    while (true) {
      const result = await this.#stepExisting(state, input);

      if (result.status !== "step_completed") {
        return result;
      }

      state = result.state;
    }
  }

  async step(input: AgentStepInput): Promise<AgentStepResult> {
    const state = input.runId
      ? await this.#loadBoundState(input.runId, input)
      : await this.#createState({
          agent: input.agent,
          task: input.task,
          host: input.host
        });

    return this.#stepExisting(state, input);
  }

  async resume(input: AgentResumeInput): Promise<AgentStepResult> {
    return this.step(input);
  }

  async resolveApproval(input: ApprovalResolutionInput): Promise<AgentStepResult> {
    let state = await this.#loadBoundState(input.runId, input);
    const approval = state.pendingApproval;
    if (state.status !== "waiting_for_approval" || approval === undefined) {
      return {
        status: "failed",
        error: "approval_not_pending",
        state
      };
    }

    if (approval.id !== input.approvalId) {
      return {
        status: "failed",
        error: "approval_id_mismatch",
        state
      };
    }

    if (input.decision === "rejected") {
      const reason = input.reason ?? "rejected";
      const stopped = await this.#saveStatus(state, "stopped");
      await this.#appendEvent(stopped, "approval_resolved", {
        approvalId: approval.id,
        decision: "rejected",
        approverId: input.approver.id,
        reason
      });
      await this.#appendEvent(stopped, "task_stopped", {
        reason: `approval_rejected:${reason}`
      });

      return {
        status: "stopped",
        reason: `approval_rejected:${reason}`,
        state: stopped
      };
    }

    if (
      input.modifiedAction !== undefined &&
      !sameJson(input.modifiedAction, approval.action)
    ) {
      return {
        status: "failed",
        error: "approval_modified_action_not_supported",
        state
      };
    }

    state = await this.#stateStore.save({
      ...withoutPendingApproval(state),
      status: "running"
    });
    await this.#appendEvent(state, "approval_resolved", {
      approvalId: approval.id,
      decision: "approved",
      approverId: input.approver.id
    });

    const decision: PolicyDecision = {
      decision: "allow",
      reason: "approval_granted",
      sources: ["approval"]
    };
    await this.#appendEvent(state, "policy_decision", policyPayload(approval.action, decision));

    return this.#executeApprovedAction(
      state,
      approval.action,
      input.agent,
      input.task,
      input.host,
      input.runtime,
      decision
    );
  }

  async stop(runId: string, reason = "stopped"): Promise<AgentResult> {
    const state = await this.#stateStore.load(runId);
    if (isTerminalStatus(state.status)) {
      return this.#resultForState(state) as AgentResult;
    }

    const stopped = await this.#saveStatus(state, "stopped");

    await this.#appendEvent(stopped, "task_stopped", { reason });

    return {
      status: "stopped",
      reason,
      state: stopped
    };
  }

  async #createState(input: CreateStateInput): Promise<AgentState> {
    const state = await this.#stateStore.create(input);
    await this.#emitCreatedStateEvent(state, input);

    return state;
  }

  async #loadBoundState(
    runId: string,
    input: AgentRunInput
  ): Promise<AgentState> {
    const state = await this.#stateStore.load(runId);
    assertRunContextMatches(state, input);

    return state;
  }

  async #stepExisting(
    initialState: AgentState,
    input: AgentRunInput
  ): Promise<AgentStepResult> {
    let state = initialState;

    if (state.status !== "running") {
      return this.#resultForState(state);
    }

    try {
      state = await this.#compactIfNeeded(state, input);
      const context = await this.#contextBuilder.build({
        agent: input.agent,
        task: input.task,
        state,
        host: input.host
      });
      await this.#appendEvent(state, "context_built", {
        step: state.step,
        remainingSteps: context.budgets.remainingSteps,
        availableTools: context.availableTools.map((tool) => tool.name)
      });
      if (context.retrievedMemory.length > 0) {
        const memoryPayload = {
          count: context.retrievedMemory.length,
          memoryIds: context.retrievedMemory.map((item) => item.id),
          totalContentBytes: context.retrievedMemory.reduce(
            (sum, item) => sum + textBytes(item.content),
            0
          )
        };
        await this.#appendEvent(state, "memory_retrieved", memoryPayload);
        await this.#appendEvent(state, "memory_injected", {
          ...memoryPayload,
          target: "planner_context"
        });
      }

      const action = await this.#planner.plan(context);
      await this.#appendEvent(state, "action_selected", actionPayload(action));

      const decision = await this.#policy.validate({
        action,
        state,
        agent: input.agent,
        host: input.host
      });
      await this.#appendEvent(state, "policy_decision", policyPayload(action, decision));

      if (decision.decision === "deny") {
        return this.#failState(state, decision.reason);
      }

      if (decision.decision === "stop") {
        return this.#stopState(state, decision.reason);
      }

      if (decision.decision === "require_approval") {
        state = await this.#recordAction(state, action);
        return this.#waitForApproval(state, decision.approvalRequest, input.host);
      }

      state = await this.#recordAction(state, action);

      if (action.type === "tool_call") {
        return this.#executeToolAction(state, action, input.host, input.runtime, decision);
      }

      if (isDelegationAction(action)) {
        return this.#executeDelegationAction(
          state,
          action,
          input.agent,
          input.task,
          input.host,
          input.runtime,
          decision
        );
      }

      switch (action.type) {
        case "final_answer":
          return this.#complete(state, action.content);
        case "ask_user":
          return this.#waitForUser(state, action.question);
        case "stop":
          return this.#stopState(state, action.reason);
        case "delegate":
          return this.#failState(state, "Delegate actions are not supported by core runtime");
      }
    } catch (error) {
      return this.#failState(state, errorMessage(error));
    }
  }

  async #compactIfNeeded(
    state: AgentState,
    input: AgentRunInput
  ): Promise<AgentState> {
    if (this.#compactor === undefined) {
      return state;
    }

    await this.#appendEvent(state, "compaction_started", {
      step: state.step
    });
    const sourceEventIds = await this.#sourceEventIds(state.runId);
    const result = await this.#compactor.compact({
      agent: input.agent,
      task: input.task,
      host: input.host,
      state,
      sourceEventIds
    });

    if (result.status !== "compacted") {
      await this.#appendEvent(state, "compaction_completed", {
        status: "skipped",
        reason: result.reason
      });
      return state;
    }

    const compacted = await this.#stateStore.save({
      ...state,
      variables: {
        ...state.variables,
        compactedContext: {
          summary: result.summary,
          boundary: structuredClone(result.boundary) as JsonObject
        }
      }
    });
    await this.#appendEvent(compacted, "compaction_completed", {
      status: "compacted",
      summaryBytes: textBytes(result.summary)
    });
    await this.#appendEvent(compacted, "compact_boundary", {
      summary: result.summary,
      boundary: structuredClone(result.boundary) as JsonObject
    });

    return compacted;
  }

  async #executeApprovedAction(
    state: AgentState,
    action: Action,
    agent: Agent,
    task: Task,
    host: HostContext,
    runtime: RuntimeControl | undefined,
    decision: PolicyDecision
  ): Promise<AgentStepResult> {
    if (action.type === "tool_call") {
      return this.#executeToolAction(state, action, host, runtime, decision);
    }

    if (isDelegationAction(action)) {
      return this.#executeDelegationAction(
        state,
        action,
        agent,
        task,
        host,
        runtime,
        decision
      );
    }

    switch (action.type) {
      case "final_answer":
        return this.#complete(state, action.content);
      case "ask_user":
        return this.#waitForUser(state, action.question);
      case "stop":
        return this.#stopState(state, action.reason);
      case "delegate":
        return this.#failState(state, "Delegate actions are not supported by core runtime");
    }
  }

  async #executeToolAction(
    state: AgentState,
    action: ToolCallAction,
    host: HostContext,
    runtime: RuntimeControl | undefined,
    decision: PolicyDecision
  ): Promise<AgentStepResult> {
    await this.#appendEvent(state, "tool_started", {
      actionId: action.id,
      toolName: action.toolName
    });

    const [observation] = await this.#toolScheduler.execute([
      {
        action,
        state,
        host,
        runtime,
        policyDecision: decision
      }
    ]);
    if (observation === undefined) {
      return this.#failState(state, "tool_scheduler_returned_no_observation");
    }

    await this.#appendEvent(
      state,
      observation.success ? "tool_completed" : "tool_failed",
      observationPayload(action, observation)
    );
    const saved = await this.#recordObservation(state, observation);
    await this.#appendEvent(saved, "observation_recorded", {
      actionId: action.id,
      observationId: observation.id,
      success: observation.success,
      observation: structuredClone(observation) as JsonObject
    });

    return {
      status: "step_completed",
      state: saved
    };
  }

  async #executeDelegationAction(
    state: AgentState,
    action: Extract<Action, { type: "spawn_subagent" | "join_subagent" | "cancel_subagent" }>,
    agent: Agent,
    task: Task,
    host: HostContext,
    runtime: RuntimeControl | undefined,
    decision: PolicyDecision
  ): Promise<AgentStepResult> {
    await this.#appendEvent(state, "delegation_started", {
      actionId: action.id,
      actionType: action.type,
      action: structuredClone(action) as JsonObject
    });

    if (this.#delegationManager === undefined) {
      await this.#appendEvent(state, "delegation_failed", {
        actionId: action.id,
        actionType: action.type,
        error: "delegation_manager_not_configured"
      });
      return this.#failState(state, "delegation_manager_not_configured");
    }

    const observation = await this.#delegationManager.execute({
      action,
      parent: {
        agent,
        task,
        state,
        host
      },
      runtime,
      policyDecision: decision
    });

    await this.#appendEvent(
      state,
      observation.success ? "delegation_completed" : "delegation_failed",
      observationPayload(action, observation)
    );
    const saved = await this.#recordObservation(state, observation, {
      countToolCall: false
    });
    await this.#appendEvent(saved, "observation_recorded", {
      actionId: action.id,
      observationId: observation.id,
      success: observation.success,
      observation: structuredClone(observation) as JsonObject
    });

    return {
      status: "step_completed",
      state: saved
    };
  }

  async #recordAction(state: AgentState, action: Action): Promise<AgentState> {
    return this.#stateStore.save({
      ...state,
      actions: [...state.actions, structuredClone(action)]
    });
  }

  async #recordObservation(
    state: AgentState,
    observation: Observation,
    options: { countToolCall?: boolean } = { countToolCall: true }
  ): Promise<AgentState> {
    return this.#stateStore.save({
      ...withoutPendingApproval(state),
      status: "running",
      observations: [...state.observations, structuredClone(observation)],
      failureCount: state.failureCount + (observation.success ? 0 : 1),
      step: state.step + 1,
      toolCallCount: state.toolCallCount + (options.countToolCall === false ? 0 : 1)
    });
  }

  async #complete(state: AgentState, output: string): Promise<AgentResult> {
    const completed = await this.#saveStatus(state, "completed");
    await this.#appendEvent(completed, "task_completed", { output });

    return {
      status: "completed",
      output,
      state: completed
    };
  }

  async #waitForUser(state: AgentState, question: string): Promise<AgentResult> {
    const waiting = await this.#saveStatus(state, "waiting_for_user");

    return {
      status: "waiting_for_user",
      output: question,
      state: waiting
    };
  }

  async #waitForApproval(
    state: AgentState,
    approvalRequest: NonNullable<AgentState["pendingApproval"]>,
    host: HostContext
  ): Promise<AgentResult> {
    const waiting = await this.#stateStore.save({
      ...state,
      status: "waiting_for_approval",
      pendingApproval: structuredClone(approvalRequest)
    });
    await this.#appendEvent(waiting, "approval_requested", {
      approvalId: approvalRequest.id,
      actionId: approvalRequest.action.id,
      reason: approvalRequest.reason,
      approvalRequest: structuredClone(approvalRequest) as JsonObject
    });
    await this.#approvalProvider?.submit({
      runId: waiting.runId,
      request: approvalRequest,
      host
    });

    return {
      status: "waiting_for_approval",
      approvalRequest,
      state: waiting
    };
  }

  async #stopState(state: AgentState, reason: string): Promise<AgentResult> {
    const stopped = await this.#saveStatus(state, "stopped");
    await this.#appendEvent(stopped, "task_stopped", { reason });

    return {
      status: "stopped",
      reason,
      state: stopped
    };
  }

  async #failState(state: AgentState, error: string): Promise<AgentResult> {
    const failed = await this.#saveStatus(state, "failed");
    await this.#appendEvent(failed, "task_failed", { error });

    return {
      status: "failed",
      error,
      state: failed
    };
  }

  async #saveStatus(
    state: AgentState,
    status: AgentState["status"]
  ): Promise<AgentState> {
    return this.#stateStore.save({
      ...withoutPendingApproval(state),
      status
    });
  }

  #resultForState(state: AgentState): AgentStepResult {
    switch (state.status) {
      case "completed": {
        const finalAnswer = [...state.actions]
          .reverse()
          .find((action) => action.type === "final_answer");

        return {
          status: "completed",
          output: finalAnswer?.type === "final_answer" ? finalAnswer.content : "",
          state
        };
      }
      case "stopped":
        return {
          status: "stopped",
          reason: "already_stopped",
          state
        };
      case "failed":
        return {
          status: "failed",
          error: "already_failed",
          state
        };
      case "waiting_for_user": {
        const question = [...state.actions]
          .reverse()
          .find((action) => action.type === "ask_user");

        return {
          status: "waiting_for_user",
          output: question?.type === "ask_user" ? question.question : "",
          state
        };
      }
      case "waiting_for_approval":
        if (state.pendingApproval !== undefined) {
          return {
            status: "waiting_for_approval",
            approvalRequest: state.pendingApproval,
            state
          };
        }

        return {
          status: "failed",
          error: "waiting_for_approval state is missing pendingApproval",
          state
        };
      case "running":
        return {
          status: "step_completed",
          state
        };
    }
  }

  async #appendEvent(
    state: AgentState,
    type: ExecutionLogEntry["type"],
    payload: JsonObject
  ): Promise<void> {
    const entry = await this.#stateStore.appendLog({
      id: this.#idGenerator.nextId(),
      runId: state.runId,
      type,
      timestamp: this.#clock.now(),
      payload,
      principalId: state.principalId,
      tenantId: state.tenantId,
      workspaceId: state.workspaceId
    });
    await this.#emitLogEntry(entry);
  }

  async #emitCreatedStateEvent(
    state: AgentState,
    input: CreateStateInput
  ): Promise<void> {
    if (!this.#emitObserverDirectly) {
      return;
    }

    try {
      const started = (await this.#stateStore.listLog(state.runId)).find(
        (entry) => entry.type === "task_started"
      );
      if (started !== undefined) {
        await this.#emitLogEntry(started);
        return;
      }
    } catch {
      // Fall back to a synthetic observer event; state creation already succeeded.
    }

    await this.#emitObserver({
      id: this.#idGenerator.nextId(),
      runId: state.runId,
      type: "task_started",
      timestamp: state.createdAt,
      payload: {
        agentId: input.agent.id,
        taskId: input.task.id
      },
      traceId: input.host.traceId,
      principalId: state.principalId,
      tenantId: state.tenantId,
      workspaceId: state.workspaceId
    });
  }

  async #emitLogEntry(entry: ExecutionLogEntry): Promise<void> {
    if (!this.#emitObserverDirectly) {
      return;
    }

    // Strip the internal envelope fields before emitting to observers.
    const { schemaVersion: _schemaVersion, sequence: _sequence, ...event } = entry;
    void _schemaVersion;
    void _sequence;
    await this.#emitObserver(event);
  }

  async #emitObserver(event: AgentEvent): Promise<void> {
    try {
      await this.#observer?.emit(event);
    } catch {
      // Observer delivery is best-effort; logs and state remain authoritative.
    }
  }

  async #sourceEventIds(runId: string): Promise<string[]> {
    try {
      return (await this.#stateStore.listLog(runId)).map((entry) => entry.id);
    } catch {
      return [];
    }
  }
}

export function createAgentEngine(options: AgentEngineOptions): AgentEngine {
  return new AgentEngine(options);
}

type RunContextMismatch = {
  field: string;
  expected: string | null;
  received: string | null;
};

function assertRunContextMatches(state: AgentState, input: AgentRunInput): void {
  const mismatches: RunContextMismatch[] = [];

  addMismatch(mismatches, "agent.id", state.agentId, input.agent.id);
  addMismatch(mismatches, "task.id", state.taskId, input.task.id);
  addMismatch(mismatches, "host.tenantId", state.tenantId, input.host.tenantId);
  addMismatch(
    mismatches,
    "host.workspaceId",
    state.workspaceId,
    input.host.workspaceId
  );
  addMismatch(
    mismatches,
    "host.principal.id",
    state.principalId,
    input.host.principal.id
  );

  if (mismatches.length === 0) {
    return;
  }

  throw new AgentKernelError("RUN_CONTEXT_MISMATCH", "Run context mismatch", {
    runId: state.runId,
    mismatches: mismatches.map((mismatch) => ({ ...mismatch }))
  });
}

function addMismatch(
  mismatches: RunContextMismatch[],
  field: string,
  expected: string | undefined,
  received: string | undefined
): void {
  if (expected === received) {
    return;
  }

  mismatches.push({ field, expected: expected ?? null, received: received ?? null });
}

function actionPayload(action: Action): JsonObject {
  const payload: JsonObject = {
    actionId: action.id,
    actionType: action.type
  };

  if (action.type === "tool_call") {
    payload.toolName = action.toolName;
  }

  payload.action = structuredClone(action) as JsonObject;

  return payload;
}

function policyPayload(action: Action, decision: PolicyDecision): JsonObject {
  const payload: JsonObject = {
    actionId: action.id,
    decision: decision.decision,
    reason: decision.reason,
    sources: [...decision.sources]
  };

  if (decision.decision === "deny") {
    payload.violations = [...decision.violations];
  }

  if (decision.decision === "require_approval") {
    payload.approvalId = decision.approvalRequest.id;
    payload.approvalRequest = structuredClone(decision.approvalRequest) as JsonObject;
  }

  if (decision.metadata !== undefined) {
    payload.metadata = structuredClone(decision.metadata);
  }

  return payload;
}

function observationPayload(action: Action, observation: Observation): JsonObject {
  const payload: JsonObject = {
    actionId: action.id,
    observationId: observation.id,
    success: observation.success
  };

  if (action.type === "tool_call") {
    payload.toolName = action.toolName;
  }

  if (!observation.success && observation.error !== undefined) {
    payload.error = observation.error;
  }

  return payload;
}

function withoutPendingApproval(state: AgentState): AgentState {
  const next = { ...state };
  delete next.pendingApproval;

  return next;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function textBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
