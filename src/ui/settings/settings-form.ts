import { SecretComponent, Setting, type App } from 'obsidian';
import { applyConfigFieldMetadata } from '@/ui/utils/config-field-metadata';

type KeysOf<T, V> = { [K in keyof T]-?: NonNullable<T[K]> extends V ? K : never }[keyof T] & string;

export interface FieldOptions {
	label: string;
	description?: string;
	testId?: string;
}

export interface NumberRule {
	placeholder?: string;
	integer?: boolean;
	min?: number;
	max?: number;
}

export interface ChoiceOptions<V> {
	fallback?: V;
	then?: () => void;
}

export interface TextOptions {
	placeholder: string;
	optional?: boolean;
}

export function parseNumber(raw: string, rule: NumberRule): number | null {
	const value = rule.integer ? parseInt(raw, 10) : parseFloat(raw);
	if (isNaN(value)) return null;
	if (rule.min !== undefined && value < rule.min) return null;
	if (rule.max !== undefined && value > rule.max) return null;
	return value;
}

export function parseList(raw: string): string[] {
	return raw.split(',').map(item => item.trim()).filter(Boolean);
}

export class SettingsForm<T extends object> {
	constructor(
		private readonly container: HTMLElement,
		private readonly section: () => T,
		private readonly update: (change: () => void) => Promise<void>,
		private readonly pathPrefix: string,
	) {}

	toggle<K extends KeysOf<T, boolean>>(key: K, field: FieldOptions, options: ChoiceOptions<boolean> = {}): Setting {
		return this.setting(key, field).addToggle(toggle => {
			this.tag(toggle.toggleEl, field);
			toggle
				.setValue(this.read<boolean>(key) ?? options.fallback ?? false)
				.onChange(value => this.write(key, value, options.then));
		});
	}

	dropdown<K extends KeysOf<T, string>>(key: K, field: FieldOptions, choices: Record<string, string>, options: ChoiceOptions<string> = {}): Setting {
		return this.setting(key, field).addDropdown(dropdown => {
			this.tag(dropdown.selectEl, field);
			dropdown
				.addOptions(choices)
				.setValue(this.read<string>(key) ?? options.fallback ?? '')
				.onChange(value => this.write(key, value, options.then));
		});
	}

	text<K extends KeysOf<T, string>>(key: K, field: FieldOptions, options: TextOptions): Setting {
		return this.setting(key, field).addText(text => {
			this.tag(text.inputEl, field);
			text
				.setPlaceholder(options.placeholder)
				.setValue(this.read<string>(key) ?? '')
				.onChange(value => this.write(key, options.optional ? value.trim() || undefined : value));
		});
	}

	number<K extends KeysOf<T, number>>(key: K, field: FieldOptions, rule: NumberRule): Setting {
		return this.setting(key, field).addText(text => {
			this.tag(text.inputEl, field);
			text
				.setPlaceholder(rule.placeholder ?? '')
				.setValue(String(this.read<number>(key) ?? ''))
				.onChange(async value => {
					const parsed = parseNumber(value, rule);
					if (parsed !== null) {
						await this.write(key, parsed);
					}
				});
		});
	}

	list<K extends KeysOf<T, string[]>>(key: K, field: FieldOptions, placeholder: string): Setting {
		return this.setting(key, field).addTextArea(text => {
			this.tag(text.inputEl, field);
			text
				.setPlaceholder(placeholder)
				.setValue((this.read<string[]>(key) ?? []).join(', '))
				.onChange(value => this.write(key, parseList(value)));
		});
	}

	secret<K extends KeysOf<T, string>>(key: K, field: FieldOptions, app: App): Setting {
		return this.setting(key, field).addComponent(el => new SecretComponent(app, el)
			.setValue(this.read<string>(key) ?? '')
			.onChange(value => this.write(key, value || undefined)));
	}

	private setting(key: string, field: FieldOptions): Setting {
		return applyConfigFieldMetadata(new Setting(this.container), {
			path: `${this.pathPrefix}.${key}`,
			label: field.label,
			description: field.description,
		});
	}

	private read<V>(key: keyof T): V | undefined {
		return this.section()[key] as V | undefined;
	}

	private async write(key: keyof T, value: unknown, then?: () => void): Promise<void> {
		await this.update(() => {
			this.section()[key] = value as T[keyof T];
		});
		then?.();
	}

	private tag(element: HTMLElement, field: FieldOptions): void {
		if (field.testId) {
			element.setAttribute('data-testid', field.testId);
		}
	}
}
