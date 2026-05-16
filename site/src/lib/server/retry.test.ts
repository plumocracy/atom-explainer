import { describe, expect, test, vi } from 'vitest';
import { retryAsync } from './retry';

describe('retryAsync', () => {
	test('retries until the function succeeds', async () => {
		const fn = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce('ok');

		await expect(retryAsync(fn, { attempts: 2, baseDelayMs: 0 })).resolves.toBe('ok');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	test('stops when shouldRetry rejects the error', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('permanent'));

		await expect(
			retryAsync(fn, { attempts: 3, baseDelayMs: 0, shouldRetry: () => false })
		).rejects.toThrow('permanent');
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
