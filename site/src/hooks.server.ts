import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { normalizeError, toPublicError } from '$lib/server/errors';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	event.locals.requestId = crypto.randomUUID();

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const normalized = normalizeError(error, {
		status,
		message,
		requestId: event.locals.requestId,
	});

	const publicError = toPublicError(normalized);
	console.error(`[${publicError.requestId ?? 'unknown-request'}]`, normalized);

	return publicError;
};
