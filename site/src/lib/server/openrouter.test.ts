import { beforeEach, describe, expect, test, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({ env: { OPENROUTER_API_KEY: 'test' } }));
vi.mock('@openrouter/sdk', () => ({
	OpenRouter: class {
		chat = { send };
	}
}));

import { mapOpenRouterError, queryModel } from './openrouter';

describe('openrouter', () => {
	beforeEach(() => send.mockReset());

	test('mapOpenRouterError maps known statuses', () => {
		expect(mapOpenRouterError({ statusCode: 401 } as Error & { statusCode: number }).code).toBe('UNAUTHORIZED');
		expect(mapOpenRouterError({ statusCode: 429 } as Error & { statusCode: number }).code).toBe('RATE_LIMITED');
		expect(mapOpenRouterError({ statusCode: 503 } as Error & { statusCode: number }).message).toBe('Model unavailable');
	});

	test('queryModel rejects invalid query', async () => {
		const out = await queryModel({} as never);
		expect(out.ok).toBe(false);
	});

	test('queryModel returns validated model response', async () => {
		send.mockResolvedValue({
			choices: [{ message: { content: '{"params":{"n":1,"l":0,"m":0},"message":"ok"}' } }],
			usage: { completionTokens: 10, promptTokens: 20 }
		});
		const out = await queryModel({ message: 'hi', currentSimulationValues: { n: 1, l: 0, m: 0 } });
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.data.message).toBe('ok');
		}
	});
});
