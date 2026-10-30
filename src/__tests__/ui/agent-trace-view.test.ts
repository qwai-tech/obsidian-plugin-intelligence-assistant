import { toolSummary } from '@/ui/chat/agent-trace-view';
import type { AgentExecutionStep } from '@/ui/state/chat-view-state';

const step = (type: AgentExecutionStep['type'], content: string): AgentExecutionStep => ({ type, content, timestamp: 0 });

describe('toolSummary', () => {
	it('counts tool calls and lists each tool once', () => {
		expect(toolSummary([
			step('thought', 'thinking'),
			step('action', 'read_file({"path":"a.md"})'),
			step('observation', 'contents'),
			step('action', 'read_file({"path":"b.md"})'),
			step('action', 'write_file({})'),
		])).toBe('read_file, write_file (3)');
	});

	it('is empty when no tool ran', () => {
		expect(toolSummary([step('thought', 'only thinking')])).toBe('');
	});
});
