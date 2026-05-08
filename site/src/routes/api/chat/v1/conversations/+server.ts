import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getConversationSummaries } from '$lib/server/conversation';
import { toErrorResponse } from '$lib/server/errors';
import { requireUser } from '$lib/server/user';

export const GET: RequestHandler = async ({ locals }) => {
	const userResult = requireUser(locals.user);
	if (!userResult.ok) {
		return toErrorResponse(userResult.error, locals.requestId);
	}

	const summariesResult = await getConversationSummaries(userResult.data.id);
	if (!summariesResult.ok) {
		return toErrorResponse(summariesResult.error, locals.requestId);
	}

	return json({ success: true, conversations: summariesResult.data });
};
