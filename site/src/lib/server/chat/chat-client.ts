import { OpenRouter } from '@openrouter/sdk';
import { env } from '$env/dynamic/private';
import type { ConversationMessage } from '$lib/server/conversation';
import type { StreamedToolCall } from './chat-contract';
import { CHAT_TOOLS } from './chat-tools';

const openRouter = new OpenRouter({
	apiKey: env.OPENROUTER_API_KEY,
});

type CreateChatStreamInput = {
	systemPrompt: string;
	history: ConversationMessage[];
	message: string;
};

type CreateToolExplanationInput = {
	systemPrompt: string;
	history: ConversationMessage[];
	message: string;
	toolCalls: StreamedToolCall[];
};

type CreateAdditionalToolCallsInput = {
	systemPrompt: string;
	history: ConversationMessage[];
	message: string;
	toolCalls: StreamedToolCall[];
	maxRounds?: number;
};

type ToolExplanationResult = {
	content: string;
	usage: {
		promptTokens: number;
		completionTokens: number;
	};
};

const parseArgumentsText = (value: unknown): string => {
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

const parseArgumentsJson = (value: string): unknown | undefined => {
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

const collectToolCallsFromResponse = (response: unknown, indexOffset = 0): StreamedToolCall[] => {
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
				parsedArguments: parseArgumentsJson(argumentsText),
			},
		});
	}

	return parsed;
};

const summarizeToolCalls = (toolCalls: StreamedToolCall[]): string => {
	return JSON.stringify(
		toolCalls.map((toolCall) => ({
			name: toolCall.function.name,
			arguments: toolCall.function.parsedArguments ?? toolCall.function.arguments,
		}))
	);
};

const makeToolCallFingerprint = (toolCall: StreamedToolCall): string => {
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
	return openRouter.chat.send({
		chatRequest: {
			model: 'deepseek/deepseek-v3.2',
			messages: [
				{ role: 'system', content: input.systemPrompt.trim() },
				...input.history,
				{ role: 'user', content: input.message.trim() },
			],
			temperature: 0,
			tools: CHAT_TOOLS,
			stream: true,
		},
	});
};

export const createToolExplanation = async (
	input: CreateToolExplanationInput
): Promise<ToolExplanationResult> => {
	const toolSummary = input.toolCalls.map((toolCall) => ({
		name: toolCall.function.name,
		arguments: toolCall.function.parsedArguments ?? toolCall.function.arguments,
	}));

	const response = await openRouter.chat.send({
		chatRequest: {
			model: 'deepseek/deepseek-v3.2',
			messages: [
				{
					role: 'system',
					content:
						`${input.systemPrompt.trim()} ` +
						'Do not call tools in this response. ' +
						'Write 1-3 concise plain-English sentences explaining what changed and why.',
				},
				...input.history,
				{
					role: 'user',
					content: input.message.trim(),
				},
				{
					role: 'user',
					content: `Tool calls already executed for this turn: ${JSON.stringify(toolSummary)}. Respond to the user now.`,
				},
			],
			temperature: 0,
			stream: false,
		},
	});

	return {
		content: response.choices?.[0]?.message?.content?.trim() ?? '',
		usage: {
			promptTokens: response.usage?.promptTokens ?? 0,
			completionTokens: response.usage?.completionTokens ?? 0,
		},
	};
};

export const createAdditionalToolCalls = async (
	input: CreateAdditionalToolCallsInput
): Promise<StreamedToolCall[]> => {
	const rounds = Math.max(0, Math.min(input.maxRounds ?? 2, 4));
	let knownToolCalls = [...input.toolCalls];
	const knownFingerprints = new Set(knownToolCalls.map(makeToolCallFingerprint));

	for (let round = 0; round < rounds; round += 1) {
		const response = await openRouter.chat.send({
			chatRequest: {
				model: 'deepseek/deepseek-v3.2',
				messages: [
					{ role: 'system', content: input.systemPrompt.trim() },
					...input.history,
					{ role: 'user', content: input.message.trim() },
					{
						role: 'user',
						content:
							`Tool calls already executed for this turn: ${summarizeToolCalls(knownToolCalls)}. ` +
							'If any part of the user request remains, call all additional tools needed now. ' +
							'Do not repeat an already executed tool call with the same arguments. ' +
							'If no additional tools are needed, respond with plain text only and no tool calls.',
					},
				],
				temperature: 0,
				tools: CHAT_TOOLS,
				stream: false,
			},
		});

		const additionalRoundCalls = collectToolCallsFromResponse(response, knownToolCalls.length);
		if (!additionalRoundCalls.length) {
			break;
		}

		let didAdd = false;
		for (const toolCall of additionalRoundCalls) {
			const fingerprint = makeToolCallFingerprint(toolCall);
			if (knownFingerprints.has(fingerprint)) {
				continue;
			}

			knownFingerprints.add(fingerprint);
			knownToolCalls.push({
				...toolCall,
				index: knownToolCalls.length,
			});
			didAdd = true;
		}

		if (!didAdd) {
			break;
		}
	}

	return knownToolCalls.slice(input.toolCalls.length);
};
