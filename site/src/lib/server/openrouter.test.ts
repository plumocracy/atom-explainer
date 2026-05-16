import { beforeEach, describe, expect, test, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({ env: { OPENROUTER_API_KEY: 'test' } }));
vi.mock('@openrouter/sdk', () => ({
	OpenRouter: class {
		chat = { send };
	}
}));

import {
	getOpenRouterStatus,
	isRetryableOpenRouterError,
	mapOpenRouterError,
	queryModel,
	sendOpenRouterChat
} from './openrouter';

describe('openrouter', () => {
	beforeEach(() => send.mockReset());

	test('mapOpenRouterError maps known statuses', () => {
		expect(mapOpenRouterError({ statusCode: 401 } as Error & { statusCode: number }).code).toBe(
			'UNAUTHORIZED'
		);
		expect(mapOpenRouterError({ statusCode: 429 } as Error & { statusCode: number }).code).toBe(
			'RATE_LIMITED'
		);
		expect(mapOpenRouterError({ statusCode: 503 } as Error & { statusCode: number }).message).toBe(
			'The model provider is temporarily unavailable. Please try again.'
		);
	});

	test('detects retryable provider statuses', () => {
		expect(getOpenRouterStatus({ status: 502 })).toBe(502);
		expect(isRetryableOpenRouterError({ statusCode: 503 })).toBe(true);
		expect(isRetryableOpenRouterError({ statusCode: 401 })).toBe(false);
	});

	test('sendOpenRouterChat retries transient provider errors', async () => {
		send.mockRejectedValueOnce({ statusCode: 503 }).mockResolvedValueOnce({ ok: true });

		await expect(
			sendOpenRouterChat(
				{ chatRequest: { model: 'x', messages: [], stream: false } },
				{ attempts: 2 }
			)
		).resolves.toEqual({ ok: true });
		expect(send).toHaveBeenCalledTimes(2);
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
