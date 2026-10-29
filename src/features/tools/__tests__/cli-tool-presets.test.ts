import { CLI_TOOL_PRESETS, PRESET_CATEGORIES, availablePresets } from '@/features/tools/cli-tool-presets';

describe('CLI tool presets', () => {
	it('lists only presets for the given platform', () => {
		const windows = availablePresets('win32');

		expect(windows.length).toBeGreaterThan(0);
		expect(windows.every(preset => preset.platforms.includes('win32'))).toBe(true);
		expect(windows.length).toBeLessThan(CLI_TOOL_PRESETS.length);
	});

	it('has unique ids and a display name for every category', () => {
		const ids = CLI_TOOL_PRESETS.map(preset => preset.id);

		expect(new Set(ids).size).toBe(ids.length);
		expect(CLI_TOOL_PRESETS.every(preset => Boolean(PRESET_CATEGORIES[preset.category]))).toBe(true);
	});
});
