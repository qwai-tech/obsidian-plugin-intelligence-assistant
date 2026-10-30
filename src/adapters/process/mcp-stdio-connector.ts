import type { McpConnector } from '@/features/tools';
import { McpStdioSession } from './mcp-stdio-session';
import { resolveCommand } from './resolve-command';

const CLIENT_INFO = { name: 'obsidian-intelligence-assistant', version: '1.0.0' };

export const connectMcpStdio: McpConnector = async (launch) =>
	McpStdioSession.open({ ...launch, command: await resolveCommand(launch.command) }, CLIENT_INFO);
