import { assertToolSequence, assertVaultFileContains, assertWithinBudget } from './mission-types';
import type { MissionOutcome } from './mission-runner';
import { createHarnessApp } from './in-memory-vault';

function outcome(partial: Partial<MissionOutcome>): MissionOutcome {
  return { toolCalls: [], toolResults: [], steps: 0, toolCallCount: 0, ...partial };
}

describe('mission oracle helpers', () => {
  it('assertToolSequence passes on an exact ordered match', () => {
    const o = outcome({
      toolCalls: [
        { toolName: 'read_file', args: {} },
        { toolName: 'write_file', args: {} },
      ],
    });
    expect(() => assertToolSequence(o, ['read_file', 'write_file'])).not.toThrow();
  });

  it('assertToolSequence throws on a mismatch', () => {
    const o = outcome({ toolCalls: [{ toolName: 'read_file', args: {} }] });
    expect(() => assertToolSequence(o, ['write_file'])).toThrow(/expected tool sequence/i);
  });

  it('assertVaultFileContains reads the real in-memory side effect', () => {
    const app = createHarnessApp({ 'out.md': 'final content' });
    expect(() => assertVaultFileContains(app, 'out.md', 'final')).not.toThrow();
    expect(() => assertVaultFileContains(app, 'out.md', 'missing')).toThrow(/does not contain/i);
  });

  it('assertVaultFileContains throws when the file is absent', () => {
    const app = createHarnessApp({});
    expect(() => assertVaultFileContains(app, 'nope.md', 'x')).toThrow(/not found/i);
  });

  it('assertWithinBudget throws when steps exceed budget', () => {
    const o = outcome({ steps: 30 });
    expect(() => assertWithinBudget(o, { steps: 10 })).toThrow(/budget/i);
  });

  it('assertWithinBudget passes when within budget', () => {
    const o = outcome({ steps: 2 });
    expect(() => assertWithinBudget(o, { steps: 2 })).not.toThrow();
  });
});
