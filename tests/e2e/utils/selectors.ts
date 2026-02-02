/**
 * Common CSS selectors for e2e tests
 */

export const SELECTORS = {
	// Top-level elements
	settingsButton: 'button[title="Open plugin settings"]',

	// Settings
	settings: {
		modal: '.modal.mod-settings',
		sidebar: '.vertical-tab-nav',
		sidebarItem: '.vertical-tab-nav-item',
		content: '.vertical-tab-content',
		pluginItem: (name: string) => `div.vertical-tab-nav-item*=${name}`,
		container: '.vertical-tab-content',
		validationError: '.validation-error',
		validationWarning: '.validation-warning',

		// LLM settings shortcuts (for convenience in tests)
		llm: {
			addProviderButton: '.settings-tab-content .ia-section-actions .ia-button--primary',
			providerTypeSelect: `${settingByName('Provider')}//select`,
			providerNameInput: `${settingByName('Name')}//input`,
			apiKeyInput: `${settingByName('API Key')}//input`,
			baseUrlInput: `${settingByName('Base URL')}//input`,
			commandPathInput: `${settingByName('CLI command path')}//input`,
			configModal: '//div[contains(@class, "modal") and .//h2[contains(text(), "Provider settings")]]',
			saveButton: 'button*=Save',
			cancelButton: 'button*=Cancel',
		},

		// MCP settings shortcuts (for convenience in tests)
		mcp: {
			addServerButton: '//div[contains(@class, "settings-tab-content")]//div[contains(@class, "ia-toolbar")]//button[contains(., "Add MCP server")]',
			serverNameInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Server name")]]//input',
			commandInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Command")]]//input',
			argsInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Arguments")]]//input',
			envTextarea: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Environment")]]//textarea',
			configModal: '//div[contains(@class, "modal") and .//h2[contains(text(), "MCP server")]]',
			saveButton: 'button*=Save',
			cancelButton: 'button*=Cancel',
		},

		// Agent settings shortcuts (for convenience in tests)
		agents: {
			createButton: 'button*=Create agent',
			agentsList: '.agents-list',
			nameInput: `${settingByName('Name')}//input`,
			descriptionInput: `${settingByName('Description')}//textarea`,
			systemPromptInput: `${settingByName('System prompt')}//textarea`,
			modelSelect: `${settingByName('Model')}//select`,
			toolsList: '.tools-list',
			saveButton: 'button*=Save',
			cancelButton: 'button*=Cancel',
		},
	},

	// Plugin settings tabs
	tabs: {
		general: '.settings-tab*=General',
		llm: '.settings-tab*=LLM',
		mcp: '.settings-tab*=MCP',
		rag: '.settings-tab*=RAG',
		quickActions: '.settings-tab*=Quick Actions',
		workflow: '.settings-tab*=Workflow',
	},

	// Setting items
	settingItem: {
		container: '.setting-item',
		name: '.setting-item-name',
		description: '.setting-item-description',
		control: '.setting-item-control',
	},

	// Chat view
	chat: {
		// Main view
		view: '.workspace-leaf-content[data-type="intelligence-assistant-chat"]',
		container: '.intelligence-assistant-chat-container',

		// Header elements (from createTopControls and createActionRow in chat-view.ts)
		header: '.chat-top-controls', // Container for mode/prompt/agent selectors
		actionRow: '.chat-action-row', // Container for new chat/settings buttons

				// Model selector and related elements

				modelSelector: '.ia-model-select', // The actual select element

				modelSelectorContainer: '.ia-model-select-group', // The group containing the model select

				modelCountBadge: '.ia-model-count', // Span displaying model count

				tokenSummary: '.ia-token-summary-display', // Span displaying model summary



				newChatButton: 'button[title="New conversation"]',

				settingsButton: 'button[title="Open plugin settings"]',

				toggleConversationsButton: 'button[title="Toggle conversation list"]',

		// Input area
		inputContainer: '.chat-input-container', // Parent container for the chat input
		input: '.chat-input',
		stopButton: '.stop-generation-btn',
		attachmentButton: 'button[title*="Attach"]',
		ragButton: 'button[title*="RAG"]',
		webSearchButton: 'button[title*="Web"]',

		// Messages
		messageList: '.chat-messages',
		message: '.ia-chat-message',
		userMessage: '.ia-chat-message--user',
		assistantMessage: '.ia-chat-message--assistant',
		messageContent: '.ia-chat-message__content',
		messageStatus: '.ia-chat-message__status',
		messageAvatar: '.ia-chat-message__avatar',
		messageHeader: '.ia-chat-message__header',
		messageLabel: '.ia-chat-message__label',
		messageBody: '.ia-chat-message__body',

		// Tool execution traces
		toolExecutionTrace: '.tool-execution-trace',
		toolCall: '.tool-call',
		toolName: '.tool-name',
		toolResult: '.tool-result',

		// Streaming indicators
		streamingMessage: '.ia-chat-message--streaming',
		thinkingIndicator: '.ia-thinking-indicator',
		cursor: '.ia-cursor',

		// Error/empty states
		errorMessage: '.ia-error-message',
		emptyState: '.ia-empty-state',

		// Chat modes
		modeSelector: '.mode-selector',
		modeButton: (mode: string) => `button[data-mode="${mode}"]`,
		agentSelector: '.agent-selector',
		agentOption: (agentName: string) => `//div[contains(text(), '${agentName}')]`,

		// Conversation management
		conversationList: '.conversation-list',
		conversationItem: '.conversation-item',
		conversationTitle: '.conversation-title',
		conversationActions: '.conversation-actions',
		conversationDeleteButton: 'button[aria-label*="Delete"]',
	},

	// Workflow editor
	workflow: {
		view: '.workspace-leaf-content[data-type="workflow-editor-view"]',
		container: '.workflow-editor-v2-container',
		toolbar: '.workflow-v2-toolbar',
		nodePalette: '.sidebar-node-list',
	},

	// LLM settings
	llm: {
		sectionTitle: '.settings-tab-content h3',
		description: '.settings-tab-content .ia-section-description',
		subtabButton: '.ia-llm-subtab-btn',
		summary: '.settings-tab-content .ia-section-summary',
		addProviderButton: '.settings-tab-content .ia-section-actions .ia-button--primary',
		table: '.settings-tab-content .ia-table',
		tableRows: '.settings-tab-content .ia-table .ia-table-row',
		statusBadge: '.ia-status-badge',
		filterControl: '.settings-tab-content .ia-filter-control',
		capabilityTag: '.settings-tab-content .ia-tag',

		// Provider management
		providerRow: (providerName: string) =>
			`//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "ia-provider-name") and contains(text(), "${providerName}")]]`,
		editButton: (providerName: string) =>
			`//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "ia-provider-name") and contains(text(), "${providerName}")]]//button[contains(., "Edit")]`,
		deleteButton: (providerName: string) =>
			`//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "ia-provider-name") and contains(text(), "${providerName}")]]//button[contains(., "Delete")]`,
		refreshButton: (providerName: string) =>
			`//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "ia-provider-name") and contains(text(), "${providerName}")]]//button[contains(@title, "Refresh")]`,

		// Provider config modal
		modal: {
			container: '//div[contains(@class, "modal") and .//h2[contains(text(), "Provider settings")]]',
			providerDropdown: `${settingByName('Provider')}//select`,
			apiKeyInput: `${settingByName('API Key')}//input`,
			baseUrlInput: `${settingByName('Base URL')}//input`,
			serviceKeyInput: `${settingByName('Service key')}//textarea`,
			modelFilterInput: `${settingByName('Model filter')}//input`,
			resourceGroupInput: `${settingByName('Resource group')}//input`,
			commandPathInput: `${settingByName('CLI command path')}//input`,
			saveButton: 'button*=Save',
			cancelButton: 'button*=Cancel',
		},

		// Model management
		modelRow: (modelName: string) =>
			`//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "ia-provider-name") and contains(text(), "${modelName}")]]`,
		enableToggle: (modelName: string) =>
			`//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "ia-provider-name") and contains(text(), "${modelName}")]]//input[@type="checkbox"]`,

		// Model filters
		providerFilterDropdown: '.ia-filter-control select[data-filter="provider"]',
		capabilityFilterDropdown: '.ia-filter-control select[data-filter="capability"]',
		statusFilterDropdown: '.ia-filter-control select[data-filter="status"]',
		searchInput: '.ia-filter-control input[type="search"]',
		clearFiltersButton: 'button*=Clear filters',

		// Ollama specific
		ollamaManageButton: 'button*=Manage models',
		ollamaVersionText: '.ia-table-subtext*=version',
	},

	// MCP settings
	mcp: {
		// Toolbar
		toolbar: '.settings-tab-content .ia-toolbar',
		toolbarButtons: '.settings-tab-content .ia-toolbar .ia-button',
		inspectorButton: '//div[contains(@class, "settings-tab-content")]//div[contains(@class, "ia-toolbar")]//button[contains(., "MCP inspector")]',
		testAllButton: '//div[contains(@class, "settings-tab-content")]//div[contains(@class, "ia-toolbar")]//button[contains(., "test all connections")]',
		refreshAllButton: '//div[contains(@class, "settings-tab-content")]//div[contains(@class, "ia-toolbar")]//button[contains(., "refresh all tools")]',
		addButton: '//div[contains(@class, "settings-tab-content")]//div[contains(@class, "ia-toolbar")]//button[contains(., "Add MCP server")]',

		// Table
		emptyState: '.settings-tab-content .ia-empty-state',
		table: '.settings-tab-content .ia-table',
		tableRows: '.settings-tab-content .ia-table .ia-table-row',
		rowActions: '.ia-table-actions .ia-button',

		// Table cells
		nameCell: '.ia-table-cell:nth-child(1)',
		commandCell: '.ia-table-cell:nth-child(2)',
		argsCell: '.ia-table-cell:nth-child(3)',
		statusCell: '.ia-table-cell:nth-child(4)',
		toolsCell: '.ia-table-cell:nth-child(5)',
		actionsCell: '.ia-table-cell:nth-child(6)',

		// Status indicators
		statusBadge: '.ia-status-badge',
		countBadge: '.ia-count-badge',
		statusStack: '.ia-table-stack',
		statusDetails: '.ia-table-subtext',

		// Row-specific selectors (functions)
		serverRow: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]`,
		editButton: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//button[contains(., "Edit")]`,
		deleteButton: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//button[contains(., "Delete")]`,
		connectButton: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//button[contains(., "connect")]`,
		disconnectButton: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//button[contains(., "disconnect")]`,
		testButton: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//button[contains(., "Test")]`,
		enabledToggle: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//button[contains(text(), "Enabled") or contains(text(), "Disabled")]`,
		toolCountBadge: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//span[contains(@class, "ia-count-badge")]`,
		statusIndicator: (serverName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-primary") and contains(text(), "${serverName}")]]//span[contains(@class, "ia-status-badge")]`,

		// MCP Server Modal
		modal: {
			container: '//div[contains(@class, "modal") and .//h2[contains(text(), "MCP server")]]',
			header: '.modal h2',
			nameInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Server name")]]//input',
			serverNameInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Server name")]]//input',
			commandInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Command")]]//input',
			argsInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Arguments")]]//input',
			envTextarea: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Environment")]]//textarea',
			connectionModeDropdown: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Connection mode")]]//select',
			enabledToggle: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Enabled")]]//div[contains(@class, "checkbox-container")]',
			saveButton: 'button*=Save',
			addServerButton: 'button*=Add server',
			cancelButton: 'button*=Cancel',
			settingItem: '.setting-item',
		},

		// MCP Inspector Modal
		inspector: {
			modal: '//div[contains(@class, "modal") and .//h2[contains(text(), "MCP")]]',
			header: '.modal h2',
			toolList: '.ia-tool-list',
			toolItem: '.ia-tool-item',
			toolName: '.ia-tool-name',
			toolDescription: '.ia-tool-description',
			toolSchema: '.ia-tool-schema',
			closeButton: 'button*=Close',
			emptyState: '.ia-empty-state',
		},
	},

	// Tools settings
	tools: {
		// Tab navigation
		tab: '.settings-tab*=Tools',
		tabBar: '.settings-tabs',
		builtInSubtab: '.settings-tabs .settings-tab[data-slug="built-in"]',
		mcpSubtab: '.settings-tabs .settings-tab[data-slug="mcp"]',
		openapiSubtab: '.settings-tabs .settings-tab[data-slug="openapi"]',
		activeSubtab: '.settings-tab.is-active',
		tabContent: '.settings-tab-content',

		// Built-in Tools
		builtInTable: '.settings-tab-content .ia-table',
		builtInTableRows: '.settings-tab-content .ia-table .ia-table-row',
		builtInToolRow: (toolName: string) => `//tr[contains(@class, "ia-table-row") and .//span[contains(@class, "tool-name") and contains(text(), "${toolName}")]]`,
		toolName: '.tool-name',
		toolIcon: '.tool-icon',
		toolCheckbox: 'input[type="checkbox"]',
		toolCategory: '.ia-table-cell:nth-child(2)',
		toolDescription: '.ia-table-cell:nth-child(3)',
		toolParameters: '.ia-table-cell:nth-child(4)',
		toolEnabledCell: '.ia-table-cell:nth-child(5)',
		infoCallout: '.info-callout',

		// MCP Tools (read-only)
		mcpToolsTable: '.settings-tab-content .ia-table',
		mcpToolsTableRows: '.settings-tab-content .ia-table .ia-table-row',
		mcpToolRow: '.ia-table-row',
		mcpServerCell: '.ia-table-cell:nth-child(1)',
		mcpToolNameCell: '.ia-table-cell:nth-child(2)',
		mcpToolDescriptionCell: '.ia-table-cell:nth-child(3)',
		mcpToolParametersCell: '.ia-table-cell:nth-child(4)',
		mcpToolSourceCell: '.ia-table-cell:nth-child(5)',
		mcpServerStatus: '.ia-status-badge',
		mcpEmptyState: '.ia-table-subtext',

		// OpenAPI Tools
		openApiAddButton: 'button*=Add HTTP source',
		openApiTable: '.settings-tab-content .ia-table',
		openApiTableRows: '.settings-tab-content .ia-table .ia-table-row',
		openApiSourceRow: (sourceName: string) => `//tr[contains(@class, "ia-table-row") and .//*[contains(text(), "${sourceName}")]]`,
		openApiEditButton: (sourceName: string) => `//tr[contains(@class, "ia-table-row") and .//*[contains(text(), "${sourceName}")]]//button[contains(., "Edit")]`,
		openApiReloadButton: (sourceName: string) => `//tr[contains(@class, "ia-table-row") and .//*[contains(text(), "${sourceName}")]]//button[contains(., "Reload")]`,
		openApiRefetchButton: (sourceName: string) => `//tr[contains(@class, "ia-table-row") and .//*[contains(text(), "${sourceName}")]]//button[contains(., "Refetch")]`,
		openApiDeleteButton: (sourceName: string) => `//tr[contains(@class, "ia-table-row") and .//*[contains(text(), "${sourceName}")]]//button[contains(., "Delete")]`,
		openApiEmptyState: '.ia-table-subtext',

		// OpenAPI Modal
		openApiModal: {
			container: '//div[contains(@class, "modal") and .//h3[contains(text(), "HTTP")]]',
			header: '.modal h3',
			nameInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Display name")]]//input',
			enabledToggle: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Enabled")]]//div[contains(@class, "checkbox-container")]',
			sourceTypeDropdown: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Source type")]]//select',
			filePathInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "file path")]]//input',
			urlInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "URL")]]//input',
			baseUrlInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Base URL")]]//input',
			authDropdown: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Authentication")]]//select',
			credKeyInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Credential key")]]//input',
			credValueInput: '//div[contains(@class, "setting-item")][.//div[contains(@class, "setting-item-name") and contains(text(), "Credential value")]]//input',
			reloadButton: 'button*=Reload tools',
			refetchButton: 'button[aria-label*=Refetch]',
			deleteButton: 'button[aria-label*=Delete]',
			cachePathText: 'p*=Cached file',
		},
	},

	// RAG settings
	rag: {
		// Tab navigation
		tab: '.settings-tab*=RAG',
		tabContent: '.settings-tab-content',
		subtabBar: '.settings-tabs',
		overviewSubtab: '//button[contains(@class, "ia-rag-subtab-btn") and contains(text(), "Overview")]',
		chunkingSubtab: '//button[contains(@class, "ia-rag-subtab-btn") and contains(text(), "Chunking")]',
		searchSubtab: '//button[contains(@class, "ia-rag-subtab-btn") and contains(text(), "Search")]',
		filtersSubtab: '//button[contains(@class, "ia-rag-subtab-btn") and contains(text(), "Filters")]',
		advancedSubtab: '//button[contains(@class, "ia-rag-subtab-btn") and contains(text(), "Advanced")]',
		websearchSubtab: '//button[contains(@class, "ia-rag-subtab-btn") and contains(text(), "Web Search")]',
		activeSubtab: '.settings-tab.is-active',

		// Overview subtab
		overview: {
			enabledToggle: `${settingByName('Enable RAG')}//div[@class="checkbox-container"]`,
			embeddingModelDropdown: `${settingByName('Embedding model')}//select`,
			vectorStoreDropdown: `${settingByName('Vector store')}//select`,
			autoEmbedToggle: `${settingByName('Auto-embed')}//div[@class="checkbox-container"]`,

			// Index management
			indexStats: '.rag-index-stats',
			docCountText: '.rag-index-stats .doc-count',
			chunkCountText: '.rag-index-stats .chunk-count',
			indexSizeText: '.rag-index-stats .index-size',
			rebuildButton: 'button*=Rebuild index',
			refreshButton: 'button*=Refresh index',
			clearButton: 'button*=Clear index',
			operationProgress: '.rag-operation-progress',
		},

		// Chunking subtab
		chunking: {
			strategyDropdown: `${settingByName('Chunking strategy')}//select`,
			chunkSizeInput: `${settingByName('Chunk size')}//input`,
			chunkOverlapInput: `${settingByName('Chunk overlap')}//input`,
			maxTokensInput: `${settingByName('Max tokens per chunk')}//input`,
			minChunkSizeInput: `${settingByName('Min chunk size')}//input`,
		},

		// Search subtab
		search: {
			searchTypeDropdown: `${settingByName('Search type')}//select`,
			topKInput: `${settingByName('Top K')}//input`,
			topKSlider: `${settingByName('Top K')}//input[@type="range"]`,
			similarityThresholdInput: `${settingByName('Similarity threshold')}//input`,
			similarityThresholdSlider: `${settingByName('Similarity threshold')}//input[@type="range"]`,
			relevanceWeightInput: `${settingByName('Relevance score weight')}//input`,
		},

		// Filters subtab
		filters: {
			// Folder exclusions
			excludeFoldersList: '.rag-exclude-folders-list',
			excludeFoldersInput: `${settingByName('Exclude folders')}//input`,
			addFolderButton: 'button*=Add folder',
			removeFolderButton: (folder: string) => `button[aria-label*="Remove ${folder}"]`,
			folderItem: (folder: string) => `.rag-exclude-folders-list*="${folder}"`,

			// File type inclusions
			includeFileTypesList: '.rag-include-types-list',
			includeFileTypesInput: `${settingByName('Include file types')}//input`,
			addIncludeTypeButton: 'button*=Add include type',
			removeIncludeTypeButton: (type: string) => `button[aria-label*="Remove ${type}"]`,
			includeTypeItem: (type: string) => `.rag-include-types-list*="${type}"`,

			// File type exclusions
			excludeFileTypesList: '.rag-exclude-types-list',
			excludeFileTypesInput: `${settingByName('Exclude file types')}//input`,
			addExcludeTypeButton: 'button*=Add exclude type',
			removeExcludeTypeButton: (type: string) => `button[aria-label*="Remove ${type}"]`,
			excludeTypeItem: (type: string) => `.rag-exclude-types-list*="${type}"`,

			// Tag filters
			filterTagsList: '.rag-filter-tags-list',
			filterTagsInput: `${settingByName('Filter by tags')}//input`,
			addFilterTagButton: 'button*=Add filter tag',
			removeFilterTagButton: (tag: string) => `button[aria-label*="Remove ${tag}"]`,
			filterTagItem: (tag: string) => `.rag-filter-tags-list*="${tag}"`,

			// Tag exclusions
			excludeTagsList: '.rag-exclude-tags-list',
			excludeTagsInput: `${settingByName('Exclude tags')}//input`,
			addExcludeTagButton: 'button*=Add exclude tag',
			removeExcludeTagButton: (tag: string) => `button[aria-label*="Remove ${tag}"]`,
			excludeTagItem: (tag: string) => `.rag-exclude-tags-list*="${tag}"`,

			// Filters management
			clearAllButton: 'button*=Clear all filters',
			filterSummary: '.rag-filter-summary',
		},

		// Advanced subtab
		advanced: {
			// Compression
			compressionToggle: `${settingByName('Enable compression')}//div[@class="checkbox-container"]`,

			// Batch processing
			batchSizeInput: `${settingByName('Embedding batch size')}//input`,

			// Indexing
			indexingModeDropdown: `${settingByName('Indexing mode')}//select`,
			contextWindowInput: `${settingByName('Context window limit')}//input`,

			// Semantic caching
			semanticCachingToggle: `${settingByName('Enable semantic caching')}//div[@class="checkbox-container"]`,
			cacheSizeInput: `${settingByName('Cache size')}//input`,

			// Re-ranking
			reRankingToggle: `${settingByName('Enable re-ranking')}//div[@class="checkbox-container"]`,
			reRankingModelDropdown: `${settingByName('Re-ranking model')}//select`,

			// Document grading
			gradingToggle: `${settingByName('Enable grading threshold')}//div[@class="checkbox-container"]`,
			gradingThresholdInput: `${settingByName('Grading threshold')}//input`,
			gradingThresholdSlider: `${settingByName('Grading threshold')}//input[@type="range"]`,
		},

		// Common elements
		infoCallout: '.info-callout',
		validationError: '.validation-error',
		helpText: '.setting-item-description',
		settingItem: '.setting-item',
	},

	// Quick Actions settings
	quickActions: {
		// Tab navigation
		tab: '.settings-tab*=Quick Actions',
		tabContent: '.settings-tab-content',

		// Action prefix
		prefixInput: `${settingByName('Action prefix')}//input`,

		// Summary and actions
		summary: '.ia-section-summary',
		summaryText: '.ia-section-summary span',
		addButton: 'button*=add quick action',

		// Table
		table: '.settings-tab-content .ia-table',
		tableRows: '.settings-tab-content .ia-table .ia-table-row',
		emptyState: '.ia-empty-state',

		// Row-specific selectors (functions)
		actionRow: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]`,
		actionNameCell: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//div[contains(@class, "ia-table-title")]`,
		enableCheckbox: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//input[@type="checkbox"]`,
		typeBadge: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//span[contains(@class, "ia-tag")]`,
		modelCell: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//div[contains(@class, "ia-table-cell")][3]`,
		promptPreview: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//div[contains(@class, "ia-table-subtext")]`,
		editButton: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//button[contains(., "Edit")]`,
		deleteButton: (actionName: string) => `//tr[contains(@class, "ia-table-row") and .//div[contains(@class, "ia-table-title") and contains(text(), "${actionName}")]]//button[contains(., "delete")]`,

		// Edit Modal
		modal: {
			container: '.modal',
			header: '.modal h2',
			nameInput: `//div[contains(@class, "modal")]${settingByName('Name')}//input`,
			actionTypeDropdown: `//div[contains(@class, "modal")]${settingByName('Action type')}//select`,
			modelDropdown: `//div[contains(@class, "modal")]${settingByName('Model')}//select`,
			promptTextarea: `//div[contains(@class, "modal")]${settingByName('Prompt template')}//textarea`,
			saveButton: 'button*=Save',
			cancelButton: 'button*=Cancel',
		},

		// Usage info
		usageInfo: '.ia-info-box',
		usageTitle: '.ia-info-box h4',
		usageList: '.ia-info-box ul',
	},

	// General settings
	general: {
		defaultModelInput: `${settingByName('Default model')}//input`,
		defaultChatModeDropdown: `${settingByName('Default chat mode')}//select`,
		conversationTitleModeDropdown: `${settingByName('Conversation title mode')}//select`,
		conversationIconToggle: `${settingByName('Conversation icons')}//div[@class="checkbox-container"]`,
		configStatusText: `${settingByName('Configuration status')}//input`,
	},

	// Agent settings
	agents: {
		// Agent list
		agentsList: '.agents-list',
		agentItem: '.agent-item',
		agentName: '.agent-name',
		agentDescription: '.agent-description',

		// Agent management buttons
		createButton: 'button*=Create agent',
		editButton: (agentName: string) => `//button[@aria-label="Edit ${agentName}"]`,
		deleteButton: (agentName: string) => `//button[@aria-label="Delete ${agentName}"]`,

		// Agent modal
		nameInput: `${settingByName('Name')}//input`,
		descriptionInput: `${settingByName('Description')}//textarea`,
		systemPromptInput: `${settingByName('System prompt')}//textarea`,
		modelSelect: `${settingByName('Model')}//select`,
		toolsList: '.tools-list',
		saveButton: 'button*=Save',
		cancelButton: 'button*=Cancel',
	},

	// Common UI elements
	common: {
		button: 'button',
		input: 'input',
		textarea: 'textarea',
		select: 'select',
		dropdown: '.dropdown',
		modal: '.modal',
		notice: '.notice',
		validationError: '.validation-error',
	},
};

/**
 * Build a selector for a setting item by name
 */
export function settingByName(name: string): string {
	return `//div[contains(@class, "setting-item") and .//div[contains(@class, "setting-item-name") and contains(text(), "${name}")]]`;
}

/**
 * Build a selector for a button by text
 */
export function buttonByText(text: string): string {
	return `button*=${text}`;
}