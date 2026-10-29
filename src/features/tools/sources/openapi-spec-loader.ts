import { normalizePath } from 'obsidian';
import type { HttpPort } from '@qwai/obsidian-llm';
import type { IFileSystem } from '@/core/interfaces/file-system.interface';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';

export interface OpenApiLoadContext {
	fileSystem: IFileSystem;
	pluginDataPath: string;
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

	const { fileSystem } = context;
	const cache = getCachePaths(config.id, context.pluginDataPath);
	await fileSystem.mkdir(cache.directoryAbsolute);
	const cacheExists = await fileSystem.exists(cache.absolutePath);

	if (!cacheExists || context.refetch) {
		const response = await context.http.request({ url: config.specUrl.trim(), method: 'GET' });
		if (!response.ok) {
			throw new Error(`OpenAPI spec request failed: HTTP ${response.status}`);
		}
		await fileSystem.write(cache.absolutePath, response.text);
		if (context.refetch) {
			config.lastFetchedAt = Date.now();
		}
		return response.text;
	}

	return await fileSystem.read(cache.absolutePath);
}

function getCachePaths(configId: string, pluginDataPath: string): { absolutePath: string; directoryAbsolute: string } {
	const directoryAbsolute = `${pluginDataPath}/openapi`;
	const absolutePath = `${directoryAbsolute}/${configId}.json`;
	return { absolutePath: normalizePath(absolutePath), directoryAbsolute: normalizePath(directoryAbsolute) };
}
