import { isDelegationAction } from "./delegation";
import type {
  Action,
  Agent,
  AgentState,
  HostContext,
  JsonObject,
  PolicyDecision
} from "./contracts";

export type PolicyInput = {
  action: Action;
  state: AgentState;
  agent?: Agent;
  host?: HostContext;
  mode?: string;
};

export type PolicyManager = {
  validate(input: PolicyInput): Promise<PolicyDecision>;
};

export type PolicyRule = {
  name: string;
  stage?: string;
  evaluate(input: PolicyInput): PolicyDecision | undefined | Promise<PolicyDecision | undefined>;
};

export type PolicyPipelineOptions = {
  rules: PolicyRule[];
  mode?: string;
};

export class PolicyPipeline implements PolicyManager {
  readonly #rules: PolicyRule[];
  readonly #mode?: string;

  constructor(options: PolicyPipelineOptions) {
    this.#rules = [...options.rules];
    this.#mode = options.mode;
  }

  async validate(input: PolicyInput): Promise<PolicyDecision> {
    const decisions: Array<{ rule: PolicyRule; decision: PolicyDecision }> = [];
    for (const rule of this.#rules) {
      const decision = await rule.evaluate(input);
      if (decision !== undefined) {
        decisions.push({ rule, decision });
      }
    }

    if (decisions.length === 0) {
      return {
        decision: "deny",
        reason: "no_policy_rule_matched",
        sources: ["policy"],
        violations: ["no_policy_rule_matched"]
      };
    }

    const selected = [...decisions].sort(
      (a, b) => decisionRank(b.decision) - decisionRank(a.decision)
    )[0]!;
    return withPolicyMetadata(
      selected.decision,
      selected.rule,
      decisions.map((item) => ({
        name: item.rule.name,
        stage: item.rule.stage,
        decision: item.decision.decision,
        reason: item.decision.reason
      })),
      input.mode ?? this.#mode
    );
  }
}

export type BasicPolicyConfig = {
  maxSteps: number;
  allowedTools: string[];
  requireApprovalForTools?: string[];
  maxFailures?: number;
  maxChildRuns?: number;
  maxDelegationDepth?: number;
  requireApprovalForDelegation?: boolean;
};

export type PermissionMode = "default" | "allow" | "deny" | "ask" | "auto" | "headless";

export type PermissionPolicyConfig = BasicPolicyConfig & {
  mode?: PermissionMode;
  promptAvailable?: boolean;
  readOnlyTools?: string[];
  deniedTools?: string[];
  bypassImmuneApprovalTools?: string[];
  classifier?: (input: PolicyInput) => PolicyDecision | undefined | Promise<PolicyDecision | undefined>;
};

export class BasicPolicy implements PolicyManager {
  constructor(private readonly config: BasicPolicyConfig) {}

  async validate({ action, state }: PolicyInput): Promise<PolicyDecision> {
    if (isDelegationAction(action)) {
      return delegationDecision(action, state, this.config);
    }

    if (action.type !== "tool_call") {
      return {
        decision: "allow",
        reason: "non_tool_action",
        sources: ["policy"]
      };
    }

    if (state.step >= this.config.maxSteps) {
      return {
        decision: "stop",
        reason: "max_steps_reached",
        sources: ["budget"]
      };
    }

    if (
      this.config.maxFailures !== undefined &&
      state.failureCount >= this.config.maxFailures
    ) {
      return {
        decision: "stop",
        reason: "max_failures_reached",
        sources: ["budget"]
      };
    }

    if (!this.config.allowedTools.includes(action.toolName)) {
      return {
        decision: "deny",
        reason: "tool_not_allowed",
        sources: ["policy"],
        violations: ["tool_not_allowed"]
      };
    }

    if (this.config.requireApprovalForTools?.includes(action.toolName)) {
      return {
        decision: "require_approval",
        reason: "tool_requires_approval",
        sources: ["policy"],
        approvalRequest: {
          id: `approval-${action.id}`,
          action,
          reason: "tool_requires_approval",
          createdAt: action.createdAt
        }
      };
    }

    return {
      decision: "allow",
      reason: "tool_allowed",
      sources: ["policy"]
    };
  }
}

export class PermissionPolicy implements PolicyManager {
  readonly #config: PermissionPolicyConfig;

  constructor(config: PermissionPolicyConfig) {
    this.#config = {
      promptAvailable: true,
      ...config
    };
  }

  async validate(input: PolicyInput): Promise<PolicyDecision> {
    const { action, state } = input;
    const mode = normalizeMode(input.mode ?? this.#config.mode ?? "default");

    if (action.type !== "tool_call") {
      return withModeMetadata(
        {
          decision: "allow",
          reason: "non_tool_action",
          sources: ["policy"]
        },
        mode
      );
    }

    if (isDelegationAction(action)) {
      return withModeMetadata(
        delegationDecision(action, state, this.#config),
        mode
      );
    }

    const budget = budgetDecision(action, state, this.#config);
    if (budget !== undefined) {
      return withModeMetadata(budget, mode);
    }

    if (!this.#config.allowedTools.includes(action.toolName)) {
      return withModeMetadata(deny("tool_not_allowed", ["policy"]), mode);
    }

    if (this.#config.deniedTools?.includes(action.toolName)) {
      return withModeMetadata(deny("tool_explicitly_denied", ["policy"]), mode);
    }

    if (this.#config.bypassImmuneApprovalTools?.includes(action.toolName)) {
      return withModeMetadata(
        approval("bypass_immune_safety_approval", ["safety"], action),
        mode
      );
    }

    if (mode === "deny") {
      return withModeMetadata(deny("mode_denies_tools", ["policy"]), mode);
    }

    if (this.#config.requireApprovalForTools?.includes(action.toolName)) {
      return withModeMetadata(
        promptOrDeny("tool_requires_approval", action, this.#config),
        mode
      );
    }

    switch (mode) {
      case "ask":
        return withModeMetadata(
          promptOrDeny("mode_requires_approval", action, this.#config),
          mode
        );
      case "headless":
        if (isReadOnlyTool(action.toolName, this.#config)) {
          return withModeMetadata(
            {
              decision: "allow",
              reason: "headless_read_allowed",
              sources: ["policy"]
            },
            mode
          );
        }

        return withModeMetadata(deny("headless_write_denied", ["policy"]), mode);
      case "allow":
        return withModeMetadata(
          {
            decision: "allow",
            reason: "mode_allows_tool",
            sources: ["policy"]
          },
          mode
        );
      case "auto": {
        if (isReadOnlyTool(action.toolName, this.#config)) {
          return withModeMetadata(
            {
              decision: "allow",
              reason: "auto_read_allowed",
              sources: ["classifier"]
            },
            mode
          );
        }

        const classified = await this.#config.classifier?.(input);
        if (classified !== undefined) {
          return withModeMetadata(classified, mode);
        }

        return withModeMetadata(
          promptOrDeny("auto_write_requires_approval", action, this.#config),
          mode
        );
      }
      case "default":
        return withModeMetadata(
          {
            decision: "allow",
            reason: "tool_allowed",
            sources: ["policy"]
          },
          mode
        );
    }
  }
}

function decisionRank(decision: PolicyDecision): number {
  switch (decision.decision) {
    case "stop":
      return 4;
    case "deny":
      return 3;
    case "require_approval":
      return 2;
    case "allow":
      return 1;
  }
}

function withPolicyMetadata(
  decision: PolicyDecision,
  selectedRule: PolicyRule,
  matchedRules: Array<{
    name: string;
    stage?: string;
    decision: PolicyDecision["decision"];
    reason: string;
  }>,
  mode: string | undefined
): PolicyDecision {
  const policy: JsonObject = {
    selectedRule: selectedRule.name,
    matchedRules: matchedRules.map((rule) => {
      const item: JsonObject = {
        name: rule.name,
        decision: rule.decision,
        reason: rule.reason
      };
      if (rule.stage !== undefined) {
        item.stage = rule.stage;
      }

      return item;
    })
  };
  if (mode !== undefined) {
    policy.mode = mode;
  }
  if (selectedRule.stage !== undefined) {
    policy.selectedStage = selectedRule.stage;
  }

  return {
    ...decision,
    metadata: {
      ...decision.metadata,
      policy
    }
  };
}

function normalizeMode(mode: string): PermissionMode {
  switch (mode) {
    case "allow":
    case "deny":
    case "ask":
    case "auto":
    case "headless":
    case "default":
      return mode;
    default:
      return "default";
  }
}

function budgetDecision(
  action: Action,
  state: AgentState,
  config: BasicPolicyConfig
): PolicyDecision | undefined {
  if (!consumesStep(action)) {
    return undefined;
  }

  if (state.step >= config.maxSteps) {
    return {
      decision: "stop",
      reason: "max_steps_reached",
      sources: ["budget"]
    };
  }

  if (config.maxFailures !== undefined && state.failureCount >= config.maxFailures) {
    return {
      decision: "stop",
      reason: "max_failures_reached",
      sources: ["budget"]
    };
  }

  return undefined;
}

function delegationDecision(
  action: Extract<Action, { type: "spawn_subagent" | "join_subagent" | "cancel_subagent" }>,
  state: AgentState,
  config: BasicPolicyConfig
): PolicyDecision {
  const budget = budgetDecision(action, state, config);
  if (budget !== undefined) {
    return budget;
  }

  if (action.type === "spawn_subagent") {
    if (
      config.maxChildRuns !== undefined &&
      priorSpawnCount(state) >= config.maxChildRuns
    ) {
      return deny("max_child_runs_reached", ["budget"]);
    }

    if (
      config.maxDelegationDepth !== undefined &&
      delegationDepth(state) >= config.maxDelegationDepth
    ) {
      return deny("max_delegation_depth_reached", ["budget"]);
    }

    const disallowedTools = action.subagent.tools.filter(
      (toolName) => !config.allowedTools.includes(toolName)
    );
    if (disallowedTools.length > 0) {
      return {
        decision: "deny",
        reason: "delegation_tool_not_allowed",
        sources: ["policy"],
        violations: disallowedTools.map((toolName) =>
          `delegation_tool_not_allowed:${toolName}`
        )
      };
    }

    if (config.requireApprovalForDelegation === true) {
      return approval("delegation_requires_approval", ["policy"], action);
    }
  }

  return {
    decision: "allow",
    reason: "delegation_allowed",
    sources: ["policy"]
  };
}

function deny(reason: string, sources: string[]): PolicyDecision {
  return {
    decision: "deny",
    reason,
    sources,
    violations: [reason]
  };
}

function approval(
  reason: string,
  sources: string[],
  action: Action
): PolicyDecision {
  return {
    decision: "require_approval",
    reason,
    sources,
    approvalRequest: {
      id: `approval-${action.id}`,
      action,
      reason,
      createdAt: action.createdAt
    }
  };
}

function promptOrDeny(
  reason: string,
  action: Extract<Action, { type: "tool_call" }>,
  config: PermissionPolicyConfig
): PolicyDecision {
  if (config.promptAvailable === false) {
    return deny("approval_prompt_unavailable", ["policy"]);
  }

  return approval(reason, ["policy"], action);
}

function isReadOnlyTool(toolName: string, config: PermissionPolicyConfig): boolean {
  return config.readOnlyTools?.includes(toolName) ?? false;
}

function consumesStep(action: Action): boolean {
  return action.type === "tool_call" || isDelegationAction(action);
}

function priorSpawnCount(state: AgentState): number {
  return state.actions.filter((action) => action.type === "spawn_subagent").length;
}

function delegationDepth(state: AgentState): number {
  const direct = state.variables.delegationDepth;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  const nested = state.variables.delegation;
  if (
    nested !== null &&
    typeof nested === "object" &&
    !Array.isArray(nested) &&
    typeof nested.depth === "number" &&
    Number.isFinite(nested.depth)
  ) {
    return nested.depth;
  }

  return 0;
}

function withModeMetadata(
  decision: PolicyDecision,
  mode: PermissionMode
): PolicyDecision {
  return {
    ...decision,
    metadata: {
      ...decision.metadata,
      policy: {
        ...(isJsonObject(decision.metadata?.policy) ? decision.metadata.policy : {}),
        mode
      }
    }
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
