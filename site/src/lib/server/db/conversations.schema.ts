import { pgTable, uuid, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth.schema'

export const conversations = pgTable(
	'conversations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
		title: text('title'),
		promptTokens: integer('prompt_tokens').notNull().default(0),
		completionTokens: integer('completion_tokens').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('conversations_user_id_updated_at_idx').on(table.userId, table.updatedAt.desc()),
	]
)

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ["user", "assistant"] }).notNull(),
		content: text('content').notNull(),
		simulationValues: text('simulation_values'),
		model: text('model', { enum: ["deepseek-3.2", "gemma-4-31b-it:free"] }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		responseAt: timestamp('response_at', { withTimezone: true })
	},
	(table) => [
		index('messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
		check('role_check', sql`${table.role} IN ('user', 'assistant', 'system')`),
	]
)

export const timeouts = pgTable(
	'timeouts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		reason: text('reason'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		timeoutEnd: timestamp('timeout_end', { withTimezone: true }).notNull(),
	},
	(table) => [
		index('timeouts_user_id_idx').on(table.userId),
	]
)

// Inferred types
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
