import { EventSourcePlus } from 'event-source-plus';
import { showErrorToast } from '$lib/toast.svelte';
import {
	createChatMessage,
	queueOrbitalCameraMove,
	type CameraTarget,
	type Message,
	type SimulationValues,
	type ToolCallMessage
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
	setLoading: (next: boolean) => void;
	setToolCalling?: (next: boolean) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const parseToolCalls = (value: unknown): StreamToolCall[] => {
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

const applySimulationToolCalls = (value: unknown, simulationValues: SimulationValues) => {
	const toolCalls = parseToolCalls(value);
	const toolCallMessages: ToolCallMessage[] = [];

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
		if (isRecord(parsedArgs)) {
			const n = parsedArgs.n;
			const l = parsedArgs.l;
			const m = parsedArgs.m;
			const x = parsedArgs.x;
			const y = parsedArgs.y;
			const z = parsedArgs.z;
			const durationMs = parsedArgs.durationMs;

			if (typeof n === 'number' && typeof l === 'number' && typeof m === 'number') {
				parsedSimulationValues = { n, l, m };
			}

			if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
				parsedCameraTarget = {
					x,
					y,
					z,
					durationMs: typeof durationMs === 'number' ? durationMs : undefined,
				};
			}
		}

		if ((toolName === 'set_simulation_params' || toolName === 'set_simulation_values') && parsedSimulationValues) {
			simulationValues.n = parsedSimulationValues.n;
			simulationValues.l = parsedSimulationValues.l;
			simulationValues.m = parsedSimulationValues.m;
		}

		if (toolName === 'move_camera_to_point' && parsedCameraTarget) {
			queueOrbitalCameraMove(parsedCameraTarget);
		}

		toolCallMessages.push({
			toolName,
			providerCallId: toolCall.id ?? null,
			callIndex: toolCall.index,
			argumentsRaw: toolFunction.arguments,
			argumentsJson: parsedArgs,
			simulationValues: parsedSimulationValues,
			cameraTarget: parsedCameraTarget,
		});
	}

	return toolCallMessages;
};

const summarizeToolCall = (toolCall: ToolCallMessage): string => {
	if (toolCall.simulationValues) {
		return `I updated the simulation to n=${toolCall.simulationValues.n}, l=${toolCall.simulationValues.l}, m=${toolCall.simulationValues.m}.`;
	}

	if (toolCall.cameraTarget) {
		return `I moved the camera to x=${toolCall.cameraTarget.x}, y=${toolCall.cameraTarget.y}, z=${toolCall.cameraTarget.z}.`;
	}

	return `I used the ${toolCall.toolName} tool.`;
};

export const useChatStream = (options: UseChatStreamOptions) => {
	const { chatMessages, simulationValues, setLoading, setToolCalling } = options;
	let inFlight = false;

	const sendMessage = (message: string): void => {
		if (inFlight) {
			return;
		}

		inFlight = true;
		setLoading(true);
		setToolCalling?.(false);

		chatMessages.push(createChatMessage({
			role: 'user',
			content: message,
			live: false,
		}));

		chatMessages.push(createChatMessage({
			role: 'assistant',
			content: '',
			pending: true,
			live: true,
		}));

		const botMessageIdx = chatMessages.length - 1;

		const failPendingMessage = (reason: unknown, fallback: string) => {
			const pendingMessage = chatMessages[botMessageIdx];
			if (pendingMessage) {
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

		try {
			const eventSource = new EventSourcePlus('/api/chat/v1', {
				method: 'post',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message, values: simulationValues }),
				retryStrategy: 'on-error',
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

						if (payload.token) {
							chatMessages[botMessageIdx].content += payload.token;
						} else if (payload.toolStatus === 'calling') {
							setToolCalling?.(true);
						} else if (payload.toolStatus === 'done') {
							setToolCalling?.(false);
						} else if (payload.done) {
							if (!chatMessages[botMessageIdx].content.trim() && synthesizedSummaryFromTools) {
								chatMessages[botMessageIdx].content = synthesizedSummaryFromTools;
							}
							chatMessages[botMessageIdx].pending = false;
							inFlight = false;
							setLoading(false);
							setToolCalling?.(false);
							controller.abort();
						} else if (payload.tools) {
							setToolCalling?.(false);
							const parsedToolCalls = applySimulationToolCalls(payload.tools, simulationValues);
							for (const toolCall of parsedToolCalls) {
								const content = toolCall.simulationValues
									? `Set simulation values to n=${toolCall.simulationValues.n}, l=${toolCall.simulationValues.l}, m=${toolCall.simulationValues.m}`
									: toolCall.cameraTarget
										? `Moved camera to x=${toolCall.cameraTarget.x}, y=${toolCall.cameraTarget.y}, z=${toolCall.cameraTarget.z}`
										: `Ran tool ${toolCall.toolName}`;

								synthesizedSummaryFromTools = `${synthesizedSummaryFromTools} ${summarizeToolCall(toolCall)}`.trim();

								chatMessages.push(
									createChatMessage({
										role: 'tool',
										content,
										live: false,
										toolCall,
									})
								);
							}
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
					failOnce(context.response?._data, `Request failed with status ${context.response.status}`);
				},
				onRequestError(context) {
					failOnce(context.error, 'Could not connect to the assistant endpoint.');
				},
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
