import { normalizePath } from 'obsidian';
import type { HttpPort } from '@qwai/obsidian-llm';
import type { IFileSystem } from '@/core/interfaces/file-system.interface';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';

export interface OpenApiSpecCache {
	read(configId: string): Promise<string | null>;
	write(configId: string, spec: string): Promise<void>;
}

export interface OpenApiLoadContext {
	fileSystem: IFileSystem;
	specCache: OpenApiSpecCache;
	http: HttpPort;
	refetch?: boolean;
}

export async function loadSpec(config: OpenApiToolConfig, context: OpenApiLoadContext): Promise<string> {
	if (config.sourceType === 'url') {
		return await loadRemoteSpec(config, context);
	}
	return await loadLocalSpec(config.specPath ?? '', context.fileSystem);
}

async function loadLocalSpec(specPath: string, fileSystem: IFileSystem): Promise<string> {
	if (!specPath) {
		throw new Error('OpenAPI file path is required');
	}

	const normalized = normalizePath(specPath);
	try {
		return await fileSystem.read(normalized);
	} catch (error) {
		console.error(`[OpenAPI] Failed to read spec from ${normalized}`, error);
		throw error instanceof Error ? error : new Error('Unable to read OpenAPI spec');
	}
}

async function loadRemoteSpec(config: OpenApiToolConfig, context: OpenApiLoadContext): Promise<string> {
	if (!config.specUrl?.trim()) {
		throw new Error('OpenAPI URL is required');
	}

	const cached = context.refetch ? null : await context.specCache.read(config.id);
	if (cached !== null) {
		return cached;
	}

	const response = await context.http.request({ url: config.specUrl.trim(), method: 'GET' });
	if (!response.ok) {
		throw new Error(`OpenAPI spec request failed: HTTP ${response.status}`);
	}
	await context.specCache.write(config.id, response.text);
	if (context.refetch) {
		config.lastFetchedAt = Date.now();
	}
	return response.text;
}
