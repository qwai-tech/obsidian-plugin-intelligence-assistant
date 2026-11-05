/**
 * ToolRegistry - the registry at the centre of the tool system.
 * Holds a set of ToolSources, aggregates their tools, generates structured
 * toolIds and de-duplicated LLM-facing names, and provides per-agent
 * filtering, lookup, execution, and format conversion.
 */
import type {
	AgentToolAccess,
	RegisteredTool,
	SourceTool,
	ToolResult,
	ToolExecutionContext,
	ToolSourceKind,
} from '@/features/tools/types/tools';
import type { ToolSource } from './tool-source';
import { parametersToJsonSchema, validateToolArguments } from './tool-schema';
import { assertWriteProposalResult } from '@/features/agent';

/** Max length of an LLM function name (OpenAI / Anthropic limit). */
const MAX_LLM_NAME_LENGTH = 64;

/** OpenAI function-calling format. */
interface OpenAIFunction {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export class ToolRegistry {
	/** key = `${kind}:${id}`, iterated in registration order (drives disambiguation priority). */
	private sources = new Map<string, ToolSource>();
	/** Each source's last load() result, keyed as above. */
	private sourceTools = new Map<string, SourceTool[]>();
	/** Aggregated + disambiguated tool list. */
	private tools: RegisteredTool[] = [];
	private byToolId = new Map<string, RegisteredTool>();
	private byLlmName = new Map<string, RegisteredTool>();

	/**
	 * Serial queue for mutating operations. Even though JS is single-threaded,
	 * each mutator yields on `await source.load()` (network/subprocess work)
	 * and could interleave with another mutator's setup. Serializing keeps
	 * sourceTools, the index, and per-source lifecycle consistent.
	 * Reads (getTools, getToolByLlmName, …) skip the queue.
	 */
	private mutationLock: Promise<void> = Promise.resolve();

	private serialize<T>(fn: () => Promise<T>): Promise<T> {
		const prev = this.mutationLock;
		let release!: () => void;
		this.mutationLock = new Promise<void>((res) => { release = res; });
		const run = async (): Promise<T> => {
			try {
				await prev;
				return await fn();
			} finally {
				release();
			}
		};
		return run();
	}

	/** Register a tool source. Does not load immediately; call reload(). */
	registerSource(source: ToolSource): void {
		this.sources.set(sourceKey(source.kind, source.id), source);
	}

	/** Call load() on every registered source and rebuild the index. One source failing does not affect others. */
	reload(): Promise<void> {
		return this.serialize(async () => {
			for (const [key, source] of this.sources) {
				try {
					this.sourceTools.set(key, await source.load());
				} catch (err) {
					console.error(`[ToolRegistry] load failed for ${key}:`, err);
					// Preserve the previous successful snapshot if one exists, so
					// a transient failure doesn't wipe cached tools. Only seed
					// an empty array if this source has never loaded successfully.
					if (!this.sourceTools.has(key)) {
						this.sourceTools.set(key, []);
					}
				}
			}
			this.rebuild();
		});
	}

	/**
	 * Reload a single registered source without touching the others.
	 * Returns the tools just produced by that source. Throws if the source
	 * was never registered, so callers see registration mistakes loudly.
	 *
	 * On load() failure the previous successful snapshot is preserved (so a
	 * transient MCP disconnect doesn't wipe cached tools); the error is
	 * still surfaced. Use the explicit `unregisterSource` to clear a
	 * source's tools.
	 */
	reloadSource(kind: ToolSourceKind, id: string): Promise<RegisteredTool[]> {
		return this.serialize(async () => {
			const key = sourceKey(kind, id);
			const source = this.sources.get(key);
			if (!source) {
				throw new Error(`[ToolRegistry] reloadSource: no source registered for ${key}`);
			}
			const result = await source.load();
			this.sourceTools.set(key, result);
			this.rebuild();
			return this.tools.filter((t) => t.origin.kind === kind && t.origin.sourceId === id);
		});
	}

	sourceIds(kind: ToolSourceKind): string[] {
		return [...this.sources.values()].filter((source) => source.kind === kind).map((source) => source.id);
	}

	/** True if a source with the given kind+id is currently registered. */
	hasSource(kind: ToolSourceKind, id: string): boolean {
		return this.sources.has(sourceKey(kind, id));
	}

	/** Return all aggregated tools. */
	getTools(): RegisteredTool[] {
		return this.tools;
	}

	getToolById(toolId: string): RegisteredTool | undefined {
		return this.byToolId.get(toolId);
	}

	getToolByLlmName(name: string): RegisteredTool | undefined {
		return this.byLlmName.get(name);
	}

	/** Execute a tool by its LLM-facing name; returns a failure ToolResult if not found or on error. */
	async executeTool(llmName: string, args: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
		const tool = this.byLlmName.get(llmName);
		if (!tool) {
			return { success: false, error: `Tool not found: ${llmName}` };
		}
		return this.executeBoundTool(tool, args, context);
	}

	/** Reject a changed source instead of rebinding a permitted wire name to a new tool. */
	async executeBoundTool(tool: RegisteredTool, args: Record<string, unknown>, context: ToolExecutionContext = {}): Promise<ToolResult> {
		context.signal?.throwIfAborted();
		if (this.byToolId.get(tool.toolId) !== tool) return { success: false, error: `Tool ${tool.toolId} changed during this task; start a new task to use the updated source.` };
		const llmName = tool.llmName;
		const validation = validateToolArguments(tool.definition, args);
		if (!validation.success) {
			return { success: false, error: `Invalid arguments for ${llmName}: ${validation.error}` };
		}
		try {
			const result = await tool.execute(validation.data, context);
			context.signal?.throwIfAborted();
			if (result.success && tool.definition.sideEffects?.vaultWrite) {
				const proposalCheck = assertWriteProposalResult(result.result);
				if (!proposalCheck.success) {
					return { success: false, error: proposalCheck.error };
				}
			}
			return result;
		} catch (err) {
			return {
				success: false,
				error: `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Filter tools by an agent's tool access config.
	 * source absent -> unavailable; 'all' -> all available; array -> available only if toolId matches.
	 */
	resolveForAgent(access: AgentToolAccess): RegisteredTool[] {
		return this.tools.filter((tool) => {
			const key = sourceKey(tool.origin.kind, tool.origin.sourceId);
			const rule = access.sources[key];
			if (rule === undefined) {
				return false;
			}
			if (rule === 'all') {
				return true;
			}
			return rule.includes(tool.toolId);
		});
	}

	/** Remove a source: release its resources, drop its tools, and re-disambiguate the rest. */
	unregisterSource(kind: ToolSourceKind, id: string): Promise<void> {
		return this.serialize(async () => {
			const key = sourceKey(kind, id);
			const source = this.sources.get(key);
			if (!source) {
				return;
			}
			try {
				await source.dispose();
			} catch (err) {
				console.error(`[ToolRegistry] dispose failed for ${key}:`, err);
			}
			this.sources.delete(key);
			this.sourceTools.delete(key);
			this.rebuild();
		});
	}

	/** Release all sources and clear the registry. */
	dispose(): Promise<void> {
		return this.serialize(async () => {
			for (const [key, source] of this.sources) {
				try {
					await source.dispose();
				} catch (err) {
					console.error(`[ToolRegistry] dispose failed for ${key}:`, err);
				}
			}
			this.sources.clear();
			this.sourceTools.clear();
			this.tools = [];
			this.byToolId.clear();
			this.byLlmName.clear();
		});
	}

	/** Convert a tool list to OpenAI function-calling format (function name uses llmName). */
	toOpenAIFunctions(tools: RegisteredTool[]): OpenAIFunction[] {
		return tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.llmName,
				description: tool.definition.description + (tool.definition.argumentSources?.length ? '\nHost-enforced argument source contracts (successful source reads required in this run; copy exact values for the matching target): ' + JSON.stringify(tool.definition.argumentSources) : ''),
				parameters: parametersToJsonSchema(tool.definition.parameters),
			},
		}));
	}

	/**
	 * Re-aggregate the RegisteredTool list from cached source tools and disambiguate.
	 * Does not call source.load() again.
	 */
	private rebuild(): void {
		const tools: RegisteredTool[] = [];
		const usedLlmNames = new Set<string>();
		for (const [key, source] of this.sources) {
			const sourceTools = this.sourceTools.get(key) ?? [];
			for (const st of sourceTools) {
				const rawName = st.definition.name;
				const toolId = `${source.kind}:${source.id}:${rawName}`;
				const llmName = disambiguate(sanitizeLlmName(rawName), usedLlmNames);
				usedLlmNames.add(llmName);
				tools.push({
					toolId,
					llmName,
					origin: { kind: source.kind, sourceId: source.id },
					definition: st.definition,
					execute: (args, context) => st.execute(args, context),
				});
			}
		}
		this.tools = tools;
		this.byToolId = new Map(tools.map((t) => [t.toolId, t]));
		this.byLlmName = new Map(tools.map((t) => [t.llmName, t]));
	}
}

/** Source index key. */
function sourceKey(kind: ToolSourceKind, id: string): string {
	return `${kind}:${id}`;
}

/** Convert any tool name into a valid LLM function name: keep only [a-zA-Z0-9_-], truncate to 64. */
function sanitizeLlmName(raw: string): string {
	const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, MAX_LLM_NAME_LENGTH);
	return cleaned.length > 0 ? cleaned : 'tool';
}

/** If base is already taken, deterministically append `_2`, `_3`... (kept within the length limit). */
function disambiguate(base: string, used: Set<string>): string {
	if (!used.has(base)) {
		return base;
	}
	let n = 2;
	for (;;) {
		const suffix = `_${n}`;
		const head = base.slice(0, MAX_LLM_NAME_LENGTH - suffix.length);
		const candidate = head + suffix;
		if (!used.has(candidate)) {
			return candidate;
		}
		n += 1;
	}
}
