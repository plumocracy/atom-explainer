import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '$lib/server/db';
import { conversations, messageFeedback, messageToolCalls, messages, user } from '$lib/server/db/schema';
import { appError } from '$lib/server/errors';
import { err, ok, type ServerResult } from '$lib/server/result';
import type {
	ChatSimulationContext,
	MessageFeedbackRequest,
	StreamedToolCall
} from './chat-contract';

type MessageInsert = typeof messages.$inferInsert;
type MessageModel = MessageInsert['model'];
type MessageToolCallInsert = typeof messageToolCalls.$inferInsert;
type MessageToolCallSelect = typeof messageToolCalls.$inferSelect;
type MessageFeedbackInsert = typeof messageFeedback.$inferInsert;

type UpsertMessageFeedbackInput = MessageFeedbackRequest & {
	userId: string;
};

type RecordUserMessageInput = {
	userId: string;
	conversationId: string;
	message: string;
	userInputTokens: number;
	simulation: ChatSimulationContext;
	model: MessageModel;
};

type FinalizeAssistantTurnInput = {
	userId: string;
	conversationId: string;
	userMessageId?: string;
	assistantMessage: string;
	model: MessageModel;
	metadata?: string | null;
	usage: {
		completionTokens: number;
		promptTokens: number;
	};
	toolCalls: StreamedToolCall[];
};

type RecordAssistantMessageInput = {
	userId: string;
	conversationId: string;
	assistantMessage: string;
	model: MessageModel;
	toolCalls?: StreamedToolCall[];
	metadata?: string | null;
};

export const recordUserMessage = async (
	input: RecordUserMessageInput
): Promise<ServerResult<string>> => {
	try {
		const userMessageId = crypto.randomUUID();
		await db.batch([
			db.insert(messages).values({
				id: userMessageId,
				userId: input.userId,
				conversationId: input.conversationId,
				role: 'user',
				content: input.message,
				userInputTokens: input.userInputTokens,
				simulationValues: JSON.stringify(input.simulation),
				model: input.model
			}),
			db
				.update(conversations)
				.set({
					userInputTokens: sql`${conversations.userInputTokens} + ${input.userInputTokens}`
				})
				.where(eq(conversations.id, input.conversationId))
		]);

		return ok(userMessageId);
	} catch (error) {
		return err(appError.internal('Could not insert user message', { cause: error }));
	}
};

export const finalizeAssistantTurn = async (
	input: FinalizeAssistantTurnInput
): Promise<ServerResult<string>> => {
	try {
		const assistantMessageId = crypto.randomUUID();
		const toolCallRows: MessageToolCallInsert[] = input.toolCalls.map((toolCall) => ({
			messageId: assistantMessageId,
			providerCallId: toolCall.id ?? null,
			callIndex: toolCall.index,
			toolType: toolCall.type,
			toolName: toolCall.function.name,
			argumentsRaw: toolCall.function.arguments,
			argumentsJson: toolCall.function.parsedArguments ?? null
		}));

		const statements: [BatchItem<'pg'>, ...BatchItem<'pg'>[]] = [
			db.insert(messages).values({
				id: assistantMessageId,
				userId: input.userId,
				conversationId: input.conversationId,
				role: 'assistant',
				content: input.assistantMessage,
				simulationValues: input.metadata ?? null,
				model: input.model
			})
		];

		if (toolCallRows.length) {
			statements.push(db.insert(messageToolCalls).values(toolCallRows));
		}

		if (input.userMessageId) {
			statements.push(
				db
					.update(messages)
					.set({ responseAt: new Date() })
					.where(and(eq(messages.userId, input.userId), eq(messages.id, input.userMessageId)))
			);
		}

		statements.push(
			db
				.update(conversations)
				.set({
					completionTokens: sql`${conversations.completionTokens} + ${input.usage.completionTokens}`,
					promptTokens: input.usage.promptTokens
				})
				.where(eq(conversations.id, input.conversationId))
		);

		await db.batch(statements);

		return ok(assistantMessageId);
	} catch (error) {
		return err(appError.internal('Could not finalize assistant response', { cause: error }));
	}
};

export const recordAssistantMessage = async (
	input: RecordAssistantMessageInput
): Promise<ServerResult<string>> => {
	try {
		const assistantMessageId = crypto.randomUUID();
		const toolCallRows: MessageToolCallInsert[] = (input.toolCalls ?? []).map((toolCall) => ({
			messageId: assistantMessageId,
			providerCallId: toolCall.id ?? null,
			callIndex: toolCall.index,
			toolType: toolCall.type,
			toolName: toolCall.function.name,
			argumentsRaw: toolCall.function.arguments,
			argumentsJson: toolCall.function.parsedArguments ?? null
		}));

		const statements: [BatchItem<'pg'>, ...BatchItem<'pg'>[]] = [
			db.insert(messages).values({
				id: assistantMessageId,
				userId: input.userId,
				conversationId: input.conversationId,
				role: 'assistant',
				content: input.assistantMessage,
				simulationValues: input.metadata ?? null,
				model: input.model
			})
		];

		if (toolCallRows.length) {
			statements.push(db.insert(messageToolCalls).values(toolCallRows));
		}

		await db.batch(statements);

		return ok(assistantMessageId);
	} catch (error) {
		return err(appError.internal('Could not insert assistant message', { cause: error }));
	}
};

export const getToolCallsForMessage = async (
	messageId: string
): Promise<ServerResult<MessageToolCallSelect[]>> => {
	try {
		const toolCalls = await db
			.select()
			.from(messageToolCalls)
			.where(eq(messageToolCalls.messageId, messageId))
			.orderBy(asc(messageToolCalls.callIndex));

		return ok(toolCalls);
	} catch (error) {
		return err(appError.internal('Could not load tool calls for message', { cause: error }));
	}
};

export const getToolCallsForMessages = async (
	messageIds: string[]
): Promise<ServerResult<Map<string, MessageToolCallSelect[]>>> => {
	if (!messageIds.length) {
		return ok(new Map());
	}

	try {
		const rows = await db
			.select()
			.from(messageToolCalls)
			.where(inArray(messageToolCalls.messageId, messageIds))
			.orderBy(asc(messageToolCalls.messageId), asc(messageToolCalls.callIndex));

		const toolCallsByMessageId = new Map<string, MessageToolCallSelect[]>();
		for (const row of rows) {
			const messageToolCallsForMessage = toolCallsByMessageId.get(row.messageId) ?? [];
			messageToolCallsForMessage.push(row);
			toolCallsByMessageId.set(row.messageId, messageToolCallsForMessage);
		}

		return ok(toolCallsByMessageId);
	} catch (error) {
		return err(appError.internal('Could not load tool calls for messages', { cause: error }));
	}
};

export const getFeedbackMessageIdsForUser = async (
	userId: string,
	messageIds: string[]
): Promise<ServerResult<Set<string>>> => {
	if (!messageIds.length) {
		return ok(new Set());
	}

	try {
		const rows = await db
			.select({ messageId: messageFeedback.messageId })
			.from(messageFeedback)
			.where(and(eq(messageFeedback.userId, userId), inArray(messageFeedback.messageId, messageIds)));

		return ok(new Set(rows.map((row) => row.messageId)));
	} catch (error) {
		return err(appError.internal('Could not load message feedback state', { cause: error }));
	}
};

export const upsertMessageFeedback = async (
	input: UpsertMessageFeedbackInput
): Promise<ServerResult<void>> => {
	try {
		const [ownedMessage] = await db
			.select({ id: messages.id })
			.from(messages)
			.where(
				and(
					eq(messages.id, input.messageId),
					eq(messages.userId, input.userId),
					eq(messages.role, 'assistant')
				)
			)
			.limit(1);

		if (!ownedMessage) {
			return err(appError.notFound('Assistant message not found'));
		}

		const values: MessageFeedbackInsert = {
			messageId: input.messageId,
			userId: input.userId,
			preference: input.preference,
			correctness: input.correctness,
			tone: input.tone,
			understandability: input.understandability,
			explanation: input.explanation ?? null,
			updatedAt: new Date()
		};

		await db
			.insert(messageFeedback)
			.values(values)
			.onConflictDoUpdate({
				target: [messageFeedback.messageId, messageFeedback.userId],
				set: {
					preference: values.preference,
					correctness: values.correctness,
					tone: values.tone,
					understandability: values.understandability,
					explanation: values.explanation,
					updatedAt: new Date()
				}
			});

		return ok(undefined);
	} catch (error) {
		return err(appError.internal('Could not save message feedback', { cause: error }));
	}
};

export type FeedbackSort = 'newest' | 'highest' | 'lowest';

export type AdminFeedbackEntry = {
	id: string;
	messageId: string;
	preference: 'up' | 'down';
	correctness: number;
	tone: number;
	understandability: number;
	explanation: string | null;
	createdAt: Date;
	messageContent: string;
	feedbackGiver: {
		id: string;
		name: string;
		email: string;
	};
	overallRating: number;
};

export const getAdminFeedbackEntries = async (
	sort: FeedbackSort
): Promise<ServerResult<AdminFeedbackEntry[]>> => {
	try {
		const averageRating = sql<number>`(${messageFeedback.correctness} + ${messageFeedback.tone} + ${messageFeedback.understandability})::float / 3`;
		const orderByClause =
			sort === 'highest'
				? desc(averageRating)
				: sort === 'lowest'
					? asc(averageRating)
					: desc(messageFeedback.createdAt);

		const rows = await db
			.select({
				id: messageFeedback.id,
				messageId: messageFeedback.messageId,
				preference: messageFeedback.preference,
				correctness: messageFeedback.correctness,
				tone: messageFeedback.tone,
				understandability: messageFeedback.understandability,
				explanation: messageFeedback.explanation,
				createdAt: messageFeedback.createdAt,
				messageContent: messages.content,
				feedbackGiverId: user.id,
				feedbackGiverName: user.name,
				feedbackGiverEmail: user.email,
				overallRating: averageRating
			})
			.from(messageFeedback)
			.innerJoin(messages, eq(messages.id, messageFeedback.messageId))
			.innerJoin(user, eq(user.id, messageFeedback.userId))
			.orderBy(orderByClause, desc(messageFeedback.createdAt));

		return ok(
			rows.map((row) => ({
				id: row.id,
				messageId: row.messageId,
				preference: row.preference,
				correctness: row.correctness,
				tone: row.tone,
				understandability: row.understandability,
				explanation: row.explanation,
				createdAt: row.createdAt,
				messageContent: row.messageContent,
				feedbackGiver: {
					id: row.feedbackGiverId,
					name: row.feedbackGiverName,
					email: row.feedbackGiverEmail
				},
				overallRating: Number(row.overallRating)
			}))
		);
	} catch (error) {
		return err(appError.internal('Could not load admin feedback entries', { cause: error }));
	}
};
