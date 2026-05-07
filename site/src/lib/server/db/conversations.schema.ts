import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
	check,
	jsonb,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema';

export const conversations = pgTable(
	'conversations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title'),
		userInputTokens: integer('user_input_tokens').notNull().default(0),
		promptTokens: integer('prompt_tokens').notNull().default(0),
		completionTokens: integer('completion_tokens').notNull().default(0),
		standingWaveVisualizationExplained: boolean('standing_wave_visualization_explained')
			.notNull()
			.default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('conversations_user_id_updated_at_idx').on(table.userId, table.updatedAt.desc())
	]
);

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['user', 'assistant'] }).notNull(),
		content: text('content').notNull(),
		userInputTokens: integer('user_input_tokens').notNull().default(0),
		simulationValues: text('simulation_values'),
		model: text('model', { enum: ['deepseek-3.2', 'gemma-4-31b-it:free'] }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		responseAt: timestamp('response_at', { withTimezone: true })
	},
	(table) => [
		index('messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
		check('role_check', sql`${table.role} IN ('user', 'assistant', 'system')`)
	]
);

export const timeouts = pgTable(
	'timeouts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		reason: text('reason'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		timeoutEnd: timestamp('timeout_end', { withTimezone: true }).notNull()
	},
	(table) => [index('timeouts_user_id_idx').on(table.userId)]
);

export const messageToolCalls = pgTable(
	'message_tool_calls',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		messageId: uuid('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		providerCallId: text('provider_call_id'),
		callIndex: integer('call_index').notNull(),
		toolType: text('tool_type', { enum: ['function'] })
			.notNull()
			.default('function'),
		toolName: text('tool_name').notNull(),
		argumentsRaw: text('arguments_raw').notNull(),
		argumentsJson: jsonb('arguments_json'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('message_tool_calls_message_id_idx').on(table.messageId),
		index('message_tool_calls_tool_name_idx').on(table.toolName),
		uniqueIndex('message_tool_calls_message_id_call_index_uq').on(table.messageId, table.callIndex)
	]
);

export const messageFeedback = pgTable(
	'message_feedback',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		messageId: uuid('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		preference: text('preference', { enum: ['up', 'down'] }).notNull(),
		correctness: integer('correctness').notNull(),
		tone: integer('tone').notNull(),
		understandability: integer('understandability').notNull(),
		explanation: text('explanation'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('message_feedback_message_id_idx').on(table.messageId),
		index('message_feedback_user_id_idx').on(table.userId),
		uniqueIndex('message_feedback_message_id_user_id_uq').on(table.messageId, table.userId),
		check('message_feedback_preference_check', sql`${table.preference} IN ('up', 'down')`),
		check(
			'message_feedback_correctness_range_check',
			sql`${table.correctness} BETWEEN 1 AND 5`
		),
		check('message_feedback_tone_range_check', sql`${table.tone} BETWEEN 1 AND 5`),
		check(
			'message_feedback_understandability_range_check',
			sql`${table.understandability} BETWEEN 1 AND 5`
		)
	]
);

// Inferred types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageToolCall = typeof messageToolCalls.$inferSelect;
export type NewMessageToolCall = typeof messageToolCalls.$inferInsert;
export type MessageFeedback = typeof messageFeedback.$inferSelect;
export type NewMessageFeedback = typeof messageFeedback.$inferInsert;
