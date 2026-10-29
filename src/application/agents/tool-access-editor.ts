import type { AgentToolAccess } from '@/types/common/tools';

export class ToolAccessEditor {
	constructor(private readonly access: AgentToolAccess) {}

	hasTool(source: string, toolId: string): boolean {
		const rule = this.access.sources[source];
		return rule === 'all' || (rule?.includes(toolId) ?? false);
	}

	setTool(source: string, toolId: string, enabled: boolean, everyToolId: string[]): void {
		const rule = this.access.sources[source];
		const current = rule === 'all' ? everyToolId : rule ?? [];
		const next = current.filter(id => id !== toolId);
		if (enabled) next.push(toolId);
		if (next.length === 0) {
			delete this.access.sources[source];
		} else {
			this.access.sources[source] = next;
		}
	}

	rule(source: string): 'all' | string[] | undefined {
		return this.access.sources[source];
	}

	grantsWholeSource(source: string): boolean {
		return this.access.sources[source] === 'all';
	}

	includesSource(source: string): boolean {
		return this.access.sources[source] !== undefined;
	}

	setWholeSource(source: string, enabled: boolean): void {
		if (enabled) {
			this.access.sources[source] = 'all';
		} else {
			delete this.access.sources[source];
		}
	}
}
