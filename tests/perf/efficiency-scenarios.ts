import { createHarnessApp } from '../harness/in-memory-vault';
import { mockLLM } from '../harness/mock-llm-harness';
import { runAgentMission, type MissionOutcome } from '../harness/mission-runner';

export interface EfficiencyMetric {
  steps: number;
  toolCalls: number;
}

export interface Scenario {
  name: string;
  run: () => Promise<MissionOutcome>;
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'single-read',
    run: async () => {
      await mockLLM.toolCall('read_file', { path: 'a.md' });
      await mockLLM.replyWith('done');
      return runAgentMission({ app: createHarnessApp({ 'a.md': 'x' }), userMessage: 'read a' });
    },
  },
  {
    name: 'read-then-write',
    run: async () => {
      await mockLLM.toolCall('read_file', { path: 'a.md' });
      await mockLLM.toolCall('write_file', { path: 'b.md', content: 'y' });
      await mockLLM.replyWith('done');
      return runAgentMission({
        app: createHarnessApp({ 'a.md': 'x' }),
        userMessage: 'read a then write b autonomously without confirmation',
        autonomousWrite: true,
      });
    },
  },
  {
    name: 'batch-five-writes',
    run: async () => {
      for (let i = 0; i < 5; i++) await mockLLM.toolCall('write_file', { path: `n${i}.md`, content: `v${i}` });
      await mockLLM.replyWith('done');
      return runAgentMission({
        app: createHarnessApp({}),
        userMessage: 'write five notes autonomously without confirmation',
        autonomousWrite: true,
      });
    },
  },
];

export function metric(outcome: MissionOutcome): EfficiencyMetric {
  return { steps: outcome.steps, toolCalls: outcome.toolCallCount };
}
