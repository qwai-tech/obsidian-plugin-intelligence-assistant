export function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function hasProperty<T extends string>(value: unknown, property: T): value is Record<T, unknown> {
	return typeof value === 'object' && value !== null && property in value;
}

export function hasSettings(app: unknown): app is { setting: { open: () => void; openTabById: (id: string) => void } } {
	return hasProperty(app, 'setting')
		&& hasProperty(app.setting, 'open')
		&& hasProperty(app.setting, 'openTabById')
		&& typeof app.setting.open === 'function'
		&& typeof app.setting.openTabById === 'function';
}
