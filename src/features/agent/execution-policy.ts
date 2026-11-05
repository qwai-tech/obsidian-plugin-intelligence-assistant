import type { Agent } from './types/agent';

export type TaskOrigin = 'chat' | 'command' | 'deep-link' | 'ai-block';
export interface TaskAuthorization {
	origin: TaskOrigin;
	/** Set by a user action in the host, never inferred from task text. */
	approved: boolean;
}
export interface ExecutionPolicy {
	readonly origin: TaskOrigin;
	readonly autonomousWrite: boolean;
}

export function resolveExecutionPolicy(agent: Pick<Agent, 'autonomousWrite'> | null | undefined, authorization: TaskAuthorization = { origin: 'chat', approved: true }): ExecutionPolicy {
	return Object.freeze({ origin: authorization.origin, autonomousWrite: authorization.approved && agent?.autonomousWrite === true });
}
