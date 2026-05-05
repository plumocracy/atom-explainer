import { describe, expect, test } from 'vitest';
import { encodeSse } from './chat-contract';

describe('chat-contract', () => {
	test('encodeSse wraps payload with data prefix and spacing', () => {
		expect(encodeSse({ done: true })).toBe('data: {"done":true}\n\n');
	});
});
