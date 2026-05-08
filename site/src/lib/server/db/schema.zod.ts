import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import type { z } from 'zod';
import { account, adminUsers, session, user, verification } from './auth.schema';
import {
	conversations,
	messageFeedback,
	messageToolCalls,
	messages,
	timeouts,
	userTokenUsageEvents
} from './conversations.schema';

export const UserSelectSchema = createSelectSchema(user);
export const UserInsertSchema = createInsertSchema(user);
export const SessionSelectSchema = createSelectSchema(session);
export const SessionInsertSchema = createInsertSchema(session);
export const AccountSelectSchema = createSelectSchema(account);
export const AccountInsertSchema = createInsertSchema(account);
export const VerificationSelectSchema = createSelectSchema(verification);
export const VerificationInsertSchema = createInsertSchema(verification);
export const AdminUserSelectSchema = createSelectSchema(adminUsers);
export const AdminUserInsertSchema = createInsertSchema(adminUsers);
export const ConversationSelectSchema = createSelectSchema(conversations);
export const ConversationInsertSchema = createInsertSchema(conversations);
export const MessageSelectSchema = createSelectSchema(messages);
export const MessageInsertSchema = createInsertSchema(messages);
export const MessageToolCallSelectSchema = createSelectSchema(messageToolCalls);
export const MessageToolCallInsertSchema = createInsertSchema(messageToolCalls);
export const MessageFeedbackSelectSchema = createSelectSchema(messageFeedback);
export const MessageFeedbackInsertSchema = createInsertSchema(messageFeedback);
export const TimeoutSelectSchema = createSelectSchema(timeouts);
export const TimeoutInsertSchema = createInsertSchema(timeouts);
export const UserTokenUsageEventSelectSchema = createSelectSchema(userTokenUsageEvents);
export const UserTokenUsageEventInsertSchema = createInsertSchema(userTokenUsageEvents);

export type UserSelect = z.infer<typeof UserSelectSchema>;
export type UserInsert = z.infer<typeof UserInsertSchema>;
export type SessionSelect = z.infer<typeof SessionSelectSchema>;
export type SessionInsert = z.infer<typeof SessionInsertSchema>;
export type AccountSelect = z.infer<typeof AccountSelectSchema>;
export type AccountInsert = z.infer<typeof AccountInsertSchema>;
export type VerificationSelect = z.infer<typeof VerificationSelectSchema>;
export type VerificationInsert = z.infer<typeof VerificationInsertSchema>;
export type AdminUserSelect = z.infer<typeof AdminUserSelectSchema>;
export type AdminUserInsert = z.infer<typeof AdminUserInsertSchema>;
export type ConversationSelect = z.infer<typeof ConversationSelectSchema>;
export type ConversationInsert = z.infer<typeof ConversationInsertSchema>;
export type MessageSelect = z.infer<typeof MessageSelectSchema>;
export type MessageInsert = z.infer<typeof MessageInsertSchema>;
export type MessageToolCallSelect = z.infer<typeof MessageToolCallSelectSchema>;
export type MessageToolCallInsert = z.infer<typeof MessageToolCallInsertSchema>;
export type MessageFeedbackSelect = z.infer<typeof MessageFeedbackSelectSchema>;
export type MessageFeedbackInsert = z.infer<typeof MessageFeedbackInsertSchema>;
export type TimeoutSelect = z.infer<typeof TimeoutSelectSchema>;
export type TimeoutInsert = z.infer<typeof TimeoutInsertSchema>;
export type UserTokenUsageEventSelect = z.infer<typeof UserTokenUsageEventSelectSchema>;
export type UserTokenUsageEventInsert = z.infer<typeof UserTokenUsageEventInsertSchema>;
