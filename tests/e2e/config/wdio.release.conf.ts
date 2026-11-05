/**
 * Release E2E config — real LLM + real MCP subprocess.
 * Requires .env.test with E2E_TEST_PROVIDER, E2E_TEST_API_KEY, E2E_TEST_MODEL.
 */
import * as path from 'path';
import { baseConfig } from '../../../wdio.conf';
import { resetVaultTemplate, seedReleaseProvider } from '../support/vault-fixture';
import { captureReleaseCase, installedReleaseArtifact, releaseEvidenceRoot } from '../support/release-evidence';
import { waitForPluginReady } from '../support/plugin-helpers';

export const config: typeof baseConfig = {
	...baseConfig,
	specFileRetries: 0,
	bail: process.env.IA_RELEASE_GATE === '1' ? 1 : 0,
	reporters: process.env.IA_RELEASE_GATE === '1' ? ['spec', ['junit', { outputDir: path.join(releaseEvidenceRoot(), 'junit'), outputFileFormat: ({ cid }: { cid: string }) => `wdio-${cid}.xml` }]] : baseConfig.reporters,
	capabilities: [{ browserName: 'obsidian', 'wdio:obsidianOptions': { appVersion: process.env.OBSIDIAN_VERSION || '1.14.5', installerVersion: process.env.OBSIDIAN_VERSION || '1.14.5', plugins: [path.resolve(process.env.IA_RELEASE_BUNDLE_DIR || '.')], vault: path.resolve('tests/e2e/test-vault') } }],

	specs: process.env.IA_RELEASE_GATE === '1' ? ['real-chat', 'real-agent', 'large-task', 'long-task'].map(name => path.resolve(`tests/e2e/specs/release/${name}.spec.ts`)) : [path.resolve('tests/e2e/specs/release/**/*.spec.ts')],

	mochaOpts: {
		ui: 'bdd',
		timeout: 180 * 1000,
	},

	async onPrepare() {
		if (process.env.IA_RELEASE_GATE === '1' && process.env.RUN_LONG_TASK !== '1') throw new Error('Release gate requires the real long task');
		await resetVaultTemplate();
		await seedReleaseProvider();
	},
	async beforeTest() {
		if (process.env.IA_RELEASE_GATE === '1') { await waitForPluginReady(); await installedReleaseArtifact(); }
	},
	async afterTest(test, context, result) {
		if (process.env.IA_RELEASE_GATE === '1') await captureReleaseCase(test, result);
		const hooks = baseConfig.afterTest;
		for (const hook of Array.isArray(hooks) ? hooks : hooks ? [hooks] : []) await hook(test, context, result);
	},
};
