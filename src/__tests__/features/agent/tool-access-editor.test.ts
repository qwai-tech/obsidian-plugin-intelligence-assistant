import { ToolAccessEditor } from '@/features/agent/tool-access-editor';
import type { AgentToolAccess } from '@/features/tools/types/tools';

const editorFor = (sources: AgentToolAccess['sources']) => {
	const access: AgentToolAccess = { sources };
	return { access, editor: new ToolAccessEditor(access) };
};

describe('ToolAccessEditor', () => {
	it('reports tools granted by a whole source or by id', () => {
		const { editor } = editorFor({ 'mcp:files': 'all', 'builtin:builtin': ['builtin:builtin:read'] });

		expect(editor.hasTool('mcp:files', 'mcp:files:search')).toBe(true);
		expect(editor.hasTool('builtin:builtin', 'builtin:builtin:read')).toBe(true);
		expect(editor.hasTool('builtin:builtin', 'builtin:builtin:write')).toBe(false);
		expect(editor.rule('builtin:builtin')).toEqual(['builtin:builtin:read']);
		expect(editor.rule('cli:git')).toBeUndefined();
	});

	it('expands a whole source to its tools before removing one', () => {
		const { access, editor } = editorFor({ 'mcp:files': 'all' });

		editor.setTool('mcp:files', 'mcp:files:search', false, ['mcp:files:search', 'mcp:files:read']);

		expect(access.sources['mcp:files']).toEqual(['mcp:files:read']);
	});

	it('adds a tool once and drops the source when its last tool is removed', () => {
		const { access, editor } = editorFor({});

		editor.setTool('builtin:builtin', 'builtin:builtin:read', true, []);
		editor.setTool('builtin:builtin', 'builtin:builtin:read', true, []);
		expect(access.sources['builtin:builtin']).toEqual(['builtin:builtin:read']);

		editor.setTool('builtin:builtin', 'builtin:builtin:read', false, []);
		expect(access.sources).not.toHaveProperty('builtin:builtin');
	});

	it('grants or revokes a whole source', () => {
		const { access, editor } = editorFor({ 'cli:git': 'all' });

		editor.setWholeSource('mcp:files', true);
		editor.setWholeSource('cli:git', false);

		expect(access.sources).toEqual({ 'mcp:files': 'all' });
		expect(editor.grantsWholeSource('mcp:files')).toBe(true);
		expect(editor.includesSource('cli:git')).toBe(false);
	});
});
