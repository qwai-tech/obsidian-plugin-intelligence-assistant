import type { MissionOutcome } from './mission-runner';
import type { HarnessApp } from './in-memory-vault';

export interface MissionBudget {
  steps?: number;
  tokens?: number;
  wallMs?: number;
}

/** Declarative mission definition consumed by later plans. */
export interface MissionDefinition {
  name: string;
  userMessage: string;
  seed: Record<string, string>;
  autonomousWrite?: boolean;
  enabledTools?: string[];
  trajectory: Array<
    | { type: 'tool'; name: string; args: Record<string, unknown> }
    | { type: 'final'; text: string }
  >;
  expect: {
    toolSequence?: string[];
    finalContains?: string;
    vaultFiles?: Array<{ path: string; contains: string }>;
  };
  budget?: MissionBudget;
}

export function assertToolSequence(outcome: MissionOutcome, expected: string[]): void {
  const actual = outcome.toolCalls.map((t) => t.toolName);
  const matches = actual.length === expected.length && expected.every((name, i) => actual[i] === name);
  if (!matches) {
    throw new Error(`expected tool sequence ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

export function assertVaultFileContains(app: HarnessApp, path: string, needle: string): void {
  const snapshot = app.__vault.snapshot();
  const content = snapshot[path];
  if (content === undefined) throw new Error(`vault file not found: ${path}`);
  if (!content.includes(needle)) {
    throw new Error(`vault file ${path} does not contain ${JSON.stringify(needle)}`);
  }
}

export function assertWithinBudget(outcome: MissionOutcome, budget: MissionBudget): void {
  if (budget.steps !== undefined && outcome.steps > budget.steps) {
    throw new Error(`step budget exceeded: ${outcome.steps} > ${budget.steps}`);
  }
}
