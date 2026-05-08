import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createConversation, deleteConversationForUser } from '$lib/server/conversation';
import { appError, toErrorResponse } from '$lib/server/errors';
import { requireUser } from '$lib/server/user';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			return toErrorResponse(userResult.error, locals.requestId);
		}

		const createResult = await createConversation(userResult.data.id);
		if (!createResult.ok) {
			return toErrorResponse(createResult.error, locals.requestId);
		}

		return json({ success: true, conversationId: createResult.data.id });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	try {
		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			return toErrorResponse(userResult.error, locals.requestId);
		}

		const conversationId = url.searchParams.get('conversation');
		if (!conversationId) {
			return toErrorResponse(appError.badRequest('Conversation id is required.'), locals.requestId);
		}

		const deleteResult = await deleteConversationForUser(userResult.data.id, conversationId);
		if (!deleteResult.ok) {
			return toErrorResponse(deleteResult.error, locals.requestId);
		}

		return json({ success: true });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
