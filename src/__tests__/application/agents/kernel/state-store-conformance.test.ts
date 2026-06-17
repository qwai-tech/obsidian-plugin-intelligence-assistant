import type { App } from 'obsidian';
import { stateStoreContract } from '@agentic-kernel/conformance';
import { ObsidianAgentRunStateStore } from '@/application/agents/kernel/obsidian-agent-run-state-store';

/**
 * Run the official @agentic-kernel StateStore conformance suite against our
 * Obsidian-backed implementation. This guards the contract (isolation, optimistic
 * versioning, schemaVersion rejection, initialVariables merge, append-only +
 * queryLogs, replayable logs) so a future @agentic-kernel/core upgrade can't
 * silently break ObsidianAgentRunStateStore.
 */

/** Minimal in-memory DataAdapter covering exactly what the store touches. */
function createMemoryAdapter() {
	const files = new Map<string, string>();
	const dirs = new Set<string>();
	return {
		async exists(path: string): Promise<boolean> {
			return files.has(path) || dirs.has(path);
		},
		async read(path: string): Promise<string> {
			const value = files.get(path);
			if (value === undefined) throw new Error(`ENOENT: ${path}`);
			return value;
		},
		async write(path: string, data: string): Promise<void> {
			files.set(path, data);
		},
		async mkdir(path: string): Promise<void> {
			dirs.add(path);
		},
	};
}

function createApp(): App {
	return { vault: { adapter: createMemoryAdapter() } } as unknown as App;
}

// Each createStore() call gets a fresh isolated vault, as the contract requires.
stateStoreContract('ObsidianAgentRunStateStore', () => new ObsidianAgentRunStateStore(createApp()));
