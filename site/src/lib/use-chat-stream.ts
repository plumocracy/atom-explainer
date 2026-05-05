import { EventSourcePlus } from 'event-source-plus';
import { parseCreateButtons } from '$lib/chat-buttons';
import { showErrorToast } from '$lib/toast.svelte';
import { guidedTourState } from '$lib/tours/tour-state.svelte';
import { applyGuidedTourEvent } from '$lib/tours/tour-runner';
import {
	applyToolCallMessage,
	createChatMessage,
	getBohrShellDistribution,
	orbitalViewState,
	type CameraTarget,
	type Message,
	type SimulationValues,
	type ToolCallMessage,
	type VisualizationMode
} from '$lib/chat.svelte';

type StreamToolCall = {
	id?: string;
	index?: number;
	function?: {
		name?: string;
		arguments?: string;
		parsedArguments?: unknown;
	};
};

type UseChatStreamOptions = {
	chatMessages: Message[];
	simulationValues: SimulationValues;
	bohrSimulationValues: { atomicNumber: number };
	visualizationState: { mode: VisualizationMode };
	setLoading: (next: boolean) => void;
	setToolCalling?: (next: boolean) => void;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const parseToolCalls = (value: unknown): StreamToolCall[] => {
	if (Array.isArray(value)) {
		return value as StreamToolCall[];
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? (parsed as StreamToolCall[]) : [parsed as StreamToolCall];
		} catch {
			return [];
		}
	}

	if (isRecord(value)) {
		return [value as StreamToolCall];
	}

	return [];
};

export const applySimulationToolCalls = (value: unknown, simulationValues: SimulationValues) => {
	const toolCalls = parseToolCalls(value);
	const toolCallMessages: ToolCallMessage[] = [];
	const buttons = [] as NonNullable<Message['buttons']>;

	for (const toolCall of toolCalls) {
		const toolFunction = toolCall.function;
		const toolName = toolFunction?.name;
		if (!toolName) {
			continue;
		}

		let parsedArgs: unknown = toolFunction.parsedArguments;
		if (!parsedArgs && toolFunction.arguments) {
			try {
				parsedArgs = JSON.parse(toolFunction.arguments);
			} catch {
				parsedArgs = null;
			}
		}

		let parsedSimulationValues: SimulationValues | undefined;
		let parsedCameraTarget: CameraTarget | undefined;
		let parsedCrossSectionHidden: boolean | undefined;
		const parsedButtons = parseCreateButtons(toolName, parsedArgs, toolFunction.arguments ?? '');
		if (parsedButtons?.length) {
			buttons.push(...parsedButtons);
			continue;
		}

		if (isRecord(parsedArgs)) {
			const n = parsedArgs.n;
			const l = parsedArgs.l;
			const m = parsedArgs.m;
			const x = parsedArgs.x;
			const y = parsedArgs.y;
			const z = parsedArgs.z;
			const durationMs = parsedArgs.durationMs;
			const hidden = parsedArgs.hidden;

			if (typeof n === 'number' && typeof l === 'number' && typeof m === 'number') {
				parsedSimulationValues = { n, l, m };
			}

			if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
				parsedCameraTarget = {
					x,
					y,
					z,
					durationMs: typeof durationMs === 'number' ? durationMs : undefined
				};
			}

			if (typeof hidden === 'boolean') {
				parsedCrossSectionHidden = hidden;
			}
		}

		const parsedToolCall = {
			toolName,
			providerCallId: toolCall.id ?? null,
			callIndex: toolCall.index,
			argumentsRaw: toolFunction.arguments,
			argumentsJson: parsedArgs,
			simulationValues: parsedSimulationValues,
			cameraTarget: parsedCameraTarget,
			crossSectionHidden: parsedCrossSectionHidden
		};

		applyToolCallMessage(parsedToolCall);
		toolCallMessages.push(parsedToolCall);
	}

	return { toolCallMessages, buttons };
};

export const summarizeToolCall = (toolCall: ToolCallMessage): string => {
	if (toolCall.simulationValues) {
		return `I updated the simulation to n=${toolCall.simulationValues.n}, l=${toolCall.simulationValues.l}, m=${toolCall.simulationValues.m}.`;
	}

	if (toolCall.cameraTarget) {
		return `I moved the camera to x=${toolCall.cameraTarget.x}, y=${toolCall.cameraTarget.y}, z=${toolCall.cameraTarget.z}.`;
	}

	if (typeof toolCall.crossSectionHidden === 'boolean') {
		return toolCall.crossSectionHidden
			? 'I hid the +X/+Y cross section.'
			: 'I showed the full cloud again by restoring the +X/+Y cross section.';
	}

	return `I used the ${toolCall.toolName} tool.`;
};

export const useChatStream = (options: UseChatStreamOptions) => {
	const {
		chatMessages,
		simulationValues,
		bohrSimulationValues,
		visualizationState,
		setLoading,
		setToolCalling
	} = options;
	let inFlight = false;

	const sendMessage = (message: string): void => {
		if (inFlight) {
			return;
		}

		inFlight = true;
		setLoading(true);
		setToolCalling?.(false);

		chatMessages.push(
			createChatMessage({
				role: 'user',
				content: message,
				live: false
			})
		);

		chatMessages.push(
			createChatMessage({
				role: 'assistant',
				content: '',
				pending: true,
				live: true
			})
		);

		let botMessageIdx = chatMessages.length - 1;

		const failPendingMessage = (reason: unknown, fallback: string) => {
			const pendingMessage = chatMessages[botMessageIdx];
			if (botMessageIdx >= 0 && pendingMessage) {
				pendingMessage.pending = false;
				if (!pendingMessage.content) {
					pendingMessage.content = 'Sorry, I hit an error before I could respond.';
				}
			}

			inFlight = false;
			setLoading(false);
			setToolCalling?.(false);
			showErrorToast(reason, fallback);
		};

		const discardEmptyPendingAssistant = () => {
			const pendingMessage = chatMessages[botMessageIdx];
			if (
				botMessageIdx < 0 ||
				!pendingMessage ||
				pendingMessage.role !== 'assistant' ||
				pendingMessage.content.trim() ||
				(pendingMessage.toolCalls?.length ?? 0) > 0 ||
				(pendingMessage.buttons?.length ?? 0) > 0
			) {
				return;
			}

			chatMessages.splice(botMessageIdx, 1);
			botMessageIdx = -1;
		};

		try {
			const simulation =
				visualizationState.mode === 'bohr'
					? {
							mode: 'bohr' as const,
							values: {
								atomicNumber: bohrSimulationValues.atomicNumber,
								shellDistribution: getBohrShellDistribution(bohrSimulationValues.atomicNumber)
							}
						}
					: {
							mode: 'orbital' as const,
							values: {
								...simulationValues,
								hidePositiveXYCrossSection: orbitalViewState.hidePositiveXYCrossSection
							}
						};

			const eventSource = new EventSourcePlus('/api/chat/v1', {
				method: 'post',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					simulation,
					guidedTour:
						guidedTourState.status === 'running' &&
						guidedTourState.activeTourId &&
						guidedTourState.activeStepId
							? {
									tourId: guidedTourState.activeTourId,
									stepId: guidedTourState.activeStepId,
									attemptCount: guidedTourState.attemptCount,
									awaitingConfirmation: guidedTourState.awaitingConfirmation
								}
							: undefined
				}),
				retryStrategy: 'on-error'
			});

			let streamFailed = false;
			let synthesizedSummaryFromTools = '';
			const failOnce = (reason: unknown, fallback: string) => {
				if (streamFailed) {
					return;
				}

				streamFailed = true;
				failPendingMessage(reason, fallback);
			};

			const controller = eventSource.listen({
				onMessage(streamMessage) {
					try {
						const payload = JSON.parse(streamMessage.data);
						const pendingMessage = botMessageIdx >= 0 ? chatMessages[botMessageIdx] : null;

						if (payload.token) {
							if (pendingMessage) {
								pendingMessage.content += payload.token;
							}
						} else if (payload.toolStatus === 'calling') {
							setToolCalling?.(true);
						} else if (payload.toolStatus === 'done') {
							setToolCalling?.(false);
						} else if (payload.done) {
							if (pendingMessage && !pendingMessage.content.trim() && synthesizedSummaryFromTools) {
								pendingMessage.content = synthesizedSummaryFromTools;
							}
							if (pendingMessage) {
								pendingMessage.pending = false;
							}
							inFlight = false;
							setLoading(false);
							setToolCalling?.(false);
							controller.abort();
						} else if (payload.tools) {
							setToolCalling?.(false);
							const { toolCallMessages: parsedToolCalls, buttons } = applySimulationToolCalls(
								payload.tools,
								simulationValues
							);
							if (pendingMessage && buttons.length) {
								pendingMessage.buttons = [...(pendingMessage.buttons ?? []), ...buttons];
							}
							for (const toolCall of parsedToolCalls) {
								synthesizedSummaryFromTools =
									`${synthesizedSummaryFromTools} ${summarizeToolCall(toolCall)}`.trim();
							}
							if (pendingMessage) {
								pendingMessage.toolCalls = [
									...(pendingMessage.toolCalls ?? []),
									...parsedToolCalls
								];
							}
						} else if (payload.tour) {
							if (payload.tour.type === 'message' || payload.tour.type === 'advance' || payload.tour.type === 'finish') {
								discardEmptyPendingAssistant();
							}
							applyGuidedTourEvent(payload.tour);
						} else if (payload.error) {
							failOnce(payload.error, 'The assistant request failed.');
							controller.abort();
						}
					} catch (error) {
						console.error(`Could not parse response (sse) data: ${streamMessage.data}`);
						failOnce(error, 'Could not parse the assistant response stream.');
					}
				},
				onResponseError(context) {
					failOnce(
						context.response?._data,
						`Request failed with status ${context.response.status}`
					);
				},
				onRequestError(context) {
					failOnce(context.error, 'Could not connect to the assistant endpoint.');
				}
			});

			controller.onAbort((event) => {
				if (event.type === 'error') {
					inFlight = false;
					setLoading(false);
					setToolCalling?.(false);
				}
			});
		} catch (error) {
			failPendingMessage(error, 'Could not start assistant request.');
		}
	};

	return { sendMessage };
};
