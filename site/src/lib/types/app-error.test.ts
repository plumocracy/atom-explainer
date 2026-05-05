import { describe, expect, test } from 'vitest';
import { isPublicAppError } from './app-error';

describe('isPublicAppError', () => {
	test('accepts public error shape and rejects invalid values', () => {
		expect(isPublicAppError({ code: 'BAD_REQUEST', message: 'x' })).toBe(true);
		expect(isPublicAppError({ code: 'BAD_REQUEST' })).toBe(false);
		expect(isPublicAppError(null)).toBe(false);
	});
});
