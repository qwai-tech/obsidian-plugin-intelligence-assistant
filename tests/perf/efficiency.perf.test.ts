import * as fs from 'node:fs';
import * as path from 'node:path';
import { startMockLLM, stopMockLLM } from '../harness/mock-llm-harness';
import { SCENARIOS, metric, type EfficiencyMetric } from './efficiency-scenarios';

const BASELINE_PATH = path.join(__dirname, 'efficiency.baseline.json');

if (process.env.UPDATE_PERF_BASELINE === '1') {
  describe('regenerate efficiency baseline', () => {
    it('writes baselines for all scenarios', async () => {
      const out: Record<string, EfficiencyMetric> = {};
      for (const s of SCENARIOS) {
        await startMockLLM();
        const outcome = await s.run();
        expect(outcome.error).toBeUndefined();
        out[s.name] = metric(outcome);
        await stopMockLLM();
      }
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n');
      expect(fs.existsSync(BASELINE_PATH)).toBe(true);
    });
  });
} else {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, EfficiencyMetric>;
  describe('agent efficiency baseline', () => {
    beforeEach(async () => {
      await startMockLLM();
    });
    afterEach(async () => {
      await stopMockLLM();
    });
    for (const s of SCENARIOS) {
      it(`${s.name} matches its efficiency baseline (turns + tool calls)`, async () => {
        const outcome = await s.run();
        expect(outcome.error).toBeUndefined();
        expect(metric(outcome)).toEqual(baseline[s.name]);
      });
    }
  });
}
