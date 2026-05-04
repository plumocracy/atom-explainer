import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversations, messageToolCalls, messages } from '$lib/server/db/schema';
import { appError } from '$lib/server/errors';
import { err, ok, type ServerResult } from '$lib/server/result';
import type { ChatSimulationContext, StreamedToolCall } from './chat-contract';

type MessageInsert = typeof messages.$inferInsert;
type MessageModel = MessageInsert['model'];
type MessageToolCallInsert = typeof messageToolCalls.$inferInsert;
type MessageToolCallSelect = typeof messageToolCalls.$inferSelect;

type RecordUserMessageInput = {
	userId: string;
	conversationId: string;
	message: string;
	simulation: ChatSimulationContext;
	model: MessageModel;
};

type FinalizeAssistantTurnInput = {
	userId: string;
	conversationId: string;
	userMessageId: string;
	assistantMessage: string;
	model: MessageModel;
	usage: {
		completionTokens: number;
		promptTokens: number;
	};
	toolCalls: StreamedToolCall[];
};

export const recordUserMessage = async (
	input: RecordUserMessageInput
): Promise<ServerResult<string>> => {
	try {
		const [userMessage] = await db
			.insert(messages)
			.values({
				userId: input.userId,
				conversationId: input.conversationId,
				role: 'user',
				content: input.message,
				simulationValues: JSON.stringify(input.simulation),
				model: input.model
			})
			.returning({ id: messages.id });

		if (!userMessage) {
			return err(appError.internal('Could not insert user message'));
		}

		return ok(userMessage.id);
	} catch (error) {
		return err(appError.internal('Could not insert user message', { cause: error }));
	}
};

export const finalizeAssistantTurn = async (
	input: FinalizeAssistantTurnInput
): Promise<ServerResult<void>> => {
	try {
		const [assistantMessage] = await db
			.insert(messages)
			.values({
				userId: input.userId,
				conversationId: input.conversationId,
				role: 'assistant',
				content: input.assistantMessage,
				model: input.model
			})
			.returning({ id: messages.id });

		if (!assistantMessage) {
			return err(appError.internal('Could not insert assistant message'));
		}

		const toolCallRows: MessageToolCallInsert[] = input.toolCalls.map((toolCall) => ({
			messageId: assistantMessage.id,
			providerCallId: toolCall.id ?? null,
			callIndex: toolCall.index,
			toolType: toolCall.type,
			toolName: toolCall.function.name,
			argumentsRaw: toolCall.function.arguments,
			argumentsJson: toolCall.function.parsedArguments ?? null
		}));

		if (toolCallRows.length) {
			await db.insert(messageToolCalls).values(toolCallRows);
		}

		await db
			.update(messages)
			.set({ responseAt: new Date() })
			.where(and(eq(messages.userId, input.userId), eq(messages.id, input.userMessageId)));

		await db
			.update(conversations)
			.set({
				completionTokens: sql`${conversations.completionTokens} + ${input.usage.completionTokens}`,
				promptTokens: input.usage.promptTokens
			})
			.where(eq(conversations.id, input.conversationId));

		return ok(undefined);
	} catch (error) {
		return err(appError.internal('Could not finalize assistant response', { cause: error }));
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
