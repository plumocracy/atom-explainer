import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { throwKitError } from '$lib/server/errors';
import {
	createConversation,
	type ConversationHistoryMessage,
	type ConversationSummary,
	getConversationHistory,
	getConversationSummaries
} from '$lib/server/conversation';
import type { ServerResult } from '$lib/server/result';
import { isAdminUser } from '$lib/server/user';

const unwrapOrThrow = <T>(result: ServerResult<T>, requestId?: string): T => {
	if (result.ok) {
		return result.data;
	}

	throwKitError(result.error, requestId);
	throw new Error('Unreachable');
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const conversationsResult = await getConversationSummaries(locals.user.id);
	const conversations: ConversationSummary[] = unwrapOrThrow(conversationsResult, locals.requestId);
	const requestedConversationId = url.searchParams.get('conversation');
	const selectedConversation =
		conversations.find((conversation: ConversationSummary) => conversation.id === requestedConversationId) ??
		conversations[0] ??
		null;

	let history: ConversationHistoryMessage[] = [];

	if (selectedConversation) {
		const historyResult = await getConversationHistory(locals.user.id, selectedConversation.id);
		history = unwrapOrThrow(historyResult, locals.requestId);
	}

	const adminResult = await isAdminUser(locals.user.id);
	const isAdmin = unwrapOrThrow(adminResult, locals.requestId);

	const tokenUsage = conversations.reduce(
		(
			totals: { inputTokens: number; outputTokens: number },
			conversation: ConversationSummary
		) => {
			totals.inputTokens += conversation.userInputTokens;
			totals.outputTokens += conversation.completionTokens;
			return totals;
		},
		{ inputTokens: 0, outputTokens: 0 }
	);

	return {
		user: locals.user,
		isAdmin,
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
		const conversation = unwrapOrThrow(createdConversation, locals.requestId);

		throw redirect(303, `/dashboard?conversation=${conversation.id}`);
	}
};
