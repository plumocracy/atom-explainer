import type { PageServerLoad } from "./$types";
import { env } from '$env/dynamic/private';
import { db } from "$lib/server/db";
import { conversations, messages, timeouts } from "$lib/server/db/conversations.schema"
import { and, eq, gte, desc, sql, asc } from "drizzle-orm";

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;

	if (!user) {
		return { user: null, chatEnabled: env.FLAG_CHAT_ENABLED == "TRUE", messages: [] }
	}

	let [conversation] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.userId, user.id),
				gte(conversations.updatedAt, sql`now() - interval '15 minutes'`)
			)
		)
		.orderBy(desc(conversations.updatedAt))
		.limit(1)

	if (conversation) {
		const prevMessages = await db.select(
			{
				role: messages.role,
				content: messages.content,
			}
		).from(messages).where(
			and(eq(messages.userId, user.id), eq(messages.conversationId, conversation.id))
		).orderBy(asc(messages.createdAt));

		return { user, chatEnabled: env.FLAG_CHAT_ENABLED == "TRUE", messages: prevMessages }
	} else {
		return { user, chatEnabled: env.FLAG_CHAT_ENABLED == "TRUE", messages: [] }
	}

}
