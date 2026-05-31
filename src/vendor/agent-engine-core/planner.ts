import type { Action, AgentContext } from "./contracts";

export type Planner = {
  plan(context: AgentContext): Action | Promise<Action>;
};

export class FakePlanner implements Planner {
  readonly contexts: AgentContext[] = [];
  readonly #actions: Action[];

  constructor(actions: Action[] = []) {
    this.#actions = actions.map(cloneAction);
  }

  push(action: Action): void {
    this.#actions.push(cloneAction(action));
  }

  async plan(context: AgentContext): Promise<Action> {
    this.contexts.push(structuredClone(context));
    const action = this.#actions.shift();
    if (action === undefined) {
      throw new Error("FakePlanner has no queued actions");
    }

    return cloneAction(action);
  }
}

export type RuleBasedPlannerAction =
  | Action
  | ((context: AgentContext) => Action | Promise<Action>);

export type RuleBasedPlannerRule = {
  name?: string;
  when: (context: AgentContext) => boolean | Promise<boolean>;
  action: RuleBasedPlannerAction;
};

export type RuleBasedPlannerOptions = {
  rules: RuleBasedPlannerRule[];
  fallback?: RuleBasedPlannerAction;
};

export class RuleBasedPlanner implements Planner {
  readonly #rules: RuleBasedPlannerRule[];
  readonly #fallback?: RuleBasedPlannerAction;

  constructor(rulesOrOptions: RuleBasedPlannerRule[] | RuleBasedPlannerOptions) {
    if (Array.isArray(rulesOrOptions)) {
      this.#rules = [...rulesOrOptions];
      return;
    }

    this.#rules = [...rulesOrOptions.rules];
    this.#fallback = rulesOrOptions.fallback;
  }

  async plan(context: AgentContext): Promise<Action> {
    for (const rule of this.#rules) {
      if (await rule.when(context)) {
        return resolvePlannerAction(rule.action, context);
      }
    }

    if (this.#fallback !== undefined) {
      return resolvePlannerAction(this.#fallback, context);
    }

    throw new Error("RuleBasedPlanner found no matching rule");
  }
}

async function resolvePlannerAction(
  action: RuleBasedPlannerAction,
  context: AgentContext
): Promise<Action> {
  if (typeof action === "function") {
    return cloneAction(await action(context));
  }

  return cloneAction(action);
}

function cloneAction(action: Action): Action {
  return structuredClone(action);
}
