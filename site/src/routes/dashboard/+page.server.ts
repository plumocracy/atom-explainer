import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { throwKitError } from '$lib/server/errors';
import {
	createConversation,
	getConversationHistory,
	getConversationSummaries
} from '$lib/server/conversation';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const conversationsResult = await getConversationSummaries(locals.user.id);
	if (!conversationsResult.ok) {
		throwKitError(conversationsResult.error, locals.requestId);
	}

	const conversations = conversationsResult.data;
	const requestedConversationId = url.searchParams.get('conversation');
	const selectedConversation =
		conversations.find((conversation) => conversation.id === requestedConversationId) ??
		conversations[0] ??
		null;

	let history: Awaited<ReturnType<typeof getConversationHistory>> extends {
		ok: true;
		data: infer Data;
	}
		? Data
		: never = [];

	if (selectedConversation) {
		const historyResult = await getConversationHistory(locals.user.id, selectedConversation.id);
		if (!historyResult.ok) {
			throwKitError(historyResult.error, locals.requestId);
		}

		history = historyResult.data;
	}

	const tokenUsage = conversations.reduce(
		(totals, conversation) => {
			totals.inputTokens += conversation.userInputTokens;
			totals.outputTokens += conversation.completionTokens;
			return totals;
		},
		{ inputTokens: 0, outputTokens: 0 }
	);

	return {
		user: locals.user,
		conversations,
		selectedConversationId: selectedConversation?.id ?? null,
		history,
		tokenUsage
	};
};

export const actions: Actions = {
	createConversation: async ({ locals }) => {
		if (!locals.user) {
			throw redirect(302, '/login');
		}

		const createdConversation = await createConversation(locals.user.id);
		if (!createdConversation.ok) {
			throwKitError(createdConversation.error, locals.requestId);
		}

		throw redirect(303, `/dashboard?conversation=${createdConversation.data.id}`);
	}
};
