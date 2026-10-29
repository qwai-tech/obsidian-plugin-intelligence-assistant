export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type FinishReason =
	| { kind: 'answered' }
	| { kind: 'aborted' }
	| { kind: 'budget'; limit: 'steps'; steps: number }
	| { kind: 'budget'; limit: 'failures'; failures: number; tool: string; consecutive: boolean }
	| { kind: 'fatal'; error: string };

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface ToolCallRequest {
	id: string;
	name: string;
	arguments: JsonObject;
}

export type KernelEvent =
	| { type: 'run_started'; runId: string; stepLimit: number }
	| { type: 'turn_started'; turn: number }
	| { type: 'text_delta'; text: string }
	| { type: 'reasoning_delta'; text: string }
	| { type: 'tool_started'; call: ToolCallRequest; reasoning?: string }
	| { type: 'tool_finished'; call: ToolCallRequest; ok: boolean; output: string; value: JsonValue }
	| { type: 'guard_triggered'; guard: string; message: string }
	| { type: 'proposal_created'; call: ToolCallRequest }
	| { type: 'budget_updated'; stepLimit: number }
	| { type: 'usage'; turn: number; usage: TokenUsage }
	| { type: 'run_finished'; reason: FinishReason; answer: string };

export interface RunJournal {
	append(runId: string, event: KernelEvent): Promise<void>;
}
