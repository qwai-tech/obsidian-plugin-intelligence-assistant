#!/usr/bin/env node

const readline = require('node:readline');

const tools = [
	{
		name: 'vault_echo',
		description: 'Echo text with the MCP sentinel for E2E tests',
		inputSchema: {
			type: 'object',
			properties: {
				text: { type: 'string', description: 'Text to echo' },
			},
			required: ['text'],
		},
	},
];

const rl = readline.createInterface({
	input: process.stdin,
	crlfDelay: Infinity,
});

function send(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
	send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message) {
	send({ jsonrpc: '2.0', id, error: { code, message } });
}

rl.on('line', (line) => {
	if (!line.trim()) return;
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}

	if (message.method === 'notifications/initialized') {
		return;
	}

	if (message.id === undefined || message.id === null) {
		return;
	}

	switch (message.method) {
		case 'initialize':
			result(message.id, {
				protocolVersion: '2025-11-25',
				capabilities: { tools: {} },
				serverInfo: { name: 'e2e-mock-mcp', version: '1.0.0' },
				instructions: 'E2E mock MCP server',
			});
			break;
		case 'tools/list':
			result(message.id, { tools });
			break;
		case 'tools/call': {
			const args = message.params?.arguments ?? {};
			const text = typeof args.text === 'string' ? args.text : '';
			result(message.id, {
				content: [{ type: 'text', text: `MCP_SENTINEL ${text}`.trim() }],
				isError: false,
			});
			break;
		}
		case 'shutdown':
			result(message.id, {});
			process.exit(0);
			break;
		default:
			error(message.id, -32601, `Unknown method: ${message.method}`);
	}
});
