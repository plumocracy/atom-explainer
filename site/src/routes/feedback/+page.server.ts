import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getAdminFeedbackEntries, type FeedbackSort } from '$lib/server/chat/chat-store';
import { appError, throwKitError } from '$lib/server/errors';
import type { ServerResult } from '$lib/server/result';
import { isAdminUser } from '$lib/server/user';

const isFeedbackSort = (value: string | null): value is FeedbackSort =>
	value === 'newest' || value === 'highest' || value === 'lowest';

const unwrapOrThrow = <T>(result: ServerResult<T>, requestId?: string): T => {
	if (result.ok) {
		return result.data;
	}

	throwKitError(result.error, requestId);
	throw new Error('Unreachable');
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const adminResult = await isAdminUser(locals.user.id);
	const isAdmin = unwrapOrThrow(adminResult, locals.requestId);
	if (!isAdmin) {
		throwKitError(appError.forbidden('Admins only'), locals.requestId);
	}

	const requestedSort = url.searchParams.get('sort');
	const sort: FeedbackSort = isFeedbackSort(requestedSort) ? requestedSort : 'newest';

	const feedbackResult = await getAdminFeedbackEntries(sort);
	const feedback = unwrapOrThrow(feedbackResult, locals.requestId);

	return {
		user: locals.user,
		feedback,
		sort
	};
};
