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
	ToolSourceKind,
} from '@/types/common/tools';
import type { ToolSource } from './tool-source';

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

/** Anthropic tools format. */
interface AnthropicTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
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

	/** Register a tool source. Does not load immediately; call reload(). */
	registerSource(source: ToolSource): void {
		this.sources.set(sourceKey(source.kind, source.id), source);
	}

	/** Call load() on every registered source and rebuild the index. One source failing does not affect others. */
	async reload(): Promise<void> {
		for (const [key, source] of this.sources) {
			try {
				this.sourceTools.set(key, await source.load());
			} catch (err) {
				console.error(`[ToolRegistry] load failed for ${key}:`, err);
				this.sourceTools.set(key, []);
			}
		}
		this.rebuild();
	}

	/**
	 * Reload a single registered source without touching the others.
	 * Returns the tools just produced by that source. Throws if the source
	 * was never registered, so callers see registration mistakes loudly.
	 */
	async reloadSource(kind: ToolSourceKind, id: string): Promise<RegisteredTool[]> {
		const key = sourceKey(kind, id);
		const source = this.sources.get(key);
		if (!source) {
			throw new Error(`[ToolRegistry] reloadSource: no source registered for ${key}`);
		}
		try {
			this.sourceTools.set(key, await source.load());
		} catch (err) {
			this.sourceTools.set(key, []);
			this.rebuild();
			throw err;
		}
		this.rebuild();
		return this.tools.filter((t) => t.origin.kind === kind && t.origin.sourceId === id);
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
	async executeTool(llmName: string, args: Record<string, unknown>): Promise<ToolResult> {
		const tool = this.byLlmName.get(llmName);
		if (!tool) {
			return { success: false, error: `Tool not found: ${llmName}` };
		}
		try {
			return await tool.execute(args);
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
	async unregisterSource(kind: ToolSourceKind, id: string): Promise<void> {
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
	}

	/** Release all sources and clear the registry. */
	async dispose(): Promise<void> {
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
	}

	/** Convert a tool list to OpenAI function-calling format (function name uses llmName). */
	toOpenAIFunctions(tools: RegisteredTool[]): OpenAIFunction[] {
		return tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.llmName,
				description: tool.definition.description,
				parameters: toJsonSchema(tool),
			},
		}));
	}

	/** Convert a tool list to Anthropic tools format (tool name uses llmName). */
	toAnthropicTools(tools: RegisteredTool[]): AnthropicTool[] {
		return tools.map((tool) => ({
			name: tool.llmName,
			description: tool.definition.description,
			input_schema: toJsonSchema(tool),
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
					execute: (args) => st.execute(args),
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

/** Convert a tool's parameter definitions into the JSON Schema object form. */
function toJsonSchema(tool: RegisteredTool): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	for (const param of tool.definition.parameters) {
		properties[param.name] = {
			type: param.type,
			description: param.description,
			...(param.enum ? { enum: param.enum } : {}),
		};
	}
	return {
		type: 'object',
		properties,
		required: tool.definition.parameters.filter((p) => p.required).map((p) => p.name),
	};
}
