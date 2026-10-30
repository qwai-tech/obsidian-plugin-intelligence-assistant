export interface ProcessLaunch {
	command: string;
	args: string[];
	env: Record<string, string>;
}

export interface McpConnection {
	readonly isOpen: boolean;
	request(method: string, params: Record<string, unknown>): Promise<unknown>;
	close(): Promise<void>;
}

export type McpConnector = (launch: ProcessLaunch) => Promise<McpConnection>;

export interface CommandRun extends ProcessLaunch {
	cwd?: string;
	shell: boolean;
	timeoutMs: number;
}

export interface CommandOutcome {
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

export type CommandRunner = (run: CommandRun) => Promise<CommandOutcome>;
