import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { searchConversationHistory } from '$lib/server/conversation';
import { appError, toErrorResponse } from '$lib/server/errors';
import { requireUser } from '$lib/server/user';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			return toErrorResponse(userResult.error, locals.requestId);
		}

		const query = url.searchParams.get('q')?.trim() ?? '';
		if (!query) {
			return toErrorResponse(appError.badRequest('Search query is required'), locals.requestId);
		}

		const results = await searchConversationHistory(userResult.data.id, query);
		if (!results.ok) {
			return toErrorResponse(results.error, locals.requestId);
		}

		return json({ success: true, results: results.data });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
