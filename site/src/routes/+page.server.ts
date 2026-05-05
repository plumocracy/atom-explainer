import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { appError, throwKitError } from '$lib/server/errors';
import type { ChatButton } from '$lib/chat-buttons';
import { parseCreateButtons } from '$lib/chat-buttons';
import type { PersistedTourState } from '$lib/tours/tour-persistence';

type ChatHistoryApiResponse = {
	success: boolean;
	messages?: Array<{
		id: string;
		role: 'user' | 'assistant';
		content: string;
		tourState?: PersistedTourState | null;
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
	currentTour?: PersistedTourState | null;
	error?: {
		message?: string;
	};
};

type UiHistoryMessage = {
	role: 'user' | 'assistant' | 'tool';
	content: string;
	buttons?: ChatButton[];
	toolCalls?: Array<{
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
		crossSectionHidden?: boolean;
		visualizationMode?: 'orbital' | 'bohr';
		atomicNumber?: number;
	}>;
	tourState?: PersistedTourState | null;
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
		crossSectionHidden?: boolean;
		visualizationMode?: 'orbital' | 'bohr';
		atomicNumber?: number;
	};
};

export const parseSimulationValues = (toolName: string, argumentsJson: unknown, argumentsRaw: string) => {
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
	if (
		typeof values.n === 'number' &&
		typeof values.l === 'number' &&
		typeof values.m === 'number'
	) {
		return {
			n: values.n,
			l: values.l,
			m: values.m
		};
	}

	return undefined;
};

export const parseCameraTarget = (toolName: string, argumentsJson: unknown, argumentsRaw: string) => {
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
	if (
		typeof values.x === 'number' &&
		typeof values.y === 'number' &&
		typeof values.z === 'number'
	) {
		return {
			x: values.x,
			y: values.y,
			z: values.z,
			durationMs: typeof values.durationMs === 'number' ? values.durationMs : undefined
		};
	}

	return undefined;
};

const parseCrossSectionHidden = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
) => {
	if (toolName !== 'toggle_positive_xy_cross_section') {
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

	const values = parsed as { hidden?: unknown };
	return typeof values.hidden === 'boolean' ? values.hidden : undefined;
};

export const parseVisualizationMode = (toolName: string, argumentsJson: unknown, argumentsRaw: string) => {
	if (toolName !== 'set_visualization_mode') {
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

	const values = parsed as { mode?: unknown };
	return values.mode === 'orbital' || values.mode === 'bohr' ? values.mode : undefined;
};

export const parseAtomicNumber = (toolName: string, argumentsJson: unknown, argumentsRaw: string) => {
	if (toolName !== 'set_bohr_atomic_number') {
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

	const values = parsed as { atomicNumber?: unknown };
	return typeof values.atomicNumber === 'number' ? values.atomicNumber : undefined;
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
		throwKitError(
			appError.internal('Chat history response was malformed', { details: payload }),
			locals.requestId
		);
	}

	const safePayload = payload as {
		success: true;
		messages: Array<{
			id: string;
			role: 'user' | 'assistant';
			content: string;
			tourState?: PersistedTourState | null;
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
		currentTour?: PersistedTourState | null;
	};
	const historyMessages = safePayload.messages;
	const messagesWithTools: UiHistoryMessage[] = [];

	for (const message of historyMessages) {
		const uiMessage: UiHistoryMessage = {
			role: message.role,
			content: message.content,
			tourState: message.tourState ?? null
		};
		messagesWithTools.push(uiMessage);

		for (const toolCall of message.toolCalls ?? []) {
			const buttons = parseCreateButtons(
				toolCall.toolName,
				toolCall.argumentsJson,
				toolCall.argumentsRaw
			);
			if (buttons?.length) {
				uiMessage.buttons = [...(uiMessage.buttons ?? []), ...buttons];
				continue;
			}

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
			const crossSectionHidden = parseCrossSectionHidden(
				toolCall.toolName,
				toolCall.argumentsJson,
				toolCall.argumentsRaw
			);
			const visualizationMode = parseVisualizationMode(
				toolCall.toolName,
				toolCall.argumentsJson,
				toolCall.argumentsRaw
			);
			const atomicNumber = parseAtomicNumber(
				toolCall.toolName,
				toolCall.argumentsJson,
				toolCall.argumentsRaw
			);
			uiMessage.toolCalls = [
				...(uiMessage.toolCalls ?? []),
				{
					toolName: toolCall.toolName,
					providerCallId: toolCall.providerCallId,
					callIndex: toolCall.callIndex,
					argumentsRaw: toolCall.argumentsRaw,
					argumentsJson: toolCall.argumentsJson,
					simulationValues,
					cameraTarget,
					crossSectionHidden,
					visualizationMode,
					atomicNumber
				}
			];
		}
	}

	return {
		user,
		chatEnabled,
		messages: messagesWithTools,
		currentTour: safePayload.currentTour ?? null
	};
};
