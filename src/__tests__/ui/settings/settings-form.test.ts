import { App, type Setting } from 'obsidian';
import { SettingsForm, parseList, parseNumber } from '@/ui/settings/settings-form';

interface Section {
	enabled: boolean;
	mode: string;
	model: string;
	endpoint?: string;
	limit: number;
	weight: number;
	tags: string[];
	auto?: boolean;
	keySecret?: string;
}

type Control = { value: unknown; placeholder: string; options: Record<string, string>; change(value: unknown): Promise<void> };
const control = (setting: Setting): Control => (setting as unknown as { components: Control[] }).components[0];

const makeForm = (section: Section) => {
	const save = jest.fn(async (change: () => void) => change());
	const form = new SettingsForm(document.createElement('div'), () => section, save, 'testConfig');
	return { form, save };
};

const section = (): Section => ({ enabled: false, mode: 'a', model: 'm', limit: 5, weight: 0.5, tags: ['x'] });

describe('parseNumber', () => {
	it('accepts integers inside the bounds', () => {
		expect(parseNumber('7', { integer: true, min: 1, max: 20 })).toBe(7);
	});

	it('rejects values outside the bounds or not numbers', () => {
		expect(parseNumber('0', { integer: true, min: 1 })).toBeNull();
		expect(parseNumber('21', { integer: true, max: 20 })).toBeNull();
		expect(parseNumber('abc', {})).toBeNull();
	});

	it('keeps fractions unless the rule is integer', () => {
		expect(parseNumber('0.75', { min: 0, max: 1 })).toBe(0.75);
		expect(parseNumber('2.9', { integer: true })).toBe(2);
	});
});

describe('parseList', () => {
	it('splits on commas and drops blanks', () => {
		expect(parseList(' md, txt ,, ')).toEqual(['md', 'txt']);
	});
});

describe('SettingsForm', () => {
	it('labels the setting and shows the current value', () => {
		const { form } = makeForm(section());

		const setting = form.number('limit', { label: 'Limit' }, { placeholder: '5', integer: true, min: 1 });

		expect(setting.nameEl.textContent).toBe('Limit');
		expect(control(setting).value).toBe('5');
		expect(control(setting).placeholder).toBe('5');
	});

	it('writes a valid number and saves', async () => {
		const target = section();
		const { form, save } = makeForm(target);

		await control(form.number('limit', { label: 'Limit' }, { placeholder: '5', integer: true, min: 1 })).change('9');

		expect(target.limit).toBe(9);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('ignores an invalid number without saving', async () => {
		const target = section();
		const { form, save } = makeForm(target);

		await control(form.number('weight', { label: 'Weight' }, { placeholder: '0.5', min: 0, max: 1 })).change('3');

		expect(target.weight).toBe(0.5);
		expect(save).not.toHaveBeenCalled();
	});

	it('runs the follow-up after a toggle is saved', async () => {
		const target = section();
		const { form, save } = makeForm(target);
		const then = jest.fn(() => expect(save).toHaveBeenCalled());

		await control(form.toggle('enabled', { label: 'Enabled' }, { then })).change(true);

		expect(target.enabled).toBe(true);
		expect(then).toHaveBeenCalledTimes(1);
	});

	it('shows the fallback for an unset toggle', () => {
		const { form } = makeForm(section());

		expect(control(form.toggle('auto', { label: 'Auto' }, { fallback: true })).value).toBe(true);
	});

	it('offers dropdown options and writes the choice', async () => {
		const target = section();
		const { form } = makeForm(target);

		const dropdown = control(form.dropdown('mode', { label: 'Mode' }, { a: 'A', b: 'B' }));
		await dropdown.change('b');

		expect(dropdown.options).toEqual({ a: 'A', b: 'B' });
		expect(target.mode).toBe('b');
	});

	it('clears an optional text field when left blank', async () => {
		const target: Section = { ...section(), endpoint: 'https://x' };
		const { form } = makeForm(target);

		await control(form.text('endpoint', { label: 'Endpoint' }, { placeholder: 'https://', optional: true })).change('  ');

		expect(target.endpoint).toBeUndefined();
	});

	it('keeps a plain text field as typed', async () => {
		const target = section();
		const { form } = makeForm(target);

		await control(form.text('model', { label: 'Model' }, { placeholder: 'model' })).change('gpt ');

		expect(target.model).toBe('gpt ');
	});

	it('edits a list as comma separated text', async () => {
		const target = section();
		const { form } = makeForm(target);

		const list = control(form.list('tags', { label: 'Tags' }, 'a, b'));
		expect(list.value).toBe('x');

		await list.change('a, b');
		expect(target.tags).toEqual(['a', 'b']);
	});

	it('tags the control element with a test id', () => {
		const { form } = makeForm(section());

		const setting = form.toggle('enabled', { label: 'Enabled', testId: 'enable-toggle' });

		expect((control(setting) as unknown as { toggleEl: HTMLElement }).toggleEl.getAttribute('data-testid')).toBe('enable-toggle');
	});

	it('stores the chosen secret name, and clears it when the secret is unset', async () => {
		const current = { ...section(), keySecret: 'old' };
		const { form, save } = makeForm(current);

		const setting = form.secret('keySecret', { label: 'Key' }, new App());

		expect(control(setting).value).toBe('old');
		await control(setting).change('new');
		expect(current.keySecret).toBe('new');
		await control(setting).change(null);
		expect(current.keySecret).toBeUndefined();
		expect(save).toHaveBeenCalledTimes(2);
	});
});
