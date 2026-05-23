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
	},

	// Settings shell
	settings: {
		shell: 'ia-settings-shell',
		tab: 'ia-settings-tab',                  // + data-tab-id
	},
} as const;
