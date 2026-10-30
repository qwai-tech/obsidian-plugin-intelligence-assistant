import { QuickActionsSettingsPage } from '../../pages/settings/quick-actions-settings.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { VaultFixture, type StoredSettings } from '../../support/vault-fixture';

const refineAction = (settings: StoredSettings) => settings.config.quickActions?.list?.find(item => item.name === 'E2E Refine Selection');

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

		const settings = await vault.waitForSettings(
			candidate => refineAction(candidate)?.enabled === false,
			'Quick action did not persist enabled=false'
		);
		expect(settings.config.quickActions?.prefix).toBe('QA');
		expect(refineAction(settings)).toEqual(expect.objectContaining({
			enabled: false,
			prompt: 'Refine this E2E selection:\n\n',
			actionType: 'replace',
		}));

		await quickActions.setActionEnabled('E2E Refine Selection', true);
		await vault.waitForSettings(
			candidate => refineAction(candidate)?.enabled === true,
			'Quick action did not persist enabled=true'
		);

		await quickActions.deleteAction('E2E Refine Selection');
		await vault.waitForSettings(
			candidate => refineAction(candidate) === undefined,
			'Quick action was not removed'
		);
	});
});
