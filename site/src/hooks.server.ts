import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { normalizeError, toPublicError } from '$lib/server/errors';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"script-src 'self' 'unsafe-inline'",
	"script-src-attr 'none'",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"style-src-attr 'unsafe-inline'",
	"font-src 'self' https://fonts.gstatic.com data:",
	"img-src 'self' data: blob: https://avatars.githubusercontent.com",
	"media-src 'self'",
	"connect-src 'self'",
	"worker-src 'self' blob:",
	"child-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'self'",
	"manifest-src 'self'",
	"upgrade-insecure-requests"
].join('; ');

export const setSecurityHeaders = (response: Response) => {
	response.headers.set('Content-Security-Policy', contentSecurityPolicy);
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
	);
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	event.locals.requestId = crypto.randomUUID();

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = async ({ event, resolve }) => {
	return handleBetterAuth({
		event,
		resolve: async (event, opts) => {
			const response = await resolve(event, opts);
			setSecurityHeaders(response);
			return response;
		}
	});
};

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
