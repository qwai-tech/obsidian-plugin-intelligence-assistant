/**
 * OpenApiToolSource - the tool source for a single OpenAPI spec.
 * One instance per OpenApiToolConfig; load() fetches the spec and generates
 * HTTP tools via the shared loadOpenApiTools function; dispose() is a no-op.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';
import { loadOpenApiTools } from '@/application/services/openapi-tool-loader';

export class OpenApiToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'openapi';
	readonly id: string;
	readonly label: string;

	constructor(
		private readonly config: OpenApiToolConfig,
		private readonly fileSystem: IFileSystem,
		private readonly pluginDataPath: string,
	) {
		this.id = config.id;
		this.label = config.name;
	}

	/**
	 * Load the OpenAPI spec and generate its HTTP tools.
	 * A fetch or parse failure is allowed to propagate so the ToolRegistry
	 * can isolate this source and keep the others.
	 */
	async load(): Promise<SourceTool[]> {
		return await loadOpenApiTools(this.config, this.fileSystem, this.pluginDataPath);
	}

	/** OpenAPI tools issue stateless HTTP requests; nothing to release. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
