import * as fs from 'fs';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/responses');

interface MockState {
	mocks: WebdriverIO.Mock[];
}

const state: MockState = { mocks: [] };

function readFixture(name: string): string {
	return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

async function installChatMock(payload: { statusCode: number; body: string; contentType?: string }): Promise<void> {
	const mock = await browser.mock('**/v1/chat/completions');
	mock.respond(payload.body, {
		statusCode: payload.statusCode,
		headers: { 'content-type': payload.contentType ?? 'application/json' },
	});
	state.mocks.push(mock);
}

export const mockLLM = {
	/** Mock a single text reply. */
	async replyWith(text: string): Promise<void> {
		const body = JSON.stringify({
			id: 'cmpl_mock',
			object: 'chat.completion',
			created: Math.floor(Date.now() / 1000),
			model: 'gpt-4o-mini',
			choices: [{
				index: 0,
				message: { role: 'assistant', content: text },
				finish_reason: 'stop',
			}],
			usage: { prompt_tokens: 1, completion_tokens: text.length, total_tokens: text.length + 1 },
		});
		await installChatMock({ statusCode: 200, body });
	},

	/** Mock an error response. */
	async errorStatus(code: 401 | 429 | 500): Promise<void> {
		const fixtureMap: Record<number, string> = {
			401: 'chat-error-500.json',
			429: 'chat-error-429.json',
			500: 'chat-error-500.json',
		};
		const body = readFixture(fixtureMap[code]);
		await installChatMock({ statusCode: code, body });
	},

	/** Tear down all installed mocks; call in afterEach. */
	async clearAll(): Promise<void> {
		for (const mock of state.mocks) {
			await mock.restore();
		}
		state.mocks.length = 0;
	},
};
