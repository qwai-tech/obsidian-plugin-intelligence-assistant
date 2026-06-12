import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertVaultFileContains, assertWithinBudget, type MissionDefinition } from '../../harness/mission-types';

const M1: MissionDefinition = {
  name: 'M1 read-then-write-summary',
  userMessage: 'Read source.md and write a summary to summary.md. Do it autonomously without confirmation.',
  seed: { 'source.md': 'The mitochondria is the powerhouse of the cell. SOURCE_FACT.' },
  autonomousWrite: true,
  trajectory: [
    { type: 'tool', name: 'read_file', args: { path: 'source.md' } },
    { type: 'tool', name: 'write_file', args: { path: 'summary.md', content: 'Summary: SOURCE_FACT.' } },
    { type: 'final', text: 'Wrote summary.md.' },
  ],
  expect: { toolSequence: ['read_file', 'write_file'], vaultFiles: [{ path: 'summary.md', contains: 'SOURCE_FACT' }] },
  budget: { steps: 3 },
};

describe(M1.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('reads the source and autonomously writes a derived summary', async () => {
    for (const t of M1.trajectory) { if (t.type === 'tool') await mockLLM.toolCall(t.name, t.args); else await mockLLM.replyWith(t.text); }
    const app = createHarnessApp(M1.seed);
    const outcome = await runAgentMission({ app, userMessage: M1.userMessage, autonomousWrite: true });
    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, M1.expect.toolSequence!);
    for (const f of M1.expect.vaultFiles!) assertVaultFileContains(app, f.path, f.contains);
    assertWithinBudget(outcome, M1.budget!);
  });
});
