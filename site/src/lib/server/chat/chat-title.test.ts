import { beforeEach, describe, expect, test, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({ env: { OPENROUTER_API_KEY: 'test' } }));
vi.mock('@openrouter/sdk', () => ({
	OpenRouter: class {
		chat = { send };
	}
}));

import { generateConversationTitle, normalizeTitle } from './chat-title';

describe('chat-title', () => {
	beforeEach(() => send.mockReset());

	test('normalizeTitle trims quotes, whitespace, and max length', () => {
		const out = normalizeTitle('  "hello   world"  ');
		expect(out).toBe('hello world');
		expect(normalizeTitle('x'.repeat(120)).length).toBeLessThanOrEqual(80);
	});

	test('generateConversationTitle returns ok title when model responds', async () => {
		send.mockResolvedValue({ choices: [{ message: { content: '"My title"' } }] });
		const result = await generateConversationTitle('hello');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe('My title');
		}
	});

	test('generateConversationTitle returns error when empty', async () => {
		send.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });
		const result = await generateConversationTitle('hello');
		expect(result.ok).toBe(false);
	});
});
