import { describe, expect, test } from 'vitest';
import { codeByStatus } from '$lib/types/app-error';
import {
	AppError,
	isHttpErrorLike,
	isRecord,
	normalizeError,
	toErrorResponse,
	toPublicError
} from './errors';

describe('errors', () => {
	test('maps status to public code', () => {
		expect(codeByStatus(400)).toBe('BAD_REQUEST');
		expect(codeByStatus(401)).toBe('UNAUTHORIZED');
		expect(codeByStatus(999)).toBe('INTERNAL');
	});

	test('isRecord and isHttpErrorLike narrow values', () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord(null)).toBe(false);
		expect(isHttpErrorLike({ status: 404 })).toBe(true);
		expect(isHttpErrorLike({ status: '404' })).toBe(false);
	});

	test('normalizeError preserves AppError and can add requestId', () => {
		const appErr = new AppError('x', { status: 400, code: 'BAD_REQUEST' });
		expect(normalizeError(appErr)).toBe(appErr);
		expect(normalizeError(appErr, { requestId: 'r1' }).requestId).toBe('r1');
	});

	test('toPublicError hides non-exposed internal messages', () => {
		const publicErr = toPublicError(new AppError('secret', { status: 500, code: 'INTERNAL', expose: false }));
		expect(publicErr.message).toBe('Internal server error');
	});

	test('toErrorResponse returns JSON payload with status', async () => {
		const response = toErrorResponse(new Error('boom'), 'req-1');
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.success).toBe(false);
		expect(body.error.requestId).toBe('req-1');
	});
});
