import type { ConversationMessage } from '$lib/server/conversation';
import { openRouter } from '$lib/server/openrouter';
import type { StreamedToolCall } from './chat-contract';
import { CHAT_TOOLS } from './chat-tools';

type CreateChatStreamInput = {
	systemPrompt: string;
	history: ConversationMessage[];
	message: string;
	allowTools?: boolean;
	signal?: AbortSignal;
};

export const parseArgumentsText = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}

	if (value === undefined || value === null) {
		return '';
	}

	try {
		return JSON.stringify(value);
	} catch {
		return '';
	}
};

export const parseArgumentsJson = (value: string): unknown | undefined => {
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
};

export const collectToolCallsFromResponse = (
	response: unknown,
	indexOffset = 0
): StreamedToolCall[] => {
	if (typeof response !== 'object' || response === null) {
		return [];
	}

	const root = response as {
		choices?: Array<{
			message?: {
				toolCalls?: Array<{
					id?: string;
					index?: number;
					function?: { name?: string; arguments?: unknown };
				}>;
			};
		}>;
	};

	const rawToolCalls = root.choices?.[0]?.message?.toolCalls ?? [];
	const parsed: StreamedToolCall[] = [];

	for (let idx = 0; idx < rawToolCalls.length; idx += 1) {
		const toolCall = rawToolCalls[idx];
		const toolName = toolCall.function?.name;
		if (!toolName) {
			continue;
		}

		const argumentsText = parseArgumentsText(toolCall.function?.arguments);
		parsed.push({
			id: toolCall.id,
			index: indexOffset + (toolCall.index ?? idx),
			type: 'function',
			function: {
				name: toolName,
				arguments: argumentsText,
				parsedArguments: parseArgumentsJson(argumentsText)
			}
		});
	}

	return parsed;
};

export const summarizeToolCalls = (toolCalls: StreamedToolCall[]): string => {
	return JSON.stringify(
		toolCalls.map((toolCall) => ({
			name: toolCall.function.name,
			arguments: toolCall.function.parsedArguments ?? toolCall.function.arguments
		}))
	);
};

export const makeToolCallFingerprint = (toolCall: StreamedToolCall): string => {
	const args = toolCall.function.parsedArguments ?? toolCall.function.arguments;
	let normalizedArgs = '';

	if (typeof args === 'string') {
		normalizedArgs = args;
	} else {
		try {
			normalizedArgs = JSON.stringify(args);
		} catch {
			normalizedArgs = '';
		}
	}

	return `${toolCall.function.name}:${normalizedArgs}`;
};

export const createChatStream = (input: CreateChatStreamInput) => {
	return openRouter.chat.send(
		{
			chatRequest: {
				model: 'deepseek/deepseek-v3.2',
				messages: [
					{ role: 'system', content: input.systemPrompt.trim() },
					...input.history,
					{ role: 'user', content: input.message.trim() }
				],
				temperature: 0,
				...(input.allowTools === false ? {} : { tools: CHAT_TOOLS }),
				...(input.allowTools === false ? {} : { parallelToolCalls: true }),
				stream: true
			}
		},
		input.signal ? { signal: input.signal } : undefined
	);
};
