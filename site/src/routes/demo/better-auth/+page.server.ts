import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { appError, throwKitError } from '$lib/server/errors';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/demo/better-auth/login');
	}
	return { user: event.locals.user };
};

export const actions: Actions = {
	signOut: async (event) => {
		try {
			await auth.api.signOut({
				headers: event.request.headers,
			});
		} catch (error) {
			throwKitError(appError.internal('Could not sign out', { cause: error }), event.locals.requestId);
		}

		throw redirect(302, '/demo/better-auth/login');
	}
};
