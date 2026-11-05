import type { LLMConfig, ModelInfo } from './types';

export function ensureConnectionId(config: LLMConfig): string {
	if (config.id) return config.id;
	config.id = typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
	return config.id;
}

export function connectionLabel(config: LLMConfig): string {
	if (config.name?.trim()) return config.name.trim();
	const labels: Record<string, string> = { 'sap-ai-core': 'SAP AI Core', openai: 'OpenAI', custom: 'Custom', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek', ollama: 'Ollama', openrouter: 'OpenRouter' };
	const label = labels[config.provider] || config.provider.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
	if (config.provider === 'custom' && config.baseUrl) {
		try {
			const url = new URL(config.baseUrl);
			return `${label} · ${url.host}${url.pathname.replace(/\/$/, '')}`;
		} catch { /* Invalid URLs are handled by the configuration form. */ }
	}
	return label;
}

export function scopeModel(model: ModelInfo, config: LLMConfig): ModelInfo {
	if (config.provider !== 'custom') return { ...model, providerLabel: connectionLabel(config) };
	const prefixEnd = model.id.indexOf(':');
	const wireId = prefixEnd < 0 ? model.id : model.id.slice(prefixEnd + 1);
	return { ...model, id: `custom@${ensureConnectionId(config)}:${wireId}`, provider: 'custom', providerLabel: connectionLabel(config) };
}
