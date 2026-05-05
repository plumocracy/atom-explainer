import { describe, expect, test } from 'vitest';
import { toAuthFailure } from './login/+page.server';

describe('login page server helpers', () => {
	test('toAuthFailure returns failed action payload with public error', () => {
		const out = toAuthFailure(new Error('bad auth'), 'req-1');
		expect(out.status).toBe(500);
		expect(out.data.error.requestId).toBe('req-1');
	});
});
