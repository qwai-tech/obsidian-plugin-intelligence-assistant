import * as fs from 'node:fs';
import * as path from 'node:path';
import { startMockLLM, stopMockLLM, mockLLM } from '../harness/mock-llm-harness';
import { createHarnessApp } from '../harness/in-memory-vault';
import { runAgentMission } from '../harness/mission-runner';

describe('timing metrics (non-blocking record)', () => {
  beforeEach(async () => {
    await startMockLLM();
  });
  afterEach(async () => {
    await stopMockLLM();
  });

  it('records wall-clock for a representative mission', async () => {
    await mockLLM.toolCall('read_file', { path: 'a.md' });
    await mockLLM.toolCall('write_file', { path: 'b.md', content: 'y' });
    await mockLLM.replyWith('done');

    const t0 = process.hrtime.bigint();
    const outcome = await runAgentMission({
      app: createHarnessApp({ 'a.md': 'x' }),
      userMessage: 'read then write autonomously without confirmation',
      autonomousWrite: true,
    });
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    expect(outcome.error).toBeUndefined();
    const report = {
      ts: Date.now(),
      scenario: 'read-then-write',
      elapsedMs,
      steps: outcome.steps,
      toolCalls: outcome.toolCallCount,
    };
    fs.writeFileSync(path.join(__dirname, 'timing-report.json'), JSON.stringify(report, null, 2) + '\n');
    // eslint-disable-next-line no-console
    console.log(`[timing] ${report.scenario}: ${elapsedMs.toFixed(1)}ms, ${outcome.steps} turns`);
    expect(elapsedMs).toBeGreaterThan(0);
  });
});
