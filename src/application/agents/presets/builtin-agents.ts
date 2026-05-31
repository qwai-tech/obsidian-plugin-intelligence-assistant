import type { Agent } from '@/types';

export const BUILTIN_AGENT_PRESETS: Agent[] = [
	{
		id: 'builtin-librarian',
		name: '🔍 Librarian (知识矿工)',
		description: 'Specializes in metadata management, folder organization, and finding semantic connections in your vault.',
		icon: 'library',
		systemPromptId: 'prompt-librarian',
		modelStrategy: { strategy: 'chat-view' },
		toolAccess: {
			sources: {
				'builtin:builtin': [
					'builtin:builtin:read_file',
					'builtin:builtin:list_files',
					'builtin:builtin:update_properties',
					'builtin:builtin:search_files'
				]
			}
		},
		temperature: 0.7,
		maxTokens: 4000,
		memoryType: 'none',
		memoryConfig: {
			summaryInterval: 10,
			maxMemories: 50
		},
		ragEnabled: true,
		webSearchEnabled: false,
		maxSteps: 10,
		contextWindow: 30,
		createdAt: 1780157341493,
		updatedAt: 1780157341493
	},
	{
		id: 'builtin-architect',
		name: '🏗️ Architect (白板建筑师)',
		description: 'Expert in visual thinking and spatial organization using Obsidian Canvas. Great for project mapping.',
		icon: 'layout-dashboard',
		systemPromptId: 'prompt-architect',
		modelStrategy: { strategy: 'chat-view' },
		toolAccess: {
			sources: {
				'builtin:builtin': [
					'builtin:builtin:read_file',
					'builtin:builtin:list_files',
					'builtin:builtin:read_canvas',
					'builtin:builtin:update_canvas',
					'builtin:builtin:create_note'
				]
			}
		},
		temperature: 0.7,
		maxTokens: 4000,
		memoryType: 'none',
		memoryConfig: {
			summaryInterval: 10,
			maxMemories: 50
		},
		ragEnabled: true,
		webSearchEnabled: false,
		maxSteps: 15,
		contextWindow: 40,
		createdAt: 1780157341493,
		updatedAt: 1780157341493
	},
	{
		id: 'builtin-researcher',
		name: '🧬 Researcher (深度研究员)',
		description: 'Specializes in comprehensive analysis, RAG-driven synthesis, and augmenting vault knowledge with web search.',
		icon: 'microscope',
		systemPromptId: 'prompt-researcher',
		modelStrategy: { strategy: 'chat-view' },
		toolAccess: {
			sources: {
				'builtin:builtin': [
					'builtin:builtin:read_file',
					'builtin:builtin:search_files',
					'builtin:builtin:append_to_note'
				]
			}
		},
		temperature: 0.7,
		maxTokens: 4000,
		memoryType: 'none',
		memoryConfig: {
			summaryInterval: 10,
			maxMemories: 50
		},
		ragEnabled: true,
		webSearchEnabled: true,
		maxSteps: 20,
		contextWindow: 50,
		createdAt: 1780157341493,
		updatedAt: 1780157341493
	},
	{
		id: 'builtin-scribe',
		name: '🖋️ Scribe (创作伙伴)',
		description: 'Focused on high-quality writing, multimodal understanding (Vision), and maintaining your personal voice.',
		icon: 'pen-tool',
		systemPromptId: 'prompt-scribe',
		modelStrategy: { strategy: 'chat-view' },
		toolAccess: {
			sources: {
				'builtin:builtin': [
					'builtin:builtin:read_file',
					'builtin:builtin:write_file',
					'builtin:builtin:create_note',
					'builtin:builtin:append_to_note'
				]
			}
		},
		temperature: 0.7,
		maxTokens: 4000,
		memoryType: 'none',
		memoryConfig: {
			summaryInterval: 10,
			maxMemories: 50
		},
		ragEnabled: true,
		webSearchEnabled: false,
		maxSteps: 10,
		contextWindow: 30,
		createdAt: 1780157341493,
		updatedAt: 1780157341493
	}
];
