import type {
  Action,
  AgentState,
  ApprovalRequest,
  ExecutionLogEntry,
  JsonObject,
  Observation
} from "./contracts";

export type ReplayAgentStateOptions = {
  variables?: JsonObject;
};

export function replayAgentStateFromLog(
  entries: ExecutionLogEntry[],
  options: ReplayAgentStateOptions = {}
): AgentState {
  if (entries.length === 0) {
    throw new Error("execution_log_empty");
  }

  const ordered = [...entries].sort((a, b) => a.sequence - b.sequence);
  const started = ordered.find((entry) => entry.type === "task_started");
  if (started === undefined) {
    throw new Error("task_started_not_found");
  }

  const agentId = stringPayload(started.payload.agentId);
  const taskId = stringPayload(started.payload.taskId);
  if (agentId === undefined || taskId === undefined) {
    throw new Error("task_started_identity_missing");
  }

  const state: AgentState = {
    taskId,
    agentId,
    runId: started.runId,
    tenantId: started.tenantId,
    workspaceId: started.workspaceId,
    principalId: started.principalId,
    effectiveScopes: stringArrayPayload(started.payload.effectiveScopes),
    status: "running",
    step: 0,
    messages: [],
    actions: [],
    observations: [],
    variables: structuredClone(options.variables ?? {}),
    failureCount: 0,
    toolCallCount: 0,
    createdAt: started.timestamp,
    updatedAt: ordered[ordered.length - 1]?.timestamp ?? started.timestamp,
    version: ordered.length
  };

  for (const entry of ordered) {
    applyEntry(state, entry);
  }

  return structuredClone(state);
}

function applyEntry(state: AgentState, entry: ExecutionLogEntry): void {
  state.updatedAt = entry.timestamp;

  switch (entry.type) {
    case "action_selected": {
      const action = actionPayload(entry.payload.action);
      if (action !== undefined && !state.actions.some((item) => item.id === action.id)) {
        state.actions.push(action);
      }
      if (action?.type === "ask_user" && state.status === "running") {
        state.status = "waiting_for_user";
      }
      return;
    }
    case "policy_decision": {
      if (entry.payload.decision === "require_approval") {
        const approval = approvalPayload(entry.payload.approvalRequest);
        if (approval !== undefined) {
          state.pendingApproval = approval;
          state.status = "waiting_for_approval";
        }
      }
      return;
    }
    case "approval_requested": {
      const approval = approvalPayload(entry.payload.approvalRequest);
      if (approval !== undefined) {
        state.pendingApproval = approval;
        state.status = "waiting_for_approval";
      }
      return;
    }
    case "approval_resolved": {
      delete state.pendingApproval;
      if (entry.payload.decision === "approved") {
        state.status = "running";
      }
      return;
    }
    case "observation_recorded": {
      const observation = observationPayload(entry.payload.observation);
      if (
        observation !== undefined &&
        !state.observations.some((item) => item.id === observation.id)
      ) {
        state.observations.push(observation);
        state.step += 1;
        if (countsAsToolCall(state, observation)) {
          state.toolCallCount += 1;
        }
        if (!observation.success) {
          state.failureCount += 1;
        }
      }
      if (state.status !== "failed" && state.status !== "stopped") {
        state.status = "running";
      }
      return;
    }
    case "compact_boundary": {
      const summary = stringPayload(entry.payload.summary);
      state.variables.compactedContext = {
        summary: summary ?? "",
        boundary: cloneJsonObject(entry.payload.boundary)
      };
      return;
    }
    case "task_completed":
      state.status = "completed";
      delete state.pendingApproval;
      return;
    case "task_stopped":
      state.status = "stopped";
      delete state.pendingApproval;
      return;
    case "task_failed":
      state.status = "failed";
      delete state.pendingApproval;
      return;
    default:
      return;
  }
}

function actionPayload(value: unknown): Action | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") {
    return undefined;
  }

  return structuredClone(value) as Action;
}

function approvalPayload(value: unknown): ApprovalRequest | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return undefined;
  }
  const action = actionPayload(value.action);
  if (action === undefined) {
    return undefined;
  }

  return {
    id: value.id,
    action,
    reason: value.reason,
    createdAt: value.createdAt
  };
}

function observationPayload(value: unknown): Observation | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.actionId !== "string" ||
    typeof value.success !== "boolean" ||
    typeof value.startedAt !== "string" ||
    typeof value.completedAt !== "string"
  ) {
    return undefined;
  }

  return structuredClone(value) as Observation;
}

function countsAsToolCall(state: AgentState, observation: Observation): boolean {
  const action = state.actions.find((item) => item.id === observation.actionId);
  return action === undefined || action.type === "tool_call";
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayPayload(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function cloneJsonObject(value: unknown): JsonObject {
  return isRecord(value) ? (structuredClone(value) as JsonObject) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
