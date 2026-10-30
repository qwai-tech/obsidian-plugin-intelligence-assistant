import { waitForPluginReady } from '../../support/plugin-helpers';

const STARTUP_BUDGET_MS = 1_000;

describe('Plugin startup', () => {
	it(`loads and has its services ready within ${STARTUP_BUDGET_MS} ms`, async () => {
		await waitForPluginReady();

		const timings = await browser.execute(async (pluginId) => {
			const plugins = (window as unknown as {
				app: { plugins: {
					disablePlugin(id: string): Promise<void>;
					enablePlugin(id: string): Promise<void>;
					plugins: Record<string, { whenServicesReady(): Promise<unknown> }>;
				} };
			}).app.plugins;
			const runs: number[] = [];
			for (let run = 0; run < 3; run++) {
				await plugins.disablePlugin(pluginId);
				const start = performance.now();
				await plugins.enablePlugin(pluginId);
				await plugins.plugins[pluginId].whenServicesReady();
				runs.push(performance.now() - start);
			}
			return runs;
		}, 'intelligence-assistant');

		expect(Math.min(...timings)).toBeLessThan(STARTUP_BUDGET_MS);
	});
});
