import { EditorPage } from '../../pages/editor/editor-page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface ChatRequest {
	messages?: Array<{ role: string; content: string }>;
}

describe('Editor quick actions', () => {
	const editor = new EditorPage();
	const vault = new VaultFixture();
	const filePath = 'E2E Quick Action.md';

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await vault.seedSettings({
			quickActionPrefix: 'QA',
			quickActions: [{
				id: 'e2e-refine-selection',
				name: 'E2E Refine Selection',
				enabled: true,
				prompt: 'Refine this E2E selection:\n\n',
				actionType: 'replace',
			}],
		});
	});

	afterEach(async () => {
		await editor.removeFile(filePath);
	});

	it('runs a selected-text quick action and replaces the editor selection with the mocked LLM response', async () => {
		await mockLLM.replyWith('Polished E2E selection.');

		const content = await editor.runQuickActionOnSelection(
			'E2E Refine Selection',
			'rough e2e selection',
			filePath
		);

		await expect(content).toBe('Polished E2E selection.');

		const calls = (await mockLLM.getCalls())
			.map(call => call.body as ChatRequest | null)
			.filter(body => Array.isArray(body?.messages));
		await expect(calls[0]?.messages?.[0]).toEqual(expect.objectContaining({
			role: 'user',
			content: 'Refine this E2E selection:\n\nrough e2e selection',
		}));
	});
});
