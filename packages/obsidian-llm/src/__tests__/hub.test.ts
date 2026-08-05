import {
	LLM_HUB_API_VERSION,
	LLM_HUB_PROPERTY,
	describeResolveFailure,
	resolveLLM,
	type LLMHub,
} from '../hub';

function makeHub(apiVersion = LLM_HUB_API_VERSION): LLMHub {
	return {
		apiVersion,
		listModels: async () => [],
		getProvider: async () => null,
		getDefaultModelId: async () => null,
	};
}

function makeApp(opts: {
	plugins?: Record<string, unknown>;
	enabled?: string[];
}) {
	return {
		plugins: {
			enabledPlugins: opts.enabled ? new Set(opts.enabled) : undefined,
			plugins: opts.plugins ?? {},
		},
	};
}

describe('resolveLLM', () => {
	it('finds a hub published by an enabled plugin', () => {
		const hub = makeHub();
		const app = makeApp({
			plugins: { 'intelligence-assistant': { [LLM_HUB_PROPERTY]: hub } },
			enabled: ['intelligence-assistant'],
		});

		const result = resolveLLM(app, { pluginIds: ['intelligence-assistant'] });

		expect(result).toEqual({ ok: true, hub });
	});

	it('reports no-hub when nothing is installed', () => {
		const result = resolveLLM(makeApp({}), { pluginIds: ['intelligence-assistant'] });
		expect(result).toEqual({ ok: false, reason: 'no-hub' });
	});

	// Obsidian keeps a disabled plugin's object reachable, so presence in
	// `plugins` is not evidence that it is running.
	it('skips a plugin that is installed but disabled', () => {
		const app = makeApp({
			plugins: { 'intelligence-assistant': { [LLM_HUB_PROPERTY]: makeHub() } },
			enabled: [],
		});

		expect(resolveLLM(app, { pluginIds: ['intelligence-assistant'] }))
			.toEqual({ ok: false, reason: 'no-hub' });
	});

	it('skips a plugin that exists but publishes no hub', () => {
		const app = makeApp({
			plugins: { 'some-other-plugin': { unrelated: true } },
			enabled: ['some-other-plugin'],
		});

		expect(resolveLLM(app, { pluginIds: ['some-other-plugin'] }))
			.toEqual({ ok: false, reason: 'no-hub' });
	});

	it('reports a version mismatch rather than returning an incompatible hub', () => {
		const app = makeApp({
			plugins: { hubby: { [LLM_HUB_PROPERTY]: makeHub(99) } },
			enabled: ['hubby'],
		});

		expect(resolveLLM(app, { pluginIds: ['hubby'], expectedApiVersion: 1 }))
			.toEqual({ ok: false, reason: 'version-mismatch', found: 99, expected: 1 });
	});

	it('tries candidate ids in order', () => {
		const second = makeHub();
		const app = makeApp({
			plugins: { b: { [LLM_HUB_PROPERTY]: second } },
			enabled: ['b'],
		});

		const result = resolveLLM(app, { pluginIds: ['a', 'b'] });
		expect(result).toEqual({ ok: true, hub: second });
	});

	// Callers run in vaults the hub may not exist in at all; a missing registry
	// must degrade, not throw.
	it('does not throw on an app without a plugin registry', () => {
		expect(resolveLLM(undefined, { pluginIds: ['x'] })).toEqual({ ok: false, reason: 'no-hub' });
		expect(resolveLLM({}, { pluginIds: ['x'] })).toEqual({ ok: false, reason: 'no-hub' });
	});

	it('explains each failure in prose', () => {
		expect(describeResolveFailure({ ok: false, reason: 'no-hub' })).toContain('own configuration');
		expect(describeResolveFailure({ ok: false, reason: 'version-mismatch', found: 2, expected: 1 }))
			.toContain('version 2');
	});
});
