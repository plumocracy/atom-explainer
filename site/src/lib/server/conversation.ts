import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { conversations, messages } from './db/conversations.schema';
import { appError } from './errors';
import { err, ok, type ServerResult } from './result';
import type { ConversationSelect, MessageSelect } from './db';

const ACTIVE_CONVERSATION_CUTOFF = sql`now() - interval '15 minutes'`;

export type ConversationMessage = Pick<MessageSelect, 'role' | 'content'>;
export type ConversationHistoryMessage = Pick<
	MessageSelect,
	'id' | 'role' | 'content' | 'createdAt' | 'simulationValues'
>;
export type ConversationSummary = Pick<
	ConversationSelect,
	| 'id'
	| 'title'
	| 'userInputTokens'
	| 'promptTokens'
	| 'completionTokens'
	| 'createdAt'
	| 'updatedAt'
> & {
	messageCount: number;
};

type GetOrCreateConversationResult = {
	conversation: ConversationSelect;
	created: boolean;
};

export const getActiveConversation = async (
	userId: string
): Promise<ServerResult<ConversationSelect | null>> => {
	try {
		const [conversation] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.userId, userId),
					gte(conversations.updatedAt, ACTIVE_CONVERSATION_CUTOFF)
				)
			)
			.orderBy(desc(conversations.updatedAt))
			.limit(1);

		return ok(conversation ?? null);
	} catch (error) {
		return err(appError.internal('Could not load conversation', { cause: error }));
	}
};

export const createConversation = async (
	userId: string,
	title: string | null = null
): Promise<ServerResult<ConversationSelect>> => {
	try {
		const [conversation] = await db.insert(conversations).values({ userId, title }).returning();

		if (!conversation) {
			return err(appError.internal('Could not create conversation'));
		}

		return ok(conversation);
	} catch (error) {
		return err(appError.internal('Could not create conversation', { cause: error }));
	}
};

export const getOrCreateConversation = async (
	userId: string
): Promise<ServerResult<ConversationSelect>> => {
	const result = await getOrCreateConversationWithStatus(userId);
	if (!result.ok) {
		return result;
	}

	return ok(result.data.conversation);
};

export const getOrCreateConversationWithStatus = async (
	userId: string
): Promise<ServerResult<GetOrCreateConversationResult>> => {
	const activeConversation = await getActiveConversation(userId);
	if (!activeConversation.ok) {
		return activeConversation;
	}

	if (activeConversation.data) {
		return ok({ conversation: activeConversation.data, created: false });
	}

	const createdConversation = await createConversation(userId);
	if (!createdConversation.ok) {
		return createdConversation;
	}

	return ok({ conversation: createdConversation.data, created: true });
};

export const updateConversationTitle = async (
	conversationId: string,
	title: string
): Promise<ServerResult<void>> => {
	try {
		await db.update(conversations).set({ title }).where(eq(conversations.id, conversationId));
		return ok(undefined);
	} catch (error) {
		return err(appError.internal('Could not update conversation title', { cause: error }));
	}
};

export const touchConversation = async (conversationId: string): Promise<ServerResult<void>> => {
	try {
		await db
			.update(conversations)
			.set({ updatedAt: new Date() })
			.where(eq(conversations.id, conversationId));
		return ok(undefined);
	} catch (error) {
		return err(appError.internal('Could not update conversation activity', { cause: error }));
	}
};

export const getConversationMessages = async (
	userId: string,
	conversationId: string
): Promise<ServerResult<ConversationMessage[]>> => {
	try {
		const history = await db
			.select({
				role: messages.role,
				content: messages.content
			})
			.from(messages)
			.where(and(eq(messages.userId, userId), eq(messages.conversationId, conversationId)))
			.orderBy(asc(messages.createdAt));

		return ok(history);
	} catch (error) {
		return err(appError.internal('Could not load conversation history', { cause: error }));
	}
};

export const getConversationHistory = async (
	userId: string,
	conversationId: string
): Promise<ServerResult<ConversationHistoryMessage[]>> => {
	try {
		const history = await db
			.select({
				id: messages.id,
				role: messages.role,
				content: messages.content,
				createdAt: messages.createdAt,
				simulationValues: messages.simulationValues
			})
			.from(messages)
			.where(and(eq(messages.userId, userId), eq(messages.conversationId, conversationId)))
			.orderBy(asc(messages.createdAt));

		return ok(history);
	} catch (error) {
		return err(appError.internal('Could not load conversation history', { cause: error }));
	}
};

export const getConversationSummaries = async (
	userId: string
): Promise<ServerResult<ConversationSummary[]>> => {
	try {
		const summaries = await db
			.select({
				id: conversations.id,
				title: conversations.title,
				userInputTokens: conversations.userInputTokens,
				promptTokens: conversations.promptTokens,
				completionTokens: conversations.completionTokens,
				createdAt: conversations.createdAt,
				updatedAt: conversations.updatedAt,
				messageCount: sql<number>`count(${messages.id})::int`
			})
			.from(conversations)
			.leftJoin(messages, eq(messages.conversationId, conversations.id))
			.where(eq(conversations.userId, userId))
			.groupBy(conversations.id)
			.orderBy(desc(conversations.updatedAt));

		return ok(
			summaries.map((summary) => ({
				...summary,
				messageCount: Number(summary.messageCount) || 0
			}))
		);
	} catch (error) {
		return err(appError.internal('Could not load conversation summaries', { cause: error }));
	}
};
