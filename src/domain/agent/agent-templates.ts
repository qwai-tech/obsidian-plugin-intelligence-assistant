import type { Agent, AgentModelStrategy } from '@/types';

const fixedStrategy = (modelId: string): AgentModelStrategy => ({
	strategy: 'fixed',
	modelId
});

export const AGENT_TEMPLATES: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>[] = [
	{
		name: 'Research Assistant',
		description: 'Helps with research, note-taking, and information gathering. Uses web search and RAG to find relevant information.',
		icon: '📋',
		modelStrategy: fixedStrategy('gpt-4o'),
		temperature: 0.7,
		maxTokens: 2000,
		systemPromptId: 'default',
		contextWindow: 20,
		enabledBuiltInTools: ['search_files', 'create_note', 'append_to_note', 'read_file'],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 100 },
		ragEnabled: true,
		webSearchEnabled: true,
		reactEnabled: false,
		reactMaxSteps: 10,
		reactAutoContinue: true
	},
	{
		name: 'Code Expert',
		description: 'Expert programming assistant for code analysis, debugging, and development. Uses thinking mode for complex problems.',
		icon: '💻',
		modelStrategy: fixedStrategy('gpt-4o'),
		temperature: 0.3,
		maxTokens: 3000,
		systemPromptId: 'code-expert',
		contextWindow: 30,
		enabledBuiltInTools: ['read_file', 'write_file', 'list_files', 'search_files'],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 15, maxMemories: 50 },
		ragEnabled: false,
		webSearchEnabled: false,
		reactEnabled: true,
		reactMaxSteps: 10,
		reactAutoContinue: true
	},
	{
		name: 'Writing Coach',
		description: 'Creative writing assistant for content creation, editing, and storytelling. Focuses on style and clarity.',
		icon: '✍️',
		modelStrategy: fixedStrategy('gpt-4o'),
		temperature: 0.8,
		maxTokens: 2500,
		systemPromptId: 'creative-writer',
		contextWindow: 25,
		enabledBuiltInTools: ['read_file', 'search_files', 'create_note', 'append_to_note'],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 100 },
		ragEnabled: true,
		webSearchEnabled: false,
		reactEnabled: false,
		reactMaxSteps: 10,
		reactAutoContinue: true
	},
	{
		name: 'Quick Assistant',
		description: 'Fast, lightweight assistant for quick questions and simple tasks. No memory or advanced features.',
		icon: '⚡',
		modelStrategy: fixedStrategy('gpt-4o-mini'),
		temperature: 0.7,
		maxTokens: 1000,
		systemPromptId: 'default',
		contextWindow: 10,
		enabledBuiltInTools: [],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 10 },
		ragEnabled: false,
		webSearchEnabled: false,
		reactEnabled: false,
		reactMaxSteps: 10,
		reactAutoContinue: true
	},
	{
		name: 'Data Analyst',
		description: 'Analyzes data, creates insights, and helps with data-driven decision making. Uses reasoning for complex analysis.',
		icon: '📊',
		modelStrategy: fixedStrategy('o1'),
		temperature: 0.5,
		maxTokens: 2000,
		systemPromptId: 'default',
		contextWindow: 20,
		enabledBuiltInTools: ['read_file', 'search_files', 'list_files'],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 50 },
		ragEnabled: false,
		webSearchEnabled: true,
		reactEnabled: true,
		reactMaxSteps: 10,
		reactAutoContinue: true
	},
	{
		name: 'Knowledge Manager',
		description: 'Manages your knowledge base with advanced file operations and search. Perfect for organizing notes.',
		icon: '🗂️',
		modelStrategy: fixedStrategy('gpt-4o'),
		temperature: 0.6,
		maxTokens: 2000,
		systemPromptId: 'default',
		contextWindow: 20,
		enabledBuiltInTools: ['read_file', 'write_file', 'list_files', 'search_files', 'create_note', 'append_to_note'],
		enabledMcpServers: [],
		enabledMcpTools: [],
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 200 },
		ragEnabled: true,
		webSearchEnabled: false,
		reactEnabled: false,
		reactMaxSteps: 10,
		reactAutoContinue: true
	}
];

export function createAgentFromTemplate(template: typeof AGENT_TEMPLATES[number]): Agent {
	return {
		...template,
		id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
}
