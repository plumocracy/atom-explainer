import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { appError, throwKitError } from '$lib/server/errors';
import type { ChatButton } from '$lib/chat-buttons';
import { parseCreateButtons } from '$lib/chat-buttons';
import type { PersistedTourState } from '$lib/tours/tour-persistence';
import {
	isMobileRequest,
	parseAtomicNumber,
	parseCameraTarget,
	parseCrossSectionHidden,
	parseSimulationValues,
	parseVisualizationAttachment,
	parseVisualizationMode
} from './page.server.helpers';

type ChatHistoryApiResponse = {
	success: boolean;
	conversationId?: string;
	messages?: Array<{
		id: string;
		role: 'user' | 'assistant';
		content: string;
		feedbackSubmitted?: boolean;
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
	feedbackMessageIds?: string[];
	error?: {
		message?: string;
	};
};

type UiHistoryMessage = {
	id?: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	feedbackSubmitted?: boolean;
	buttons?: ChatButton[];
	visualizations?: Array<{
		type: 'standing_wave';
	}>;
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

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	const { user } = locals;
	const chatEnabled = env.FLAG_CHAT_ENABLED == 'TRUE';
	const mobileDevice = isMobileRequest(event.request.headers);
	const selectedConversationId = event.url.searchParams.get('conversation')?.trim() || null;
	const openChat = event.url.searchParams.get('openChat') === '1';

	if (!user) {
		return { user: null, chatEnabled, mobileDevice, messages: [], openChat: false, conversationId: null };
	}

	if (mobileDevice) {
		return { user, chatEnabled, mobileDevice, messages: [], openChat: false, conversationId: null };
	}

	if (!chatEnabled) {
		return { user, chatEnabled, mobileDevice, messages: [], openChat: false, conversationId: null };
	}

	const historyPath = selectedConversationId
		? `/api/chat/v1?conversation=${encodeURIComponent(selectedConversationId)}`
		: '/api/chat/v1';
	const historyResponse = await event.fetch(historyPath);
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
		conversationId?: string;
		messages: Array<{
			id: string;
			role: 'user' | 'assistant';
			content: string;
			feedbackSubmitted?: boolean;
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
		feedbackMessageIds?: string[];
		currentTour?: PersistedTourState | null;
	};
	const historyMessages = safePayload.messages;
	const feedbackMessageIds = new Set(safePayload.feedbackMessageIds ?? []);
	const messagesWithTools: UiHistoryMessage[] = [];

	for (const message of historyMessages) {
		const uiMessage: UiHistoryMessage = {
			id: message.id,
			role: message.role,
			content: message.content,
			feedbackSubmitted: feedbackMessageIds.has(message.id),
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
			const visualization = parseVisualizationAttachment(toolCall.toolName);
			if (visualization) {
				uiMessage.visualizations = [...(uiMessage.visualizations ?? []), visualization];
			}
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
		mobileDevice,
		messages: messagesWithTools,
		currentTour: safePayload.currentTour ?? null,
		openChat,
		conversationId: safePayload.conversationId ?? selectedConversationId
	};
};
