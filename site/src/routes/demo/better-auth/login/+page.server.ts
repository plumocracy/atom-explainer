import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { appError, normalizeError, toPublicError } from '$lib/server/errors';
import { toAuthFailure } from '../login-page.server.helpers';

export const load: PageServerLoad = (event) => {
	if (event.locals.user) {
		throw redirect(302, '/demo/better-auth');
	}

	return {};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		if (!email || !password) {
			const normalized = normalizeError(appError.badRequest('Email and password are required'), {
				requestId: event.locals.requestId,
			});
			return fail(400, { error: toPublicError(normalized) });
		}

		try {
			await auth.api.signInEmail({
				body: {
					email,
					password,
					callbackURL: '/auth/verification-success',
				},
			});
		} catch (error) {
			return toAuthFailure(error, event.locals.requestId);
		}

		throw redirect(302, '/demo/better-auth');
	},
	signUpEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';

		if (!email || !password || !name) {
			const normalized = normalizeError(appError.badRequest('Name, email, and password are required'), {
				requestId: event.locals.requestId,
			});
			return fail(400, { error: toPublicError(normalized) });
		}

		try {
			await auth.api.signUpEmail({
				body: {
					email,
					password,
					name,
					callbackURL: '/auth/verification-success',
				},
			});
		} catch (error) {
			return toAuthFailure(error, event.locals.requestId);
		}

		throw redirect(302, '/demo/better-auth');
	},
};
