import { QuickActionsSettingsPage } from '../../pages/settings/quick-actions-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture } from '../../support/vault-fixture';

interface UserSettings {
	quickActions?: {
		list?: Array<{
			id: string;
			name: string;
			enabled: boolean;
			prompt: string;
			actionType: string;
		}>;
		prefix?: string;
	};
}

describe('Quick action settings', () => {
	const quickActions = new QuickActionsSettingsPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	it('creates, edits, toggles, persists, and deletes a quick action', async () => {
		await quickActions.setPrefix('QA');
		await quickActions.addAction();
		await quickActions.editAction('New Quick Action', {
			name: 'E2E Refine Selection',
			actionType: 'replace',
			prompt: 'Refine this E2E selection:\n\n',
		});
		await quickActions.setActionEnabled('E2E Refine Selection', false);

		let settings = await vault.readRuntimeDataFile<UserSettings>('config/user/settings.json');
		let action = settings.quickActions?.list?.find(item => item.name === 'E2E Refine Selection');
		await expect(settings.quickActions?.prefix).toBe('QA');
		await expect(action).toEqual(expect.objectContaining({
			enabled: false,
			prompt: 'Refine this E2E selection:\n\n',
			actionType: 'replace',
		}));

		await quickActions.setActionEnabled('E2E Refine Selection', true);
		settings = await vault.readRuntimeDataFile<UserSettings>('config/user/settings.json');
		action = settings.quickActions?.list?.find(item => item.name === 'E2E Refine Selection');
		await expect(action).toEqual(expect.objectContaining({ enabled: true }));

		await quickActions.deleteAction('E2E Refine Selection');

		settings = await vault.readRuntimeDataFile<UserSettings>('config/user/settings.json');
		action = settings.quickActions?.list?.find(item => item.name === 'E2E Refine Selection');
		await expect(action).toBeUndefined();
	});
});
