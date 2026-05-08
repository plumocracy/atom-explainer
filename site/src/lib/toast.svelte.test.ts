import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

import {
	dismissToast,
	isApiErrorResponse,
	parsePublicError,
	showErrorToast,
	showToast,
	toasts
} from './toast.svelte';

describe('toast helpers', () => {
	beforeEach(() => {
		toasts.splice(0, toasts.length);
		vi.useRealTimers();
	});

	test('showToast pushes toast and dismissToast removes it', () => {
		const id = showToast({ message: 'hello' });
		expect(toasts.some((toast) => toast.id === id)).toBe(true);
		dismissToast(id);
		expect(toasts.some((toast) => toast.id === id)).toBe(false);
	});

	test('showToast auto-dismisses with timeout in browser', () => {
		vi.useFakeTimers();
		const id = showToast({ message: 'bye', durationMs: 10 });
		vi.advanceTimersByTime(11);
		expect(toasts.some((toast) => toast.id === id)).toBe(false);
	});

	test('isApiErrorResponse and parsePublicError detect payloads', () => {
		const payload = { success: false as const, error: { code: 'BAD_REQUEST', message: 'x' } };
		expect(isApiErrorResponse(payload)).toBe(true);
		expect(parsePublicError(payload)).toEqual(payload.error);
		expect(parsePublicError({ code: 'BAD_REQUEST', message: 'x' })).toEqual({ code: 'BAD_REQUEST', message: 'x' });
		expect(parsePublicError({ error: { message: 'missing', status: 404 } })).toEqual({
			code: 'NOT_FOUND',
			message: 'missing',
			requestId: undefined
		});
		expect(parsePublicError({ message: 'denied', status: 403 })).toEqual({
			code: 'FORBIDDEN',
			message: 'denied',
			requestId: undefined
		});
	});

	test('showErrorToast supports public error, Error, string, and fallback', () => {
		showErrorToast({ code: 'BAD_REQUEST', message: 'oops', requestId: 'r1' });
		showErrorToast(new Error('boom'));
		showErrorToast('plain');
		showErrorToast(null, 'fallback');
		expect(toasts).toHaveLength(4);
	});
});
