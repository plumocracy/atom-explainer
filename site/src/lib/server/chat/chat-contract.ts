import { z } from 'zod';
import type { PublicAppError } from '$lib/types/app-error';

export const ChatRequestSchema = z.object({
	message: z.string().trim().min(1),
	values: z.object({
		n: z.number(),
		l: z.number(),
		m: z.number(),
	}),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatSimulationValues = ChatRequest['values'];

export type StreamedToolCall = {
	id?: string;
	index: number;
	type: 'function';
	function: {
		name: string;
		arguments: string;
		parsedArguments?: unknown;
	};
};

export type ChatSsePayload =
	| { token: string }
	| { toolStatus: 'calling' | 'done' }
	| { tools: StreamedToolCall[] }
	| { error: PublicAppError }
	| { done: true };

export const CHAT_STREAM_HEADERS: Record<string, string> = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	Connection: 'keep-alive',
};

export const encodeSse = (payload: ChatSsePayload): string => `data: ${JSON.stringify(payload)}\n\n`;
