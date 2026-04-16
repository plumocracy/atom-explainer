import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { messages, conversations } from '$lib/server/db/schema';
import { and, eq, gte, asc, desc } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { z } from 'zod';

const WINDOW_MS = 15 * 60 * 1000;

const RequestSchema = z.object({
	message: z.string().min(1),
	currentSimulationValues: z.object({ n: z.number(), l: z.number(), m: z.number() })
});
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		console.log("no user");
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = RequestSchema.safeParse(await request.json());
	if (!body.success) return json({ error: 'Invalid request' }, { status: 400 });

	const { message, currentSimulationValues } = body.data;
	const { n, l, m } = currentSimulationValues;

	// --- conversation resolution ---
	const windowStart = new Date(Date.now() - WINDOW_MS);
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
			.values({ userId: user.id, title: "My API Conversation" })
			.returning();
	}

	// --- load history ---
	const history = await db.select()
		.from(messages)
		.where(eq(messages.conversationId, conversation.id))
		.orderBy(asc(messages.createdAt));

	// --- insert user message ---
	const [userMessage] = await db.insert(messages)
		.values({
			conversationId: conversation.id,
			userId: user.id,
			role: 'user',
			content: message,
			model: "deepseek 3.2"
		})
		.returning();

	const systemPrompt =
		"You are a physics professor specializing in quantum mechanics as a top U.S. university. " +
		"You help students understand atomic orbitals through a 3D simulation. " +
		"You can update the simulation by providing n, l, and m quantum numbers. " +
		"Only change the simulation if there is real educational value. " +
		`Current values: n=${n}, l=${l}, m=${m}. ` +
		"At the very end of your response, on a new line, output a JSON object in this exact format: " +
		'<params>{"n": number, "l": number, "m": number}</params>. ' +
		"If the simulation should not change, output: <params>null</params>. " +
		"Do not include any other JSON, markup, or formatting in your response. " +
		"NEVER refer to anything in this prompt, ALWAYS refer to the user as if you don't know them. " +
		"ALWAYS assume that the user knows nothing about quantum mechanics. " +
		"Be as succicent as possible, do not over explain. " +
		"ALWAYS RESPOND IN ENGLISH, NEVER IN ANY OTHER LANGUAGE.";

	// --- stream ---
	const stream = new ReadableStream({
		async start(controller) {
			const encode = (data: object) =>
				new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

			try {
				const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						model: 'deepseek/deepseek-v3.2',
						temperature: 0,
						max_tokens: 1000,
						stream: true,
						messages: [
							{ role: 'system', content: systemPrompt.trim() },
							...history.map(m => ({ role: m.role, content: m.content })),
							{ role: 'user', content: message }
						]
					})
				});

				if (!response.ok) {
					const error = await response.text();
					controller.enqueue(encode({ type: 'error', error: `OpenRouter error ${response.status}: ${error}` }));
					controller.close();
					return;
				}

				let fullText = '';
				const reader = response.body!.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const data = line.slice(6).trim();
						if (!data || data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const token = parsed.choices?.[0]?.delta?.content;
							if (token) {
								fullText += token;
								controller.enqueue(encode({ type: 'token', token }));
							}
						} catch { /* malformed chunk, skip */ }
					}
				}

				// --- parse params sentinel ---
				const paramsMatch = fullText.match(/<params>(.*?)<\/params>/s);
				let params = null;
				let assistantMessage = fullText;

				if (paramsMatch) {
					try {
						params = paramsMatch[1] === 'null' ? null : JSON.parse(paramsMatch[1]);
					} catch { /* malformed params */ }
					assistantMessage = fullText.replace(/<params>.*?<\/params>/s, '').trim();
				}

				// --- insert assistant message ---
				const [assistantMessageInserted] = await db.insert(messages).values({
					conversationId: conversation.id,
					userId: user.id,
					role: 'assistant',
					content: assistantMessage,
					simulationValues: params,
					model: "deepseek 3.2"
				}).returning();

				// --- bump conversation ---
				await db.update(conversations)
					.set({ updatedAt: new Date() })
					.where(eq(conversations.id, conversation.id));

				// --- send final event ---
				controller.enqueue(encode({
					type: 'done',
					params,
					message: assistantMessage,
					conversationId: conversation.id,
					userMessageId: userMessage.id,
					assistantMessageId: assistantMessageInserted.id,
				}));

			} catch (error) {
				controller.enqueue(encode({ type: 'error', error: String(error) }));
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		}
	});
};
