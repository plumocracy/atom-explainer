import { describe, expect, test, vi } from 'vitest';
import { err, ok, tryResult, unwrap } from './result';

describe('result helpers', () => {
	test('ok wraps successful data', () => {
		expect(ok(42)).toEqual({ ok: true, data: 42 });
	});

	test('err wraps an error payload', () => {
		expect(err('bad')).toEqual({ ok: false, error: 'bad' });
	});

	test('tryResult resolves successful callback', async () => {
		const out = await tryResult(async () => 'done');
		expect(out).toEqual({ ok: true, data: 'done' });
	});

	test('tryResult normalizes thrown errors', async () => {
		const out = await tryResult(() => {
			throw new Error('boom');
		});
		expect(out.ok).toBe(false);
		if (!out.ok) {
			expect(out.error.message).toBe('boom');
		}
	});

	test('unwrap returns data for ok and throws for err', () => {
		expect(unwrap({ ok: true, data: 'x' })).toBe('x');
		expect(() => unwrap({ ok: false, error: new Error('nope') } as never)).toThrow('nope');
	});
});
