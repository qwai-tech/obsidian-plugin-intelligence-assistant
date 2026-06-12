import type { ToolSource } from '@/application/tools/tool-source';
import type { SourceTool } from '@/types/common/tools';

/** Minimal in-process non-builtin tool source exposing `fake_echo` (source key `mcp:fake`). */
export function createFakeToolSource(): ToolSource {
  const echo: SourceTool = {
    definition: {
      name: 'fake_echo',
      description: 'Echo the provided text back.',
      parameters: [{ name: 'text', type: 'string', description: 'Text to echo', required: true }],
    },
    execute: async (args: Record<string, unknown>) => ({ success: true, result: `echo: ${String(args.text)}` }),
  };
  return { kind: 'mcp', id: 'fake', label: 'Fake Tools', load: async () => [echo], dispose: async () => undefined };
}
