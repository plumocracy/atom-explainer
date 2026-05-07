import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { appError, normalizeError, toPublicError } from '$lib/server/errors';

export const toAuthFailure = (error: unknown, requestId: string) => {
	if (error instanceof APIError) {
		const normalized = normalizeError(
			appError.badRequest(error.message || 'Authentication request failed'),
			{ requestId }
		);
		return fail(normalized.status, { error: toPublicError(normalized) });
	}

	const normalized = normalizeError(error, { requestId });
	return fail(normalized.status, { error: toPublicError(normalized) });
};
