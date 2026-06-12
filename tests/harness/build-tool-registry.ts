import type { App } from 'obsidian';
import { ToolRegistry } from '@/application/tools/tool-registry';
import { BuiltinToolSource } from '@/application/tools/sources/builtin-tool-source';
import type { ToolSource } from '@/application/tools/tool-source';

/**
 * Build a real ToolRegistry over the headless harness app.
 * Defaults to loading ALL builtin tools by passing `() => null` to
 * BuiltinToolSource — matching the existing integration tests and avoiding
 * "Tool not found" errors for missions that use any builtin.
 * Pass `enabledTypes` to restrict the set (e.g. for targeted unit tests).
 *
 * Note: production code reads the enabled list from plugin settings; the
 * harness bypasses that and either loads all or an explicit list.
 */
export async function buildHarnessToolRegistry(
  app: App,
  enabledTypes?: string[],
  extraSources: ToolSource[] = [],
): Promise<ToolRegistry> {
  // () => null tells BuiltinToolSource to load all registered builtins.
  const getEnabled = enabledTypes ? () => enabledTypes : () => null;
  const registry = new ToolRegistry();
  registry.registerSource(new BuiltinToolSource(app, getEnabled));
  for (const source of extraSources) {
    registry.registerSource(source);
  }
  await registry.reload();
  return registry;
}
