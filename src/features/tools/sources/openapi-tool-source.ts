/**
 * OpenApiToolSource - the tool source for a single OpenAPI spec.
 * One instance per OpenApiToolConfig; load() fetches the spec and generates
 * HTTP tools via the shared loadOpenApiTools function; dispose() is a no-op.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/features/tools/types/tools';
import type { OpenApiToolConfig } from '@/features/tools/types/openapi-tools';
import { loadOpenApiTools } from './openapi-loader-core';
import type { OpenApiLoadContext } from './openapi-spec-loader';

export class OpenApiToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'openapi';
	readonly id: string;
	readonly label: string;

	constructor(
		private readonly config: OpenApiToolConfig,
		private readonly context: OpenApiLoadContext,
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
		return await loadOpenApiTools(this.config, this.context);
	}

	/** OpenAPI tools issue stateless HTTP requests; nothing to release. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
