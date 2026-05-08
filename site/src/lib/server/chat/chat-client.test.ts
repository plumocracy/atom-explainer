import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({ env: { OPENROUTER_API_KEY: 'test' } }));
vi.mock('@openrouter/sdk', () => ({
	OpenRouter: class {
		chat = { send };
	}
}));

let collectToolCallsFromResponse: typeof import('./chat-client').collectToolCallsFromResponse;
let createChatStream: typeof import('./chat-client').createChatStream;
let makeToolCallFingerprint: typeof import('./chat-client').makeToolCallFingerprint;
let parseArgumentsJson: typeof import('./chat-client').parseArgumentsJson;
let parseArgumentsText: typeof import('./chat-client').parseArgumentsText;
let summarizeToolCalls: typeof import('./chat-client').summarizeToolCalls;

beforeAll(async () => {
	({
		collectToolCallsFromResponse,
		createChatStream,
		makeToolCallFingerprint,
		parseArgumentsJson,
		parseArgumentsText,
		summarizeToolCalls
	} = await import('./chat-client'));
});

describe('chat-client helpers', () => {
	beforeEach(() => send.mockReset());

	test('parseArgumentsText handles string, nullish, and object', () => {
		expect(parseArgumentsText('x')).toBe('x');
		expect(parseArgumentsText(undefined)).toBe('');
		expect(parseArgumentsText({ a: 1 })).toBe('{"a":1}');
	});

	test('parseArgumentsJson returns undefined for invalid input', () => {
		expect(parseArgumentsJson('{"a":1}')).toEqual({ a: 1 });
		expect(parseArgumentsJson('')).toBeUndefined();
		expect(parseArgumentsJson('{bad')).toBeUndefined();
	});

	test('collectToolCallsFromResponse maps function calls with offsets', () => {
		const out = collectToolCallsFromResponse(
			{
				choices: [
					{
						message: {
							toolCalls: [
								{ id: '1', index: 2, function: { name: 'a', arguments: '{"x":1}' } },
								{ id: '2', function: { arguments: '{}' } }
							]
						}
					}
				]
			},
			3
		);
		expect(out).toHaveLength(1);
		expect(out[0].index).toBe(5);
		expect(out[0].function.parsedArguments).toEqual({ x: 1 });
	});

	test('summarizeToolCalls and fingerprints are stable', () => {
		const call = {
			index: 0,
			type: 'function' as const,
			function: { name: 'set', arguments: '{"n":1}', parsedArguments: { n: 1 } }
		};
		expect(summarizeToolCalls([call])).toContain('"name":"set"');
		expect(makeToolCallFingerprint(call)).toBe('set:{"n":1}');
	});

	test('createChatStream forwards AbortSignal to SDK request options', () => {
		send.mockResolvedValue({});
		const abortController = new AbortController();

		createChatStream({
			systemPrompt: 'system',
			history: [],
			message: 'hello',
			signal: abortController.signal
		});

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				chatRequest: expect.objectContaining({
					stream: true,
					messages: expect.arrayContaining([{ role: 'user', content: 'hello' }])
				})
			}),
			expect.objectContaining({ signal: abortController.signal })
		);
	});
});
