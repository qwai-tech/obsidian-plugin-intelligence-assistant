import type {
  Action,
  Agent,
  AgentState,
  CancelSubagentAction,
  HostContext,
  JoinSubagentAction,
  Observation,
  PolicyDecision,
  RuntimeControl,
  SpawnSubagentAction,
  Task
} from "./contracts";

export type DelegationAction =
  | SpawnSubagentAction
  | JoinSubagentAction
  | CancelSubagentAction;

export type DelegationParentContext = {
  agent: Agent;
  task: Task;
  state: AgentState;
  host: HostContext;
};

export type DelegationExecutionInput = {
  action: DelegationAction;
  parent: DelegationParentContext;
  runtime?: RuntimeControl;
  policyDecision?: PolicyDecision;
};

export type DelegationManager = {
  execute(input: DelegationExecutionInput): Promise<Observation>;
};

export function isDelegationAction(action: Action): action is DelegationAction {
  return (
    action.type === "spawn_subagent" ||
    action.type === "join_subagent" ||
    action.type === "cancel_subagent"
  );
}
