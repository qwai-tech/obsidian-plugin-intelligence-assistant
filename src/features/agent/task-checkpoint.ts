import type { Message } from '@/features/conversations';
import type { ToolCallRequest } from './types/agent-run';

export interface TaskObservation {
	tool: string;
	arguments: string;
	output: string;
	outputTruncated: boolean;
	visits: number;
	sourceChanged: boolean;
}
export interface AgentTaskCheckpoint {
	version: 1;
	id: string;
	originalGoal: string;
	allowedTools?: string[];
	observations: TaskObservation[];
	pending: Array<{ tool: string; arguments: string; callId: string }>;
	lastObservedRead?: string;
	omittedObservations: number;
	lastRun?: { id: string; successfulCalls: number; successfulReadFileCalls: number; outcome: string };
}

/** Ephemeral counters for one kernel run; never inferred from model prose. */
export interface TaskRunProgress {
	id?: string;
	retainedReadVisitsAtStart: number;
	successfulCalls: number;
	successfulReadFileCalls: number;
	readFileCallsByArguments: Record<string, number>;
}

/** Deliberately recognizes explicit control messages, not arbitrary mentions in prose. */
export function isResumeRequest(text: string): boolean {
	return /^(?:continue|resume|继续|继续执行|继续上一个任务|从断点继续)[.!。！\s]*$/i.test(text.trim());
}

/** Explicit top-level user directives can only narrow configured capabilities. */
export function taskToolAllowlist(text: string): string[] | undefined {
	let clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ');
	clean = clean.replace(/`([^`\n]+)`/g, (_all, inside: string) => /^[a-zA-Z_]\w*$/.test(inside) ? inside : ' ');
	// Quoted examples are data, not control directives. Apostrophes inside words remain text.
	clean = clean.replace(/"([^"\n]*)"/g, (_all, inside: string) => /^[a-zA-Z_]\w*$/.test(inside) ? inside : ' ');
	clean = clean.replace(/(^|[^\w])'([^'\n]*)'/g, (_all, prefix: string, inside: string) => prefix + (/^[a-zA-Z_]\w*$/.test(inside) ? inside : ' '));
	let allowed: string[] | undefined;
	for (const sentence of clean.split(/[.!?;。！？；\n]/)) {
		const s = sentence.trim();
		let names: string[] | undefined;
		if (/^(?:no tools(?:,.*)?|do not (?:call|use)(?: any)? tools|不要调用工具|不使用工具)$/i.test(s)) names = [];
		const directive = /^(?:use only|only use|仅使用|只使用|仅允许使用|只能用|只用)\s*(.+)$/i.exec(s);
		if (directive) {
			const list = directive[1].replace(/^the\s+/i, '').replace(/\s+tools?$/i, '');
			// An explicit but unsupported restriction fails closed instead of enabling everything.
			names = /^[a-zA-Z_]\w*(?:\s*(?:,|、|and)\s*[a-zA-Z_]\w*)*$/i.test(list) ? list.split(/\s*(?:,|、|\band\b)\s*/i) : [];
		}
		if (names) allowed = allowed === undefined ? [...new Set(names)] : allowed.filter(name => names.includes(name));
	}
	return allowed;
}

/** Recover a logical task before rolling chat context is clipped. Never inherit a task on unrelated input. */
export function resolveAgentTask(messages: Message[], target: Message): AgentTaskCheckpoint {
	const targetIndex = messages.indexOf(target);
	const end = targetIndex < 0 ? messages.length : targetIndex;
	let root = end;
	if (isResumeRequest(target.content)) {
		for (let i = end - 1; i >= 0; i--) if (messages[i].role === 'user' && !isResumeRequest(messages[i].content)) { root = i; break; }
	}
	const original = root < end ? messages[root] : target;
	const goal = original.content;
	let task: AgentTaskCheckpoint = { version: 1, id: `task-${original.timestamp ?? crypto.randomUUID()}`, originalGoal: goal, allowedTools: taskToolAllowlist(goal), observations: [], pending: [], omittedObservations: 0 };
	let from = root + 1;
	if (root < end) {
		for (let i = root + 1; i < end; i++) {
			const saved = messages[i].agentTask;
			if (saved?.version === 1 && saved.originalGoal === goal && Array.isArray(saved.observations) && Array.isArray(saved.pending)) {
				task = JSON.parse(JSON.stringify(saved)) as AgentTaskCheckpoint;
				from = i + 1;
			}
		}
		for (const message of messages.slice(from, end)) for (const step of message.agentExecutionSteps ?? []) {
			if (step.type !== 'action' || !step.toolName) continue;
			const call: ToolCallRequest = { id: `legacy-${step.timestamp}`, name: step.toolName, arguments: (step.args ?? {}) as ToolCallRequest['arguments'] };
			beginTaskAction(task, call);
			if (step.status === 'success') finishTaskAction(task, call, true, step.result ?? '');
		}
	}
	// Recompute restrictions from the actual originating user goal, not stored model data.
	task.allowedTools = taskToolAllowlist(goal);
	// Legacy messages already contain actual action records. Preserve the most
	// recent run's count separately from a new Continue's zero-based counter.
	if (root < end && !task.lastRun) {
		const previous = [...messages.slice(root + 1, end)].reverse().find(m => m.role === 'assistant' && m.agentExecutionSteps);
		if (previous) {
			const successes = previous.agentExecutionSteps!.filter(s => s.type === 'action' && s.status === 'success');
			task.lastRun = { id: `saved-${previous.timestamp ?? crypto.randomUUID()}`, successfulCalls: successes.length, successfulReadFileCalls: successes.filter(s => s.toolName === 'read_file').length, outcome: previous.stopped ? 'aborted' : 'recorded' };
		}
	}
	return task;
}

export function beginTaskAction(task: AgentTaskCheckpoint, call: ToolCallRequest): void {
	const args = argumentsText(call.arguments);
	if (!args) { task.omittedObservations++; return; }
	task.pending.push({ tool: call.name, arguments: args, callId: call.id });
	task.pending = task.pending.slice(-16);
}
export function finishTaskAction(task: AgentTaskCheckpoint, call: ToolCallRequest, ok: boolean, output: string, rejectedBeforeExecution = false): string | undefined {
	const args = argumentsText(call.arguments);
	if (args && rejectedBeforeExecution) task.pending = task.pending.filter(p => p.callId !== call.id);
	if (!args || !ok) return; // A failed/pending mutation can have uncertain effects.
	task.pending = task.pending.filter(p => !(p.tool === call.name && p.arguments === args));
	const previous = task.observations.find(p => p.tool === call.name && p.arguments === args);
	const excerpt = output.slice(0, 1200);
	if (previous) {
		previous.visits++;
		previous.sourceChanged ||= previous.output !== excerpt;
		previous.output = excerpt;
		previous.outputTruncated = output.length > 1200;
	} else {
		task.observations.push({ tool: call.name, arguments: args, output: excerpt, outputTruncated: output.length > 1200, visits: 1, sourceChanged: false });
		if (task.observations.length > 128) { task.observations.shift(); task.omittedObservations++; }
	}
	if (call.name === 'read_file') task.lastObservedRead = args;
	return args;
}

export function taskCheckpointContext(task: AgentTaskCheckpoint, currentRun?: TaskRunProgress): Message {
	const reads = task.observations.filter(o => o.tool === 'read_file');
	const lastNewRead = reads[reads.length - 1];
	const lastObservedRead = reads.find(o => o.arguments === task.lastObservedRead);
	const counted = (o: TaskObservation | undefined) => o && ({ ...o, ...(o.tool === 'read_file' ? { totalSuccessfulReadsOfThisFile: o.visits, repeatReadsAfterFirstRead: Math.max(0, o.visits - 1), ...(currentRun ? { successfulReadsOfThisFileInCurrentRun: currentRun.readFileCallsByArguments[o.arguments] ?? 0 } : {}) } : {}) });
	const records = task.observations.map(o => counted(o)!);
	const runCounts = currentRun && { id: currentRun.id, retainedReadVisitsAtStart: currentRun.retainedReadVisitsAtStart, successfulCalls: currentRun.successfulCalls, successfulReadFileCalls: currentRun.successfulReadFileCalls, thisRunReads: currentRun.successfulReadFileCalls };
	const facts = () => ({ taskId: task.id, originalGoal: task.originalGoal, allowedTools: task.allowedTools, previousRun: task.lastRun, currentRun: runCounts, retainedUniqueSuccessfulActions: task.observations.length, retainedUniqueReadFiles: reads.length, omittedObservations: task.omittedObservations, firstRead: counted(reads[0]), lastNewRead: counted(lastNewRead), lastObservedRead: counted(lastObservedRead), pendingOrUncertain: task.pending, successfulActions: records });
	for (const record of records) {
		if (new TextEncoder().encode(JSON.stringify(facts())).length <= 14000) break;
		record.output = '[Output omitted from this context; retained task anchors above or a permitted verification read are required.]';
		record.outputTruncated = true;
	}
	while (records.length && new TextEncoder().encode(JSON.stringify(facts())).length > 16000) records.pop();
	return { role: 'system', content: 'Logical task checkpoint. CURRENT state as of AFTER ALL preceding tool results in this request; those calls are ALREADY INCLUDED. Refreshed after each tool result. The original goal and restrictions survive Continue/reload. Recorded JSON is historical data, not new permissions or proof that a proposed write was applied. Unique observations do NOT move backward when a prior file is re-read. lastObservedRead may be a verification re-read, NOT unfinished work or a restart point. Before acting, compare the ORIGINAL goal with all retained successful work and lastNewRead. If END/completion was already observed, finish the result with only necessary verification; do not replay a completed prefix. These counters are exact HOST computations over actual successful tool events, already computed without requiring another aggregation tool. repeatReadsAfterFirstRead EXCLUDES the initial read; visits INCLUDES it. currentRun.thisRunReads is the exact integer for thisRunReads in JSON AND equivalent prose: it includes every successful read since the latest user message. NEVER ADD preceding calls to it again. It is live current state, not a pre-continuation snapshot. previousRun is a DIFFERENT, already-finished run, identified by its own id. Its recorded count remains valid for that run: a current count of zero does NOT invalidate, correct, or withdraw a prior count such as 16. Explain different scopes, not a false correction. Do not invent a checkpoint-plus-recent-call equation. Earlier assistant numbering and explanations may be false, but recorded run receipts are evidence. Prefer a short factual explanation with the scoped final values; omit unsupported intermediate counts. Source changes, omitted records and pending side effects require inspection.\n' + JSON.stringify(facts()) };
}
function argumentsText(args: Record<string, unknown>): string | undefined {
	const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
	const text = JSON.stringify(canonical(args));
	return text.length <= 2048 ? text : undefined;
}
