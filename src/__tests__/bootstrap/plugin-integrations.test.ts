import { registerIncrementalRagIndexing } from '@/bootstrap/plugin-integrations';

describe('registerIncrementalRagIndexing', () => {
	it('listens to vault events only once the workspace layout is ready', () => {
		let ready: () => void = () => undefined;
		const on = jest.fn((_event: string, _callback: (...args: unknown[]) => void) => ({}));
		const plugin = {
			app: {
				vault: { on },
				metadataCache: { on },
				workspace: { onLayoutReady: (callback: () => void) => { ready = callback; } },
			},
			registerEvent: jest.fn(),
		};

		registerIncrementalRagIndexing(plugin as never, () => null, () => undefined);
		expect(on).not.toHaveBeenCalled();

		ready();
		expect(on.mock.calls.map(([event]) => event)).toEqual(['create', 'modify', 'delete', 'rename', 'changed']);
		expect(plugin.registerEvent).toHaveBeenCalledTimes(5);
	});
});
