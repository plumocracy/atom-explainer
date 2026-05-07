import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getConversationHistory } from '$lib/server/conversation';
import { appError, toErrorResponse } from '$lib/server/errors';
import { requireUser } from '$lib/server/user';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			return toErrorResponse(userResult.error, locals.requestId);
		}

		const conversationId = url.searchParams.get('conversation');
		if (!conversationId) {
			return toErrorResponse(
				appError.badRequest('Conversation id is required'),
				locals.requestId
			);
		}

		const historyResult = await getConversationHistory(userResult.data.id, conversationId);
		if (!historyResult.ok) {
			return toErrorResponse(historyResult.error, locals.requestId);
		}

		return json({ success: true, history: historyResult.data });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
