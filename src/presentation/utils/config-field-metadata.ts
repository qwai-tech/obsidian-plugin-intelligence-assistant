import { Setting } from 'obsidian';
import { ConfigSchema } from '@/core/config-schema';

export interface ConfigFieldMetadataOptions {
	path: string;
	label: string;
	description?: string;
	extraMeta?: string[];
	includeDefaultForArrays?: boolean;
}

export function applyConfigFieldMetadata(setting: Setting, options: ConfigFieldMetadataOptions): Setting {
	const normalizedPath = normalizeArrayPath(options.path);
	const isRequired = ConfigSchema.isRequired(normalizedPath);
	const constraints = ConfigSchema.getConstraints(options.path);
	const defaultValue = options.path.includes('[]')
		? undefined
		: ConfigSchema.getDefault(options.path);

	const metaParts: string[] = [];
	const constraintText = formatConstraints(constraints);
	if (constraintText) {
		metaParts.push(constraintText);
	}

	const defaultText = formatDefault(defaultValue, options.includeDefaultForArrays);
	if (defaultText) {
		metaParts.push(defaultText);
	}

	if (options.extraMeta && options.extraMeta.length > 0) {
		metaParts.push(...options.extraMeta.filter(Boolean));
	}

	setting.setName(options.label);

	const descParts: string[] = [];
	if (options.description) {
		descParts.push(options.description);
	}
	if (metaParts.length > 0) {
		descParts.push(metaParts.join(' • '));
	}

	if (descParts.length > 0) {
		setting.setDesc(descParts.join('\n'));
	}

	if (isRequired) {
		setting.nameEl?.addClass('ia-setting-label--required');
		setting.nameEl?.setAttr('data-required', 'true');
	}

	return setting;
}

function normalizeArrayPath(path: string): string {
	if (path.includes('[]')) {
		return path.replace(/\[\]/g, '[0]');
	}
	return path;
}

function formatConstraints(constraints: Record<string, unknown> | undefined): string | null {
	if (!constraints || Object.keys(constraints).length === 0) {
		return null;
	}

	const { min, max, type } = constraints;
	const parts: string[] = [];
	if (min !== undefined && max !== undefined) {
		const minStr = typeof min === 'number' ? String(min) : JSON.stringify(min);
		const maxStr = typeof max === 'number' ? String(max) : JSON.stringify(max);
		parts.push(`Range: ${minStr}-${maxStr}`);
	} else {
		if (min !== undefined) {
			const minStr = typeof min === 'number' ? String(min) : JSON.stringify(min);
			parts.push(`Min: ${minStr}`);
		}
		if (max !== undefined) {
			const maxStr = typeof max === 'number' ? String(max) : JSON.stringify(max);
			parts.push(`Max: ${maxStr}`);
		}
	}

	if (type && typeof type === 'string') {
		parts.push(`Type: ${type}`);
	}

	return parts.join(' • ');
}

function formatDefault(value: unknown, includeArrays = false): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value === 'string') {
		return value.trim() ? `Default: ${value}` : null;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return `Default: ${String(value)}`;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return null;
		}
		if (!includeArrays) {
			return null;
		}
		return `Default: [${value.join(', ')}]`;
	}

	if (typeof value === 'object') {
		const entries = Object.keys(value as Record<string, unknown>);
		if (entries.length === 0) {
			return null;
		}
		return `Default: ${JSON.stringify(value)}`;
	}

	return null;
}
