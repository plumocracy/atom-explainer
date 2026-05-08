import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { appError, toErrorResponse } from '$lib/server/errors';
import { judgeTourStep } from '$lib/server/tours/tour-judge';
import { canUserChat } from '$lib/server/user';
import { getTourStep } from '$lib/tours/tours';

const TourJudgeRequestSchema = z.object({
	tourId: z.string().trim().min(1),
	stepId: z.string().trim().min(1),
	userMessage: z.string().trim().min(1),
	attemptCount: z.number().int().min(0)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const chatAccess = await canUserChat(locals.user);
		if (!chatAccess.ok) {
			return toErrorResponse(chatAccess.error, locals.requestId);
		}

		const payload = TourJudgeRequestSchema.safeParse(await request.json());
		if (!payload.success) {
			return toErrorResponse(payload.error, locals.requestId);
		}

		const step = getTourStep(payload.data.tourId, payload.data.stepId);
		if (!step) {
			return toErrorResponse(appError.notFound('Tour step not found'), locals.requestId);
		}

		const judged = await judgeTourStep({
			step,
			userMessage: payload.data.userMessage,
			attemptCount: payload.data.attemptCount,
			recentConversation: []
		});
		if (!judged.ok) {
			return toErrorResponse(judged.error, locals.requestId);
		}

		return json(judged.data);
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
