import type { App } from 'obsidian';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';

/** Builtin tools enabled in the harness by default. */
const DEFAULT_ENABLED_BUILTINS = [
  'read_file',
  'write_file',
  'search_files',
  'create_note',
];

export async function buildHarnessToolRegistry(
  app: App,
  enabledTypes: string[] = DEFAULT_ENABLED_BUILTINS,
): Promise<ToolRegistry> {
  const registry = new ToolRegistry();
  registry.registerSource(new BuiltinToolSource(app, () => enabledTypes));
  await registry.reload();
  return registry;
}
