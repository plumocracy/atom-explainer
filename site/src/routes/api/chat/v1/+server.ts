import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { canUserChat, requireUser } from '$lib/server/user';
import { appError, toErrorResponse, toPublicError } from '$lib/server/errors';
import {
	getActiveConversation,
	getConversationHistory,
	getConversationMessages,
	getOrCreateConversation,
	touchConversation,
} from '$lib/server/conversation';
import {
	CHAT_STREAM_HEADERS,
	ChatRequestSchema,
	type StreamedToolCall,
	encodeSse,
} from '$lib/server/chat/chat-contract';
import { buildSystemPrompt } from '$lib/server/chat/chat-prompt';
import {
	createAdditionalToolCalls,
	createChatStream,
	createToolExplanation,
} from '$lib/server/chat/chat-client';
import { ToolCallStreamAccumulator } from '$lib/server/chat/chat-tools';
import {
	finalizeAssistantTurn,
	getToolCallsForMessage,
	recordUserMessage,
} from '$lib/server/chat/chat-store';

const CHAT_MODEL = 'deepseek-3.2';

const hasUserFacingText = (content: string): boolean => {
	if (!content.trim()) {
		return false;
	}

	return /[A-Za-z0-9]/.test(content);
};

const parseSimulationValuesFromToolCall = (toolCall: StreamedToolCall) => {
	let parsedArgs = toolCall.function.parsedArguments;

	if ((typeof parsedArgs !== 'object' || parsedArgs === null) && toolCall.function.arguments) {
		try {
			parsedArgs = JSON.parse(toolCall.function.arguments);
		} catch {
			parsedArgs = null;
		}
	}

	if (typeof parsedArgs !== 'object' || parsedArgs === null) {
		return null;
	}

	const values = parsedArgs as { n?: unknown; l?: unknown; m?: unknown };
	if (typeof values.n === 'number' && typeof values.l === 'number' && typeof values.m === 'number') {
		return { n: values.n, l: values.l, m: values.m };
	}

	return null;
};

const parseCameraTargetFromToolCall = (toolCall: StreamedToolCall) => {
	let parsedArgs = toolCall.function.parsedArguments;

	if ((typeof parsedArgs !== 'object' || parsedArgs === null) && toolCall.function.arguments) {
		try {
			parsedArgs = JSON.parse(toolCall.function.arguments);
		} catch {
			parsedArgs = null;
		}
	}

	if (typeof parsedArgs !== 'object' || parsedArgs === null) {
		return null;
	}

	const values = parsedArgs as { x?: unknown; y?: unknown; z?: unknown };
	if (typeof values.x === 'number' && typeof values.y === 'number' && typeof values.z === 'number') {
		return { x: values.x, y: values.y, z: values.z };
	}

	return null;
};

const synthesizeToolOnlyResponse = (toolCalls: StreamedToolCall[]): string => {
	const summaries = toolCalls.map((toolCall) => {
		if (toolCall.function.name === 'set_simulation_params' || toolCall.function.name === 'set_simulation_values') {
			const values = parseSimulationValuesFromToolCall(toolCall);
			if (values) {
				return `I updated the simulation to n=${values.n}, l=${values.l}, m=${values.m}.`;
			}
		}

		if (toolCall.function.name === 'move_camera_to_point') {
			const camera = parseCameraTargetFromToolCall(toolCall);
			if (camera) {
				return `I moved the camera to x=${camera.x}, y=${camera.y}, z=${camera.z}.`;
			}
		}

		return `I used the ${toolCall.function.name} tool.`;
	});

	return summaries.join(' ');
};

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const chatAccess = await canUserChat(locals.user);
		if (!chatAccess.ok) {
			return toErrorResponse(chatAccess.error, locals.requestId);
		}

		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			return toErrorResponse(userResult.error, locals.requestId);
		}

		const userId = userResult.data.id;

		const conversationResult = await getActiveConversation(userId);
		if (!conversationResult.ok) {
			return toErrorResponse(conversationResult.error, locals.requestId);
		}

		if (!conversationResult.data) {
			return json({ success: true, messages: [] });
		}

		const conversationId = conversationResult.data.id;
		const historyResult = await getConversationHistory(userId, conversationId);
		if (!historyResult.ok) {
			return toErrorResponse(historyResult.error, locals.requestId);
		}

		const messagesWithToolCalls = await Promise.all(
			historyResult.data.map(async (message) => {
				const toolCallsResult = await getToolCallsForMessage(message.id);
				if (!toolCallsResult.ok) {
					throw toolCallsResult.error;
				}

				return {
					id: message.id,
					role: message.role,
					content: message.content,
					createdAt: message.createdAt,
					toolCalls: toolCallsResult.data.map((toolCall) => ({
						id: toolCall.id,
						providerCallId: toolCall.providerCallId,
						callIndex: toolCall.callIndex,
						toolType: toolCall.toolType,
						toolName: toolCall.toolName,
						argumentsRaw: toolCall.argumentsRaw,
						argumentsJson: toolCall.argumentsJson,
						createdAt: toolCall.createdAt,
					})),
				};
			})
		);

		return json({
			success: true,
			conversationId,
			messages: messagesWithToolCalls,
		});
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const chatAccess = await canUserChat(locals.user);
		if (!chatAccess.ok) {
			return toErrorResponse(chatAccess.error, locals.requestId);
		}

		const payload = ChatRequestSchema.safeParse(await request.json());
		if (!payload.success) {
			throw appError.badRequest('Invalid chat payload', payload.error.flatten());
		}

		const userResult = requireUser(locals.user);
		if (!userResult.ok) {
			throw userResult.error;
		}

		const userId = userResult.data.id;
		const { message, values } = payload.data;

		const conversationResult = await getOrCreateConversation(userId);
		if (!conversationResult.ok) {
			throw conversationResult.error;
		}
		const conversation = conversationResult.data;

		const touchResult = await touchConversation(conversation.id);
		if (!touchResult.ok) {
			throw touchResult.error;
		}

		const userMessageResult = await recordUserMessage({
			userId,
			conversationId: conversation.id,
			message,
			values,
			model: CHAT_MODEL,
		});
		if (!userMessageResult.ok) {
			throw userMessageResult.error;
		}
		const userMessageId = userMessageResult.data;

		const historyResult = await getConversationMessages(userId, conversation.id);
		if (!historyResult.ok) {
			throw historyResult.error;
		}
		const history = historyResult.data;

		const systemPrompt = buildSystemPrompt(values);

		const stream = new ReadableStream({
			async start(controller) {
				try {
					const completionStream = await createChatStream({
						systemPrompt,
						history,
						message,
					});

					const toolCalls = new ToolCallStreamAccumulator();
					let assistantResponse = '';
					let usage = {
						completionTokens: 0,
						promptTokens: 0,
					};
					let isCallingTools = false;

					for await (const chunk of completionStream) {
						if (chunk.error) {
							throw appError.internal('Upstream stream error', { details: chunk.error });
						}

						const delta = chunk.choices?.[0]?.delta;
						if (!delta) {
							continue;
						}

						if (delta.content) {
							assistantResponse += delta.content;
							controller.enqueue(encodeSse({ token: delta.content }));
						}

						if (delta.toolCalls?.length && !isCallingTools) {
							isCallingTools = true;
							controller.enqueue(encodeSse({ toolStatus: 'calling' }));
						}

						toolCalls.consume(delta.toolCalls);

						if (chunk.usage) {
							usage = {
								completionTokens: chunk.usage.completionTokens ?? 0,
								promptTokens: chunk.usage.promptTokens ?? 0,
							};
						}
					}

					const finalizedToolCalls = toolCalls.toArray();
					let allToolCalls = finalizedToolCalls;

					if (finalizedToolCalls.length) {
						try {
							const additionalToolCalls = await createAdditionalToolCalls({
								systemPrompt,
								history,
								message,
								toolCalls: finalizedToolCalls,
								maxRounds: 2,
							});

							if (additionalToolCalls.length) {
								allToolCalls = [...finalizedToolCalls, ...additionalToolCalls];
							}
						} catch {
							// Ignore follow-up tool-planning failures and continue with first-pass tool calls.
						}
					}

					if (!hasUserFacingText(assistantResponse) && allToolCalls.length) {
						try {
							const followup = await createToolExplanation({
								systemPrompt,
								history,
								message,
								toolCalls: allToolCalls,
							});

							usage = {
								promptTokens: usage.promptTokens + followup.usage.promptTokens,
								completionTokens: usage.completionTokens + followup.usage.completionTokens,
							};

							if (hasUserFacingText(followup.content)) {
								assistantResponse = followup.content;
								controller.enqueue(encodeSse({ token: assistantResponse }));
							} else {
								assistantResponse = synthesizeToolOnlyResponse(allToolCalls);
								controller.enqueue(encodeSse({ token: assistantResponse }));
							}
						} catch {
							assistantResponse = synthesizeToolOnlyResponse(allToolCalls);
							controller.enqueue(encodeSse({ token: assistantResponse }));
						}
					}

					if (allToolCalls.length) {
						controller.enqueue(encodeSse({ tools: allToolCalls }));
						if (isCallingTools) {
							controller.enqueue(encodeSse({ toolStatus: 'done' }));
						}
					} else if (isCallingTools) {
						controller.enqueue(encodeSse({ toolStatus: 'done' }));
					}

					const finalizeResult = await finalizeAssistantTurn({
						userId,
						conversationId: conversation.id,
						userMessageId,
						assistantMessage: assistantResponse,
						model: CHAT_MODEL,
						usage,
						toolCalls: allToolCalls,
					});
					if (!finalizeResult.ok) {
						throw finalizeResult.error;
					}

					controller.enqueue(encodeSse({ done: true }));
					controller.close();
				} catch (error) {
					const publicError = toPublicError(error, { requestId: locals.requestId });
					controller.enqueue(encodeSse({ error: publicError }));
					controller.enqueue(encodeSse({ done: true }));
					controller.close();
				}
			},
			cancel() {
				// no-op
			},
		});

		return new Response(stream, { headers: CHAT_STREAM_HEADERS });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
