import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { canUserChat, requireUser } from '$lib/server/user';
import { appError, parseJsonRequestBody, toErrorResponse } from '$lib/server/errors';
import { getOrCreateConversationWithStatus, touchConversation } from '$lib/server/conversation';
import { recordAssistantMessage } from '$lib/server/chat/chat-store';
import { stringifyPersistedTourState } from '$lib/tours/tour-persistence';

const TourStopRequestSchema = z.object({
	tourId: z.string().trim().min(1),
	stepId: z.string().trim().min(1).nullable()
});

const TOUR_MODEL = 'deepseek-3.2' as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const chatAccess = await canUserChat(locals.user);
		if (!chatAccess.ok) {
			return toErrorResponse(chatAccess.error, locals.requestId);
		}

		const payload = TourStopRequestSchema.safeParse(await parseJsonRequestBody(request));
		if (!payload.success) {
			throw appError.badRequest('Invalid tour stop payload', payload.error.flatten());
		}

		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			throw userResult.error;
		}

		const conversationResult = await getOrCreateConversationWithStatus(userResult.data.id);
		if (!conversationResult.ok) {
			throw conversationResult.error;
		}

		const touchResult = await touchConversation(conversationResult.data.conversation.id);
		if (!touchResult.ok) {
			throw touchResult.error;
		}

		const recordResult = await recordAssistantMessage({
			userId: userResult.data.id,
			conversationId: conversationResult.data.conversation.id,
			assistantMessage: 'The guided tour has been stopped. You can start it again at any time.',
			model: TOUR_MODEL,
			metadata: stringifyPersistedTourState({
				kind: 'guided_tour_state',
				status: 'stopped',
				tourId: payload.data.tourId,
				stepId: payload.data.stepId,
				attemptCount: 0,
				awaitingConfirmation: false
			})
		});
		if (!recordResult.ok) {
			throw recordResult.error;
		}

		return json({ success: true });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
