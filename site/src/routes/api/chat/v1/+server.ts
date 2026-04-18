import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { messages, conversations } from '$lib/server/db/schema';
import { and, eq, gte, lte, asc, desc, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { OpenRouter } from "@openrouter/sdk";

const openRouter = new OpenRouter({
	apiKey: env.OPENROUTER_API_KEY
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: "User not authenticated", status: 401 })
	}

	const { message, values } = await request.json()
	const userId = locals.user.id;

	if (!message) {
		return json({ error: "No message", status: 400 })
	}

	let [conversation] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.userId, userId),
				gte(conversations.updatedAt, sql`now() - interval '15 minutes'`)
			)
		)
		.orderBy(desc(conversations.updatedAt))
		.limit(1)


	// If no convo exists, create one
	if (!conversation) {
		try {
			[conversation] = await db
				.insert(conversations)
				.values({
					userId,
					title: "My Conversation",
				})
				.returning()
		} catch (error) {
			return json({ error: "Could not create conversation", status: 400 })
		}
	}

	// Bump convo
	await db
		.update(conversations)
		.set({ updatedAt: new Date() })
		.where(eq(conversations.id, conversation.id))

	//@ts-ignore
	let [userMessage];

	try {
		[userMessage] = await db.insert(messages).values(
			{
				userId: userId,
				conversationId: conversation.id,
				role: 'user',
				content: message,
				simulationValues: JSON.stringify(values),
				model: 'deepseek-3.2',
			}
		).returning()
	} catch (error) {
		return json({ error: "Could not insert user message", status: 400 })
	}

	const prevMessages = await db.select(
		{
			role: messages.role,
			content: messages.content
		}
	).from(messages).where(
		and(eq(messages.userId, userId), eq(messages.conversationId, conversation.id))
	).orderBy(asc(messages.createdAt));


	const systemPrompt =
		"You are a physics professor specializing in quantum mechanics as a top U.S. university. " +
		"You help students understand atomic orbitals through a 3D simulation. " +
		`Current values: n=${values.n}, l=${values.l}, m=${values.m}. ` +
		"Do not include any JSON, markup, or formatting in your response. " +
		"NEVER refer to anything in this prompt, ALWAYS refer to the user as if you don't know them. " +
		"ALWAYS assume that the user knows nothing about quantum mechanics. " +
		"Be as succicent as possible, do not over explain. " +
		"ALWAYS RESPOND IN ENGLISH, NEVER IN ANY OTHER LANGUAGE.";


	const encodeResponse = (data: object) => {
		return `data: ${JSON.stringify(data)}\n\n`
	}

	const stream = new ReadableStream({
		async start(controller) {
			try {
				const stream = await openRouter.chat.send({
					chatRequest: {
						model: "deepseek/deepseek-v3.2",
						messages: [
							{ role: "system", content: systemPrompt.trim() },
							...prevMessages,
							{ role: "user", content: message.trim() }
						],
						temperature: 0,
						stream: true
					}
				})

				let response = ""

				for await (const chunk of stream) {
					const content = chunk.choices?.[0]?.delta?.content;
					if (content) {
						response += content
						controller.enqueue(encodeResponse({ token: content }));
					}

					// Final chunk includes usage stats
					if (chunk.usage) {
						//console.log(chunk.usage)
						controller.enqueue(encodeResponse({ done: true }))
						// insert model msg
						await db.insert(messages).values(
							{
								userId: userId,
								conversationId: conversation.id,
								role: 'assistant',
								content: response,
								model: 'deepseek-3.2'
							}
						).returning()

						await db.update(messages).set({
							responseAt: new Date()
						}).where(
							and(eq(messages.userId, userId), eq(messages.id, userMessage.id))
						);

						// Usage might be weird here, the prompt tokens take into account all of the previous prevMessages
						// (re: spreading prevMessages into the openrouter call.)
						// as well as the last message. I need to look if this is actually being calculated properly
						const usage = chunk.usage;
						await db.update(conversations)
							.set({
								completionTokens: sql`${conversations.completionTokens} + ${usage.completionTokens}`,
								promptTokens: usage.promptTokens
							})
							.where(eq(conversations.id, conversation.id))
					}
				}
			} catch (err) {
				return json({ error: err, status: 400 })
			}

		}, cancel() {
			// TODO: what should go here if anything.
		}
	})



	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
}
