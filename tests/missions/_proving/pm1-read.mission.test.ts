import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertWithinBudget, type MissionDefinition } from '../../harness/mission-types';

const PM1: MissionDefinition = {
  name: 'PM1 read-and-report',
  userMessage: 'Read test-note.md and report the sentinel.',
  seed: { 'test-note.md': 'AGENT_TOOL_SENTINEL' },
  trajectory: [
    { type: 'tool', name: 'read_file', args: { path: 'test-note.md' } },
    { type: 'final', text: 'The note contains AGENT_TOOL_SENTINEL.' },
  ],
  expect: { toolSequence: ['read_file'], finalContains: 'AGENT_TOOL_SENTINEL' },
  budget: { steps: 2 },
};

describe(PM1.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('completes the mission within its oracle and budget', async () => {
    for (const turn of PM1.trajectory) {
      if (turn.type === 'tool') await mockLLM.toolCall(turn.name, turn.args);
      else await mockLLM.replyWith(turn.text);
    }

    const app = createHarnessApp(PM1.seed);
    const outcome = await runAgentMission({ app, userMessage: PM1.userMessage });

    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, PM1.expect.toolSequence!);
    expect(outcome.finalMessage?.content).toContain(PM1.expect.finalContains!);
    assertWithinBudget(outcome, PM1.budget!);
  });
});
