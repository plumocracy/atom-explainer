import { z } from 'zod';
import type { PublicAppError } from '$lib/types/app-error';

export const OrbitalSimulationValuesSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number()
});

export const BohrSimulationValuesSchema = z.object({
	atomicNumber: z.number().int().min(1),
	shellDistribution: z.array(z.number().int().min(0))
});

export const ChatSimulationContextSchema = z.discriminatedUnion('mode', [
	z.object({
		mode: z.literal('orbital'),
		values: OrbitalSimulationValuesSchema
	}),
	z.object({
		mode: z.literal('bohr'),
		values: BohrSimulationValuesSchema
	})
]);

export const ChatRequestSchema = z.object({
	message: z.string().trim().min(1),
	simulation: ChatSimulationContextSchema
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type OrbitalSimulationValues = z.infer<typeof OrbitalSimulationValuesSchema>;
export type BohrSimulationValues = z.infer<typeof BohrSimulationValuesSchema>;
export type ChatSimulationContext = z.infer<typeof ChatSimulationContextSchema>;

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
	Connection: 'keep-alive'
};

export const encodeSse = (payload: ChatSsePayload): string =>
	`data: ${JSON.stringify(payload)}\n\n`;
