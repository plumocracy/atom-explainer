import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { appError, throwKitError } from '$lib/server/errors';

type ChatHistoryApiResponse = {
	success: boolean;
	messages?: Array<{
		id: string;
		role: 'user' | 'assistant';
		content: string;
		toolCalls?: Array<{
			id: string;
			providerCallId: string | null;
			callIndex: number;
			toolType: 'function';
			toolName: string;
			argumentsRaw: string;
			argumentsJson: unknown;
			createdAt: string;
		}>;
	}>;
	error?: {
		message?: string;
	};
};

type UiHistoryMessage = {
	role: 'user' | 'assistant' | 'tool';
	content: string;
	toolCall?: {
		toolName: string;
		providerCallId?: string | null;
		callIndex?: number;
		argumentsRaw?: string;
		argumentsJson?: unknown;
		simulationValues?: {
			n: number;
			l: number;
			m: number;
		};
		cameraTarget?: {
			x: number;
			y: number;
			z: number;
			durationMs?: number;
		};
	};
};

const parseSimulationValues = (toolName: string, argumentsJson: unknown, argumentsRaw: string) => {
	if (toolName !== 'set_simulation_params' && toolName !== 'set_simulation_values') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { n?: unknown; l?: unknown; m?: unknown };
	if (typeof values.n === 'number' && typeof values.l === 'number' && typeof values.m === 'number') {
		return {
			n: values.n,
			l: values.l,
			m: values.m,
		};
	}

	return undefined;
};

const parseCameraTarget = (toolName: string, argumentsJson: unknown, argumentsRaw: string) => {
	if (toolName !== 'move_camera_to_point') {
		return undefined;
	}

	let parsed = argumentsJson;
	if ((typeof parsed !== 'object' || parsed === null) && argumentsRaw) {
		try {
			parsed = JSON.parse(argumentsRaw);
		} catch {
			parsed = null;
		}
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return undefined;
	}

	const values = parsed as { x?: unknown; y?: unknown; z?: unknown; durationMs?: unknown };
	if (typeof values.x === 'number' && typeof values.y === 'number' && typeof values.z === 'number') {
		return {
			x: values.x,
			y: values.y,
			z: values.z,
			durationMs: typeof values.durationMs === 'number' ? values.durationMs : undefined,
		};
	}

	return undefined;
};

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	const { user } = locals;
	const chatEnabled = env.FLAG_CHAT_ENABLED == 'TRUE';

	if (!user) {
		return { user: null, chatEnabled, messages: [] };
	}

	if (!chatEnabled) {
		return { user, chatEnabled, messages: [] };
	}

	const historyResponse = await event.fetch('/api/chat/v1');
	const payload = (await historyResponse.json().catch(() => null)) as ChatHistoryApiResponse | null;

	if (!historyResponse.ok) {
		const message = payload?.error?.message ?? 'Could not load chat history';
		throwKitError(appError.internal(message, { details: payload }), locals.requestId);
	}

	if (!payload || payload.success !== true || !Array.isArray(payload.messages)) {
		throwKitError(appError.internal('Chat history response was malformed', { details: payload }), locals.requestId);
	}

	const safePayload = payload as {
		success: true;
		messages: Array<{
			id: string;
			role: 'user' | 'assistant';
			content: string;
			toolCalls?: Array<{
				id: string;
				providerCallId: string | null;
				callIndex: number;
				toolType: 'function';
				toolName: string;
				argumentsRaw: string;
				argumentsJson: unknown;
				createdAt: string;
			}>;
		}>;
	};
	const historyMessages = safePayload.messages;
	const messagesWithTools: UiHistoryMessage[] = [];

	for (const message of historyMessages) {
		messagesWithTools.push({
			role: message.role,
			content: message.content,
		});

		for (const toolCall of message.toolCalls ?? []) {
			const simulationValues = parseSimulationValues(
				toolCall.toolName,
				toolCall.argumentsJson,
				toolCall.argumentsRaw
			);
			const cameraTarget = parseCameraTarget(
				toolCall.toolName,
				toolCall.argumentsJson,
				toolCall.argumentsRaw
			);
			messagesWithTools.push({
				role: 'tool',
				content: simulationValues
					? `Set simulation values to n=${simulationValues.n}, l=${simulationValues.l}, m=${simulationValues.m}`
					: cameraTarget
						? `Moved camera to x=${cameraTarget.x}, y=${cameraTarget.y}, z=${cameraTarget.z}`
						: `Ran tool ${toolCall.toolName}`,
				toolCall: {
					toolName: toolCall.toolName,
					providerCallId: toolCall.providerCallId,
					callIndex: toolCall.callIndex,
					argumentsRaw: toolCall.argumentsRaw,
					argumentsJson: toolCall.argumentsJson,
					simulationValues,
					cameraTarget,
				},
			});
		}
	}

	return {
		user,
		chatEnabled,
		messages: messagesWithTools,
	};
};
