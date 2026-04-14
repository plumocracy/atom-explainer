import { pgTable, uuid, text, integer, timestamp, index, check, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth.schema'

export const conversations = pgTable(
	'conversations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
		title: text('title'),
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
		role: text('role').notNull(),
		content: text('content').notNull(),
		tokens: integer('tokens'),
		model: text('model'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
		check('role_check', sql`${table.role} IN ('user', 'assistant', 'system')`),
	]
)

// Inferred types
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
