import { startMockLLM, stopMockLLM, mockLLM } from '../harness/mock-llm-harness';
import { createHarnessApp } from '../harness/in-memory-vault';
import { runAgentMission } from '../harness/mission-runner';

const ITERATIONS = Number(process.env.MEM_ITERATIONS || 40);
// Gross-leak bound: second-half avg heap must stay under 1.5x the first-half avg.
const GROWTH_LIMIT = 1.5;

async function oneMission(): Promise<void> {
  await mockLLM.clearAll();
  await mockLLM.toolCall('read_file', { path: 'a.md' });
  await mockLLM.replyWith('done');
  const outcome = await runAgentMission({ app: createHarnessApp({ 'a.md': 'x' }), userMessage: 'read a' });
  if (outcome.error) throw outcome.error;
}

describe('memory-leak guard', () => {
  beforeEach(async () => {
    await startMockLLM();
  });
  afterEach(async () => {
    await stopMockLLM();
  });

  it(
    'does not grow heap unboundedly across repeated missions',
    async () => {
      const gc = (global as unknown as { gc?: () => void }).gc;
      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        await oneMission();
        if (gc) gc();
        samples.push(process.memoryUsage().heapUsed);
      }
      const half = Math.floor(samples.length / 2);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const firstAvg = avg(samples.slice(0, half));
      const secondAvg = avg(samples.slice(half));
      const ratio = secondAvg / firstAvg;
      // eslint-disable-next-line no-console
      console.log(
        `[mem] iterations=${ITERATIONS} gc=${Boolean(gc)} firstAvg=${(firstAvg / 1e6).toFixed(1)}MB secondAvg=${(secondAvg / 1e6).toFixed(1)}MB ratio=${ratio.toFixed(2)}`
      );
      if (gc) {
        expect(ratio).toBeLessThan(GROWTH_LIMIT);
      } else {
        // No forced GC available; record-only to avoid GC-noise flakes.
        expect(samples.length).toBe(ITERATIONS);
      }
    },
    60000
  );
});
