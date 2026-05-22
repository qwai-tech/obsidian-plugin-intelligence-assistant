/**
 * CliToolSource - the tool source for a single configured CLI tool.
 * One instance per CLIToolConfig; load() builds the one CLITool;
 * dispose() is a no-op.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { CLIToolConfig } from '@/types/features/cli-tools';
import { CLITool } from '@/application/services/cli-tool';

export class CliToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'cli';
	readonly id: string;
	readonly label: string;

	constructor(private readonly config: CLIToolConfig) {
		this.id = config.id;
		this.label = config.name;
	}

	/** Build the single CLITool described by this config. */
	load(): Promise<SourceTool[]> {
		return Promise.resolve([new CLITool(this.config)]);
	}

	/** CLI tools spawn processes per execution; nothing persistent to release. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
