import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MessageFeedbackRequestSchema } from '$lib/server/chat/chat-contract';
import { upsertMessageFeedback } from '$lib/server/chat/chat-store';
import { appError, toErrorResponse } from '$lib/server/errors';
import { canUserChat, requireUser } from '$lib/server/user';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const chatAccess = await canUserChat(locals.user);
		if (!chatAccess.ok) {
			return toErrorResponse(chatAccess.error, locals.requestId);
		}

		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			return toErrorResponse(userResult.error, locals.requestId);
		}

		const payload = MessageFeedbackRequestSchema.safeParse(await request.json());
		if (!payload.success) {
			throw appError.badRequest('Invalid message feedback payload', payload.error.flatten());
		}

		const saveResult = await upsertMessageFeedback({
			userId: userResult.data.id,
			...payload.data
		});
		if (!saveResult.ok) {
			return toErrorResponse(saveResult.error, locals.requestId);
		}

		return json({ success: true });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
