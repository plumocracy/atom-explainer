import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { canUserChat, requireUser } from '$lib/server/user';
import { appError, toErrorResponse, toPublicError } from '$lib/server/errors';
import {
	getActiveConversation,
	getConversationForUser,
	getConversationHistory,
	getConversationMessages,
	getOrCreateConversationWithStatus,
	markStandingWaveVisualizationExplained,
	updateConversationTitle,
	touchConversation
} from '$lib/server/conversation';
import {
	CHAT_STREAM_HEADERS,
	ChatRequestSchema,
	type StreamedToolCall,
	encodeSse
} from '$lib/server/chat/chat-contract';
import { buildSystemPrompt } from '$lib/server/chat/chat-prompt';
import {
	createAdditionalToolCalls,
	createChatStream,
	createToolExplanation
} from '$lib/server/chat/chat-client';
import { estimateUserInputTokens } from '$lib/server/chat/user-input-tokens';
import { parseCreateButtons } from '$lib/chat-buttons';
import { generateConversationTitle } from '$lib/server/chat/chat-title';
import { ToolCallStreamAccumulator } from '$lib/server/chat/chat-tools';
import {
	finalizeAssistantTurn,
	getFeedbackMessageIdsForUser,
	getToolCallsForMessage,
	recordAssistantMessage,
	recordUserMessage
} from '$lib/server/chat/chat-store';
import { judgeTourConfirmation, judgeTourStep } from '$lib/server/tours/tour-judge';
import { parsePersistedTourState, stringifyPersistedTourState } from '$lib/tours/tour-persistence';
import { getNextTourStep, getTourCompletionMessage, getTourStep } from '$lib/tours/tours';
import { createTourToolCalls } from '$lib/tours/tour-tool-calls';

const CHAT_MODEL = 'deepseek-3.2';

const persistRunningTourMessage = async (input: {
	userId: string;
	conversationId: string;
	assistantMessage: string;
	tourId: string;
	stepId: string;
	attemptCount: number;
	awaitingConfirmation: boolean;
}) =>
	recordAssistantMessage({
		userId: input.userId,
		conversationId: input.conversationId,
		assistantMessage: input.assistantMessage,
		model: CHAT_MODEL,
		metadata: stringifyPersistedTourState({
			kind: 'guided_tour_state',
			status: 'running',
			tourId: input.tourId,
			stepId: input.stepId,
			attemptCount: input.attemptCount,
			awaitingConfirmation: input.awaitingConfirmation
		})
	});

const persistNextTourStep = async (input: {
	userId: string;
	conversationId: string;
	tourId: string;
	nextStep: NonNullable<ReturnType<typeof getNextTourStep>>;
}) =>
	recordAssistantMessage({
		userId: input.userId,
		conversationId: input.conversationId,
		assistantMessage: input.nextStep.assistantMarkdown,
		model: CHAT_MODEL,
		metadata: stringifyPersistedTourState({
			kind: 'guided_tour_state',
			status: 'running',
			tourId: input.tourId,
			stepId: input.nextStep.id,
			attemptCount: 0,
			awaitingConfirmation: false
		}),
		toolCalls: createTourToolCalls(input.nextStep.actions)
	});

const persistFinishedTour = async (input: {
	userId: string;
	conversationId: string;
	tourId: string;
}) =>
	recordAssistantMessage({
		userId: input.userId,
		conversationId: input.conversationId,
		assistantMessage: getTourCompletionMessage(input.tourId),
		model: CHAT_MODEL,
		metadata: stringifyPersistedTourState({
			kind: 'guided_tour_state',
			status: 'finished',
			tourId: input.tourId,
			stepId: null,
			attemptCount: 0,
			awaitingConfirmation: false
		})
	});

export const _hasUserFacingText = (content: string): boolean => {
	if (!content.trim()) {
		return false;
	}

	return /[A-Za-z0-9]/.test(content);
};

export const _parseSimulationValuesFromToolCall = (toolCall: StreamedToolCall) => {
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
	if (
		typeof values.n === 'number' &&
		typeof values.l === 'number' &&
		typeof values.m === 'number'
	) {
		return { n: values.n, l: values.l, m: values.m };
	}

	return null;
};

export const _parseCameraTargetFromToolCall = (toolCall: StreamedToolCall) => {
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
	if (
		typeof values.x === 'number' &&
		typeof values.y === 'number' &&
		typeof values.z === 'number'
	) {
		return { x: values.x, y: values.y, z: values.z };
	}

	return null;
};

export const _parseCrossSectionHiddenFromToolCall = (toolCall: StreamedToolCall) => {
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

	const values = parsedArgs as { hidden?: unknown };
	return typeof values.hidden === 'boolean' ? values.hidden : null;
};

export const _synthesizeToolOnlyResponse = (toolCalls: StreamedToolCall[]): string => {
	const summaries = toolCalls.map((toolCall) => {
		if (
			toolCall.function.name === 'set_simulation_params' ||
			toolCall.function.name === 'set_simulation_values'
		) {
			const values = _parseSimulationValuesFromToolCall(toolCall);
			if (values) {
				return `I updated the simulation to n=${values.n}, l=${values.l}, m=${values.m}.`;
			}
		}

		if (toolCall.function.name === 'move_camera_to_point') {
			const camera = _parseCameraTargetFromToolCall(toolCall);
			if (camera) {
				return `I moved the camera to x=${camera.x}, y=${camera.y}, z=${camera.z}.`;
			}
		}

		if (toolCall.function.name === 'toggle_positive_xy_cross_section') {
			const hidden = _parseCrossSectionHiddenFromToolCall(toolCall);
			if (typeof hidden === 'boolean') {
				return hidden
					? 'I hid the +X/+Y cross section.'
					: 'I showed the +X/+Y cross section again.';
			}
		}

		if (
			(toolCall.function.name === 'create_button' ||
				toolCall.function.name === 'create_toggle_button' ||
				toolCall.function.name === 'create_cross_section_toggle_button') &&
			parseCreateButtons(
				toolCall.function.name,
				toolCall.function.parsedArguments,
				toolCall.function.arguments
			)?.length
		) {
			return toolCall.function.name === 'create_button'
				? 'I added buttons with ready-to-use simulation actions.'
				: 'I added a synced toggle button.';
		}

		return `I used the ${toolCall.function.name} tool.`;
	});

	return summaries.join(' ');
};

export const _usesStandingWaveVisualizationTool = (toolCalls: StreamedToolCall[]): boolean =>
	toolCalls.some((toolCall) => toolCall.function.name === 'insert_standing_wave_visualization');

export const _hasStandingWaveUiExplanation = (content: string): boolean => {
	const normalized = content.toLowerCase();
	return (
		normalized.includes('hover') &&
		normalized.includes('probability') &&
		(normalized.includes('standing wave') || normalized.includes('wave'))
	);
};

export const GET: RequestHandler = async ({ locals, url }) => {
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
		const requestedConversationId = url.searchParams.get('conversation');

		const conversationResult = requestedConversationId
			? await getConversationForUser(userId, requestedConversationId)
			: await getActiveConversation(userId);
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
					tourState: parsePersistedTourState(message.simulationValues),
					toolCalls: toolCallsResult.data.map((toolCall) => ({
						id: toolCall.id,
						providerCallId: toolCall.providerCallId,
						callIndex: toolCall.callIndex,
						toolType: toolCall.toolType,
						toolName: toolCall.toolName,
						argumentsRaw: toolCall.argumentsRaw,
						argumentsJson: toolCall.argumentsJson,
						createdAt: toolCall.createdAt
					}))
				};
			})
		);

		const feedbackIdsResult = await getFeedbackMessageIdsForUser(
			userId,
			messagesWithToolCalls.filter((message) => message.role === 'assistant').map((message) => message.id)
		);
		if (!feedbackIdsResult.ok) {
			return toErrorResponse(feedbackIdsResult.error, locals.requestId);
		}

		const currentTour =
			[...messagesWithToolCalls].reverse().find((message) => message.tourState)?.tourState ?? null;

		return json({
			success: true,
			conversationId,
			messages: messagesWithToolCalls,
			feedbackMessageIds: [...feedbackIdsResult.data],
			currentTour
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
		const { message, conversationId, surface, simulation, guidedTour } = payload.data;
		const userInputTokens = estimateUserInputTokens(message);

		const conversation = conversationId
			? await (async () => {
					const existingConversationResult = await getConversationForUser(userId, conversationId);
					if (!existingConversationResult.ok) {
						throw existingConversationResult.error;
					}

					if (!existingConversationResult.data) {
						throw appError.badRequest('Conversation could not be found');
					}

					return existingConversationResult.data;
				})()
			: await (async () => {
					const conversationResult = await getOrCreateConversationWithStatus(userId);
					if (!conversationResult.ok) {
						throw conversationResult.error;
					}

					return conversationResult.data.conversation;
				})();
		const titlePromise = conversation.title ? null : generateConversationTitle(message);

		const touchResult = await touchConversation(conversation.id);
		if (!touchResult.ok) {
			throw touchResult.error;
		}

		const userMessageResult = await recordUserMessage({
			userId,
			conversationId: conversation.id,
			message,
			userInputTokens,
			simulation,
			model: CHAT_MODEL
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

		const activeTourStep = guidedTour
			? getTourStep(guidedTour.tourId, guidedTour.stepId)
			: undefined;
		let preflightJudged: Awaited<ReturnType<typeof judgeTourStep>> | null = null;

		if (guidedTour?.awaitingConfirmation && activeTourStep) {
			const stream = new ReadableStream({
				async start(controller) {
					try {
						const judged = await judgeTourConfirmation({
							step: activeTourStep,
							userMessage: message,
							recentConversation: history.slice(-6)
						});
						if (!judged.ok) {
							throw judged.error;
						}

						if (judged.data.affirmative) {
							const nextStep = getNextTourStep(guidedTour.tourId, guidedTour.stepId);
							if (nextStep) {
								const persistedStepResult = await persistNextTourStep({
									userId,
									conversationId: conversation.id,
									tourId: guidedTour.tourId,
									nextStep
								});
								if (!persistedStepResult.ok) {
									throw persistedStepResult.error;
								}

								controller.enqueue(encodeSse({ tour: { type: 'advance', step: nextStep } }));
							} else {
								const persistedFinishResult = await persistFinishedTour({
									userId,
									conversationId: conversation.id,
									tourId: guidedTour.tourId
								});
								if (!persistedFinishResult.ok) {
									throw persistedFinishResult.error;
								}

								controller.enqueue(
									encodeSse({
										tour: { type: 'finish', message: getTourCompletionMessage(guidedTour.tourId) }
									})
								);
							}
						} else {
							const persistedReplyResult = await persistRunningTourMessage({
								userId,
								conversationId: conversation.id,
								assistantMessage: judged.data.reply,
								tourId: guidedTour.tourId,
								stepId: guidedTour.stepId,
								attemptCount: guidedTour.attemptCount,
								awaitingConfirmation: false
							});
							if (!persistedReplyResult.ok) {
								throw persistedReplyResult.error;
							}

							controller.enqueue(
								encodeSse({
									tour: {
										type: 'message',
										message: judged.data.reply,
										awaitingConfirmation: false
									}
								})
							);
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
				}
			});

			return new Response(stream, { headers: CHAT_STREAM_HEADERS });
		}

		if (guidedTour && activeTourStep) {
			preflightJudged = await judgeTourStep({
				step: activeTourStep,
				userMessage: message,
				attemptCount: guidedTour.attemptCount,
				recentConversation: history.slice(-6)
			});

			if (preflightJudged.ok && preflightJudged.data.outcome === 'confirm') {
				const confirmationReply = preflightJudged.data.reply;
				const persistedReplyResult = await persistRunningTourMessage({
					userId,
					conversationId: conversation.id,
					assistantMessage: confirmationReply,
					tourId: guidedTour.tourId,
					stepId: guidedTour.stepId,
					attemptCount: guidedTour.attemptCount,
					awaitingConfirmation: true
				});
				if (!persistedReplyResult.ok) {
					throw persistedReplyResult.error;
				}

				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(
							encodeSse({
								tour: {
									type: 'message',
									message: confirmationReply,
									awaitingConfirmation: true
								}
							})
						);
						controller.enqueue(encodeSse({ done: true }));
						controller.close();
					},
					cancel() {
						// no-op
					}
				});

				return new Response(stream, { headers: CHAT_STREAM_HEADERS });
			}
		}

		const systemPrompt = buildSystemPrompt(
			simulation,
			surface,
			conversation.standingWaveVisualizationExplained,
			guidedTour
		);

		const stream = new ReadableStream({
			async start(controller) {
				try {
					const completionStream = await createChatStream({
						systemPrompt,
						history,
						message
					});

					const toolCalls = new ToolCallStreamAccumulator();
					let assistantResponse = '';
					let usage = {
						completionTokens: 0,
						promptTokens: 0
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
								promptTokens: chunk.usage.promptTokens ?? 0
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
								maxRounds: 2
							});

							if (additionalToolCalls.length) {
								allToolCalls = [...finalizedToolCalls, ...additionalToolCalls];
							}
						} catch {
							// Ignore follow-up tool-planning failures and continue with first-pass tool calls.
						}
					}

					if (!_hasUserFacingText(assistantResponse) && allToolCalls.length) {
						try {
							const followup = await createToolExplanation({
								systemPrompt,
								history,
								message,
								toolCalls: allToolCalls
							});

							usage = {
								promptTokens: usage.promptTokens + followup.usage.promptTokens,
								completionTokens: usage.completionTokens + followup.usage.completionTokens
							};

							if (_hasUserFacingText(followup.content)) {
								assistantResponse = followup.content;
								controller.enqueue(encodeSse({ token: assistantResponse }));
							} else {
								assistantResponse = _synthesizeToolOnlyResponse(allToolCalls);
								controller.enqueue(encodeSse({ token: assistantResponse }));
							}
						} catch {
							assistantResponse = _synthesizeToolOnlyResponse(allToolCalls);
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
						toolCalls: allToolCalls
					});
					if (!finalizeResult.ok) {
						throw finalizeResult.error;
					}
					const assistantMessageId = finalizeResult.data;

					if (
						!conversation.standingWaveVisualizationExplained &&
						_usesStandingWaveVisualizationTool(allToolCalls) &&
						_hasStandingWaveUiExplanation(assistantResponse)
					) {
						const standingWaveResult = await markStandingWaveVisualizationExplained(
							conversation.id
						);
						if (!standingWaveResult.ok) {
							throw standingWaveResult.error;
						}
						conversation.standingWaveVisualizationExplained = true;
					}

					if (titlePromise) {
						const titleResult = await titlePromise;
						if (titleResult.ok) {
							const titleUpdateResult = await updateConversationTitle(
								conversation.id,
								titleResult.data
							);

							if (!titleUpdateResult.ok) {
								console.error(titleUpdateResult.error);
							}
						} else {
							console.error(titleResult.error);
						}
					}

					if (preflightJudged?.ok) {
						controller.enqueue(
							encodeSse({
								tour:
									preflightJudged.data.outcome === 'hold'
										? {
												type: 'hold',
												messageType: preflightJudged.data.messageType
											}
										: {
												type: 'stay',
												messageType: preflightJudged.data.messageType
											}
							})
						);
					}

					controller.enqueue(encodeSse({ done: true, assistantMessageId }));
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
			}
		});

		return new Response(stream, { headers: CHAT_STREAM_HEADERS });
	} catch (error) {
		return toErrorResponse(error, locals.requestId);
	}
};
