/**
 * Stable selectors for E2E tests. Add new ids here as needed.
 *
 * Convention: `ia-<scope>-<element>[-<modifier>]`
 */
export const TestIds = {
	// Chat view
	chat: {
		container: 'ia-chat-container',
		input: 'ia-chat-input',
		sendBtn: 'ia-chat-send-btn',
		stopBtn: 'ia-chat-stop-btn',
		newBtn: 'ia-chat-new-btn',
		emptyState: 'ia-chat-empty-state',
		messageList: 'ia-chat-message-list',
		message: 'ia-chat-msg',                  // + data-role, data-msg-id
		modelSelect: 'ia-chat-model-select',
		modeSelect: 'ia-chat-mode-select',
		conversationToggleBtn: 'ia-chat-conversation-toggle-btn',
		conversationList: 'ia-chat-conversation-list',
		conversationItem: 'ia-chat-conversation-item', // + data-conv-id
		ragToggleBtn: 'ia-chat-rag-toggle-btn',
		ragSources: 'ia-chat-rag-sources',
		ragSourceCard: 'ia-chat-rag-source-card',
		agentTrace: 'ia-chat-agent-trace',
		agentTraceToolCard: 'ia-chat-agent-trace-tool-card',
		agentTraceToolName: 'ia-chat-agent-trace-tool-name',
		agentTraceToolOutput: 'ia-chat-agent-trace-tool-output',
	},

	// Settings shell
	settings: {
		shell: 'ia-settings-shell',
		tab: 'ia-settings-tab',                  // + data-tab-id
		generalDefaultModelInput: 'ia-general-default-model-input',
		generalConversationTitleModeSelect: 'ia-general-conversation-title-mode-select',
		generalConversationIconToggle: 'ia-general-conversation-icon-toggle',
		llmSubTab: 'ia-settings-llm-subtab',     // + data-subtab-id
		providerAddBtn: 'ia-provider-add-btn',
		providerRow: 'ia-provider-row',          // + data-provider-id
		providerEditBtn: 'ia-provider-edit-btn', // + data-provider-id
		providerRefreshBtn: 'ia-provider-refresh-btn', // + data-provider-id
		providerDeleteBtn: 'ia-provider-delete-btn', // + data-provider-id
		providerModalProviderSelect: 'ia-provider-modal-provider-select',
		providerModalModelFilterInput: 'ia-provider-modal-model-filter-input',
		providerModalApiKeyInput: 'ia-provider-modal-api-key-input',
		providerModalBaseUrlInput: 'ia-provider-modal-base-url-input',
		providerModalSaveBtn: 'ia-provider-modal-save-btn',
		providerModalCancelBtn: 'ia-provider-modal-cancel-btn',
		confirmModalConfirmBtn: 'ia-confirm-modal-confirm-btn',
		confirmModalCancelBtn: 'ia-confirm-modal-cancel-btn',
		agentAddBtn: 'ia-agent-add-btn',
		agentRow: 'ia-agent-row',              // + data-agent-id, data-agent-name
		agentEditBtn: 'ia-agent-edit-btn',     // + data-agent-id
		agentDeleteBtn: 'ia-agent-delete-btn', // + data-agent-id
		agentModalNameInput: 'ia-agent-modal-name-input',
		agentModalSaveBtn: 'ia-agent-modal-save-btn',
		mcpAddBtn: 'ia-mcp-add-btn',
		mcpRow: 'ia-mcp-row',                  // + data-mcp-name
		mcpConnectBtn: 'ia-mcp-connect-btn',   // + data-mcp-name
		mcpDeleteBtn: 'ia-mcp-delete-btn',     // + data-mcp-name
		mcpModalNameInput: 'ia-mcp-modal-name-input',
		mcpModalCommandInput: 'ia-mcp-modal-command-input',
		mcpModalArgsInput: 'ia-mcp-modal-args-input',
		mcpModalSaveBtn: 'ia-mcp-modal-save-btn',
		ragEnableToggle: 'ia-rag-enable-toggle',
		ragRebuildBtn: 'ia-rag-rebuild-btn',
		ragStats: 'ia-rag-stats',
	},
} as const;
