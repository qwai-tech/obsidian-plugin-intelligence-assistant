import { createHarnessApp } from '../../harness/in-memory-vault';
import { startMockLLM, stopMockLLM, mockLLM } from '../../harness/mock-llm-harness';
import { runAgentMission } from '../../harness/mission-runner';
import { assertToolSequence, assertVaultFileContains, assertWithinBudget, type MissionDefinition } from '../../harness/mission-types';

const NOTES = ['n1.md', 'n2.md', 'n3.md'];
const M4: MissionDefinition = {
  name: 'M4 batch-rewrite-three-notes',
  userMessage: 'Prefix every note with "REVIEWED: ". Do it autonomously without confirmation.',
  seed: { 'n1.md': 'alpha', 'n2.md': 'beta', 'n3.md': 'gamma' },
  autonomousWrite: true,
  trajectory: [
    { type: 'tool', name: 'write_file', args: { path: 'n1.md', content: 'REVIEWED: alpha' } },
    { type: 'tool', name: 'write_file', args: { path: 'n2.md', content: 'REVIEWED: beta' } },
    { type: 'tool', name: 'write_file', args: { path: 'n3.md', content: 'REVIEWED: gamma' } },
    { type: 'final', text: 'Reviewed all three notes.' },
  ],
  expect: { toolSequence: ['write_file', 'write_file', 'write_file'], vaultFiles: NOTES.map((p) => ({ path: p, contains: 'REVIEWED: ' })) },
  budget: { steps: 4 },
};

describe(M4.name, () => {
  beforeEach(async () => { await startMockLLM(); });
  afterEach(async () => { await stopMockLLM(); });
  it('rewrites all three notes within the step budget (efficiency + reliability)', async () => {
    for (const t of M4.trajectory) { if (t.type === 'tool') await mockLLM.toolCall(t.name, t.args); else await mockLLM.replyWith(t.text); }
    const app = createHarnessApp(M4.seed);
    const outcome = await runAgentMission({ app, userMessage: M4.userMessage, autonomousWrite: true });
    expect(outcome.error).toBeUndefined();
    assertToolSequence(outcome, M4.expect.toolSequence!);
    for (const f of M4.expect.vaultFiles!) assertVaultFileContains(app, f.path, f.contains);
    expect(outcome.toolCallCount).toBe(3);
    assertWithinBudget(outcome, M4.budget!);
  });
});
