import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertVaultFileContains, type MissionDefinition } from '../../harness/mission-types';

const PM2: MissionDefinition = {
  name: 'PM2 autonomous-write',
  userMessage: 'Create summary.md with the text DONE_SENTINEL. Do it autonomously without confirmation.',
  seed: {},
  autonomousWrite: true,
  trajectory: [
    { type: 'tool', name: 'write_file', args: { path: 'summary.md', content: 'DONE_SENTINEL' } },
    { type: 'final', text: 'Created summary.md.' },
  ],
  expect: {
    toolSequence: ['write_file'],
    vaultFiles: [{ path: 'summary.md', contains: 'DONE_SENTINEL' }],
  },
  budget: { steps: 2 },
};

describe(PM2.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });

  it('auto-applies the write and the real vault reflects it', async () => {
    for (const turn of PM2.trajectory) {
      if (turn.type === 'tool') await mockLLM.toolCall(turn.name, turn.args);
      else await mockLLM.replyWith(turn.text);
    }

    const app = createHarnessApp(PM2.seed);
    const outcome = await runAgentMission({
      app,
      userMessage: PM2.userMessage,
      autonomousWrite: PM2.autonomousWrite,
    });

    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, PM2.expect.toolSequence!);
    for (const file of PM2.expect.vaultFiles!) {
      assertVaultFileContains(app, file.path, file.contains);
    }
  });
});
