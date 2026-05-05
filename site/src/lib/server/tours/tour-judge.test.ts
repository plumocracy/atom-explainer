import { describe, expect, test, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { OPENROUTER_API_KEY: 'test' } }));
vi.mock('@openrouter/sdk', () => ({
	OpenRouter: class {
		chat = { send: vi.fn() };
	}
}));

import { extractJsonObject, mapOpenRouterError, stringifyList } from './tour-judge';

describe('tour-judge helpers', () => {
	test('mapOpenRouterError maps status codes', () => {
		expect(mapOpenRouterError({ statusCode: 401 } as Error & { statusCode: number }).code).toBe('UNAUTHORIZED');
		expect(mapOpenRouterError({ statusCode: 429 } as Error & { statusCode: number }).code).toBe('RATE_LIMITED');
	});

	test('stringifyList joins values and defaults empty to none', () => {
		expect(stringifyList(['a', 'b'])).toBe('a, b');
		expect(stringifyList([])).toBe('none');
	});

	test('extractJsonObject handles raw, fenced, embedded, and invalid content', () => {
		expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
		expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
		expect(extractJsonObject('prefix {"a":1} suffix')).toBe('{"a":1}');
		expect(() => extractJsonObject('')).toThrow('empty response');
		expect(() => extractJsonObject('no braces')).toThrow('did not contain');
	});
});
