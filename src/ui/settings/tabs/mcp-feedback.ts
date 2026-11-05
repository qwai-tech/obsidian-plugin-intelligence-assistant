import type { PluginHost } from '@/ui/plugin-host';

const errors = new WeakMap<PluginHost, Map<string, string>>();

export function setMcpFailure(plugin: PluginHost, name: string, error?: string): void {
	let state = errors.get(plugin);
	if (!state) { state = new Map(); errors.set(plugin, state); }
	if (error) state.set(name, error); else state.delete(name);
}

export function getMcpFailure(plugin: PluginHost, name: string): string | undefined {
	return errors.get(plugin)?.get(name);
}
