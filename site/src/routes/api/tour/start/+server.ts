import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { canUserChat, requireUser } from '$lib/server/user';
import { appError, toErrorResponse } from '$lib/server/errors';
import { getOrCreateConversationWithStatus, touchConversation } from '$lib/server/conversation';
import { recordAssistantMessage } from '$lib/server/chat/chat-store';
import { getTourById } from '$lib/tours/tours';
import { stringifyPersistedTourState } from '$lib/tours/tour-persistence';
import { createTourToolCalls } from '$lib/tours/tour-tool-calls';

const TourStartRequestSchema = z.object({
	tourId: z.string().trim().min(1)
});

const TOUR_MODEL = 'deepseek-3.2' as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const chatAccess = await canUserChat(locals.user);
		if (!chatAccess.ok) {
			return toErrorResponse(chatAccess.error, locals.requestId);
		}

		const payload = TourStartRequestSchema.safeParse(await request.json());
		if (!payload.success) {
			throw appError.badRequest('Invalid tour start payload', payload.error.flatten());
		}

		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			throw userResult.error;
		}

		const tour = getTourById(payload.data.tourId);
		if (!tour) {
			throw appError.notFound('Tour not found');
		}

		const firstStep = tour.steps[0];
		if (!firstStep) {
			throw appError.internal('Tour has no steps');
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
			assistantMessage: firstStep.assistantMarkdown,
			model: TOUR_MODEL,
			metadata: stringifyPersistedTourState({
				kind: 'guided_tour_state',
				status: 'running',
				tourId: tour.id,
				stepId: firstStep.id,
				attemptCount: 0,
				awaitingConfirmation: false
			}),
			toolCalls: createTourToolCalls(firstStep.actions)
		});
		if (!recordResult.ok) {
			throw recordResult.error;
		}

		return json({ success: true, step: firstStep });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
