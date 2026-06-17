import type { App, DataAdapter } from 'obsidian';
import { AGENT_RUNS_DATA_FOLDER } from '@/constants';
import { buildSafeName, ensureFolderExists } from '@/utils/file-system';
import {
	AGENT_KERNEL_SCHEMA_VERSION,
	AgentKernelError,
} from './agent-engine-core';
import type {
	AgentState,
	AppendLogInput,
	CreateStateInput,
	ExecutionLogEntry,
	LogFilter,
	StateStore,
} from './agent-engine-core';

interface AgentRunFile {
	version: 1;
	runId: string;
	updatedAt: number;
	state: AgentState;
	logs: ExecutionLogEntry[];
}

function cloneState(state: AgentState): AgentState {
	return structuredClone(state);
}

function cloneLogEntry(entry: ExecutionLogEntry): ExecutionLogEntry {
	return structuredClone(entry);
}

function cloneRunFile(file: AgentRunFile): AgentRunFile {
	return structuredClone(file);
}

export class ObsidianAgentRunStateStore implements StateStore {
	private readonly adapter: DataAdapter;
	private initialized = false;

	constructor(app: App, private readonly baseFolder = AGENT_RUNS_DATA_FOLDER) {
		this.adapter = app.vault.adapter;
	}

	async create(input: CreateStateInput): Promise<AgentState> {
		await this.initialize();
		const runId = createRunId();
		const now = new Date().toISOString();
		const state: AgentState = {
			taskId: input.task.id,
			agentId: input.agent.id,
			runId,
			tenantId: input.host.tenantId,
			workspaceId: input.host.workspaceId,
			principalId: input.host.principal.id,
			effectiveScopes: [...input.host.effectiveScopes],
			status: 'running',
			step: 0,
			messages: [],
			actions: [],
			observations: [],
			variables: structuredClone(input.task.initialVariables ?? {}),
			failureCount: 0,
			toolCallCount: 0,
			schemaVersion: AGENT_KERNEL_SCHEMA_VERSION,
			createdAt: now,
			updatedAt: now,
			version: 1,
		};

		await this.writeRunFile({
			version: 1,
			runId,
			updatedAt: Date.now(),
			state,
			logs: [],
		});

		await this.appendLog({
			id: createEventId(),
			runId,
			type: 'task_started',
			timestamp: now,
			payload: {
				agentId: input.agent.id,
				taskId: input.task.id,
				effectiveScopes: [...input.host.effectiveScopes],
			},
			traceId: input.host.traceId,
			principalId: input.host.principal.id,
			tenantId: input.host.tenantId,
			workspaceId: input.host.workspaceId,
		});

		return cloneState(state);
	}

	async load(runId: string): Promise<AgentState> {
		const file = await this.readRunFile(runId);
		return cloneState(file.state);
	}

	async save(state: AgentState): Promise<AgentState> {
		const file = await this.readRunFile(state.runId);
		if (state.schemaVersion !== AGENT_KERNEL_SCHEMA_VERSION) {
			throw new AgentKernelError(
				'STATE_SCHEMA_MISMATCH',
				`State schema version mismatch for run: ${state.runId}`,
				{
					runId: state.runId,
					expected: AGENT_KERNEL_SCHEMA_VERSION,
					received: state.schemaVersion,
				},
			);
		}
		if (state.version !== file.state.version) {
			throw new AgentKernelError(
				'STATE_VERSION_CONFLICT',
				`State version conflict for run: ${state.runId}`,
				{
					runId: state.runId,
					expectedVersion: file.state.version,
					receivedVersion: state.version,
				},
			);
		}

		const updated = cloneState({
			...state,
			updatedAt: new Date().toISOString(),
			version: state.version + 1,
		});
		await this.writeRunFile({
			...file,
			updatedAt: Date.now(),
			state: updated,
		});
		return cloneState(updated);
	}

	async appendLog(input: AppendLogInput): Promise<ExecutionLogEntry> {
		const file = await this.readRunFile(input.runId);
		const entry: ExecutionLogEntry = {
			...input,
			schemaVersion: AGENT_KERNEL_SCHEMA_VERSION,
			sequence: file.logs.length + 1,
		};
		await this.writeRunFile({
			...file,
			updatedAt: Date.now(),
			logs: [...file.logs, entry],
		});
		return cloneLogEntry(entry);
	}

	async listLog(runId: string): Promise<ExecutionLogEntry[]> {
		const file = await this.readRunFile(runId);
		return file.logs.map(cloneLogEntry);
	}

	async queryLogs(runId: string, filter: LogFilter): Promise<ExecutionLogEntry[]> {
		const file = await this.readRunFile(runId);
		let results = [...file.logs];
		if (filter.types !== undefined && filter.types.length > 0) {
			const typeSet = new Set(filter.types);
			results = results.filter(entry => typeSet.has(entry.type));
		}
		if (filter.afterSequence !== undefined) {
			const after = filter.afterSequence;
			results = results.filter(entry => entry.sequence > after);
		}
		const offset = filter.offset ?? 0;
		const limit = filter.limit;
		results = results.slice(offset, limit !== undefined ? offset + limit : undefined);
		return results.map(cloneLogEntry);
	}

	private async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this.adapter, this.baseFolder);
		this.initialized = true;
	}

	private async readRunFile(runId: string): Promise<AgentRunFile> {
		await this.initialize();
		const path = this.getRunFilePath(runId);
		if (!(await this.adapter.exists(path))) {
			throw new AgentKernelError('RUN_NOT_FOUND', `Run not found: ${runId}`, { runId });
		}
		try {
			const raw = await this.adapter.read(path);
			const parsed = JSON.parse(raw) as AgentRunFile;
			return cloneRunFile(parsed);
		} catch (error) {
			if (error instanceof AgentKernelError) {
				throw error;
			}
			throw new AgentKernelError('RUN_NOT_FOUND', `Run file is unreadable: ${runId}`, { runId });
		}
	}

	private async writeRunFile(file: AgentRunFile): Promise<void> {
		await this.initialize();
		await this.adapter.write(this.getRunFilePath(file.runId), JSON.stringify(file, null, 2));
	}

	private getRunFilePath(runId: string): string {
		return `${this.baseFolder}/${buildSafeName(runId, 'agent-run')}.json`;
	}
}

function createRunId(): string {
	return `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEventId(): string {
	return `agent-event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
