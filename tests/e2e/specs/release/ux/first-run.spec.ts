import { OnboardingPage } from '../../../pages/onboarding.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { reloadPlugin, waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

describe('UX review: first run', () => {
	const onboarding = new OnboardingPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async () => {
		await vault.reset();
		await waitForPluginReady();
	});

	it('#1 shows the setup guide on first launch and opens the plugin settings from it', async () => {
		await onboarding.launchAsFirstRun();

		expect(await onboarding.welcomeSteps()).toHaveLength(3);
		await probe.clickButton('Open settings', '.ia-welcome-modal');
		await onboarding.waitForPluginSettings();
		expect(await onboarding.savedLastVersion()).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('#1 does not show the guide again on the next launch', async () => {
		await browser.keys('Escape');
		await reloadPlugin();

		expect(await onboarding.welcomeSteps(3_000)).toEqual([]);
	});
});
