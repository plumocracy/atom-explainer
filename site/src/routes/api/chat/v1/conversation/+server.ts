import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createConversation } from '$lib/server/conversation';
import { toErrorResponse } from '$lib/server/errors';
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
