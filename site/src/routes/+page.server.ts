import type { PageServerLoad, Actions } from "./$types";
import { env } from '$env/dynamic/private';
import { queryModel } from "$lib/server/openrouter";
import type { ChatResponse, ChatError } from "$lib/server/openrouter";
import { db } from "$lib/server/db";
import { conversations, messages, timeouts } from "$lib/server/db/conversations.schema"
import { and, eq, gt, gte, desc } from "drizzle-orm";


function convertRawValueToNumber(n: FormDataEntryValue | null): number {
	return n ? Number(n) : -1
}

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;
	return { user, chatEnabled: env.FLAG_CHAT_ENABLED == "TRUE" }
}


// Todo make this respond with actual http codes..
export const actions = {
	chat: async ({ request, locals }): Promise<ChatResponse | ChatError> => {
		const { user } = locals;
		if (!user) {
			return { success: false, error: "Must be logged in to use chat service." };
		}

		const userId = user.id;

		// See if user is currently timed out.
		const [timeout] = await db.select()
			.from(timeouts)
			.where(
				and(eq(timeouts.userId, userId), gt(timeouts.timeoutEnd, new Date())))
			.limit(1)

		if (timeout) {
			return ({ success: false, error: "Currently on timeout", timeout: { reason: timeout.reason!, until: timeout.timeoutEnd } })
		}

		const data = await request.formData();
		let message = data.get('message');

		const simValues = {
			n: convertRawValueToNumber(data.get('n')),
			l: convertRawValueToNumber(data.get('l')),
			m: convertRawValueToNumber(data.get('m'))
		}

		// This really should only happen if something goes terribly wrong...
		if (simValues.n == -1 || simValues.l == -1 || simValues.m == -1) {
			return { success: false, missing: `Sim values are missing: ${simValues.n}, ${simValues.l}, ${simValues.m}` }
		}

		if (!message) {
			return { success: false, missing: "Must provide a message!" };
		}

		message = message.toString().trim();

		// 15 minute keep-alive window.
		const windowStart = new Date(Date.now() - 15 * 60 * 1000);

		try {
			let [conversation] = await db.select()
				.from(conversations)
				.where(and(
					eq(conversations.userId, user.id),
					gte(conversations.updatedAt, windowStart)
				))
				.orderBy(desc(conversations.updatedAt))
				.limit(1);

			if (!conversation) {
				[conversation] = await db.insert(conversations)
					.values({ userId: user.id, title: "My Conversation" })
					.returning();
			}

			const [userMessage] = await db.insert(messages).values({
				conversationId: conversation.id,
				userId: userId,
				role: 'user',
				content: message,
				model: "deepseek 3.2"
			}).returning();

			const result = await queryModel({ message: message, currentSimulationValues: simValues })

			if (!result.success) {
				return { success: result.success, error: result.error }
			}

			await db.insert(messages).values({
				conversationId: conversation.id,
				userId: userId,
				role: 'assistant',
				content: result.message,
				simulationValues: JSON.stringify(result.params),
				model: "deepseek 3.2"
			});

			await db.update(messages).set({
				responseAt: new Date()
			}).where(and(eq(messages.id, userMessage.id), eq(messages.userId, userId)))

			await db.update(conversations).set(
				{ promptTokens: result.inputTokens, completionTokens: result.outputTokens, updatedAt: new Date() }
			).where(and(eq(conversations.id, conversation.id), eq(conversations.userId, userId)))

			console.log(result.message);

			return {
				success: true,
				role: 'assistant',
				newSimulationValues: result.params,
				message: result.message
			}
		} catch (e) {
			return { success: false, error: e.message }
		}

	}
} satisfies Actions;
