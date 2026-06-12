import { createHarnessApp } from './in-memory-vault';
import { buildHarnessToolRegistry } from './build-tool-registry';
import type { WriteProposal } from '@/application/services/write-proposal-service';

describe('harness tool registry', () => {
  it('reads a seeded file through the real read_file tool', async () => {
    const app = createHarnessApp({ 'test-note.md': 'AGENT_TOOL_SENTINEL' });
    const registry = await buildHarnessToolRegistry(app);

    const result = await registry.executeTool('read_file', { path: 'test-note.md' });

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.result)).toContain('AGENT_TOOL_SENTINEL');
  });

  it('returns a write proposal (no vault mutation) from write_file', async () => {
    const app = createHarnessApp({});
    const registry = await buildHarnessToolRegistry(app);

    const result = await registry.executeTool('write_file', {
      path: 'out.md',
      content: 'drafted',
    });

    expect(result.success).toBe(true);
    const proposal = result.result as WriteProposal;
    expect(proposal.type).toBe('write_proposal');
    // Proposal only — the vault is untouched until autonomy applies it.
    expect(await app.vault.adapter.exists('out.md')).toBe(false);
  });

  it('loads ALL builtins by default (append_to_note is registered)', async () => {
    const app = createHarnessApp({});
    const registry = await buildHarnessToolRegistry(app);

    expect(registry.getToolByLlmName('append_to_note')).toBeDefined();
  });

  it('restricts to provided enabledTypes when specified', async () => {
    const app = createHarnessApp({});
    const registry = await buildHarnessToolRegistry(app, ['read_file']);

    expect(registry.getToolByLlmName('read_file')).toBeDefined();
    expect(registry.getToolByLlmName('append_to_note')).toBeUndefined();
  });
});
