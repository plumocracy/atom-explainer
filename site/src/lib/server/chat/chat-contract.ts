import { z } from 'zod';
import type { PublicAppError } from '$lib/types/app-error';
import type { TourStep } from '$lib/tours/tour-schema';

export const OrbitalSimulationValuesSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number(),
	hidePositiveXYCrossSection: z.boolean()
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

export const GuidedTourContextSchema = z.object({
	tourId: z.string().trim().min(1),
	stepId: z.string().trim().min(1),
	attemptCount: z.number().int().min(0),
	awaitingConfirmation: z.boolean().default(false)
});

export const ChatSurfaceSchema = z.enum(['orbital_page', 'dashboard']);
export const ChatStarterModeSchema = z.enum(['assistant_intro']);

export const ChatRequestSchema = z.object({
	message: z.string().trim().min(1),
	conversationId: z.string().uuid().optional(),
	surface: ChatSurfaceSchema.default('orbital_page'),
	starterMode: ChatStarterModeSchema.optional(),
	simulation: ChatSimulationContextSchema,
	guidedTour: GuidedTourContextSchema.optional()
});

export const MessageFeedbackRequestSchema = z.object({
	messageId: z.string().uuid(),
	preference: z.enum(['up', 'down']),
	correctness: z.number().int().min(1).max(5),
	tone: z.number().int().min(1).max(5),
	understandability: z.number().int().min(1).max(5),
	explanation: z.string().trim().max(4000).optional().transform((value) => value || undefined)
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type MessageFeedbackRequest = z.infer<typeof MessageFeedbackRequestSchema>;
export type OrbitalSimulationValues = z.infer<typeof OrbitalSimulationValuesSchema>;
export type BohrSimulationValues = z.infer<typeof BohrSimulationValuesSchema>;
export type ChatSimulationContext = z.infer<typeof ChatSimulationContextSchema>;
export type GuidedTourContext = z.infer<typeof GuidedTourContextSchema>;
export type ChatSurface = z.infer<typeof ChatSurfaceSchema>;
export type ChatStarterMode = z.infer<typeof ChatStarterModeSchema>;

export type TourSsePayload =
	| {
			type: 'stay';
			messageType: 'question' | 'answer_attempt';
	  }
	| {
			type: 'hold';
			messageType: 'question' | 'answer_attempt';
	  }
	| {
			type: 'message';
			message: string;
			awaitingConfirmation: boolean;
	  }
	| {
			type: 'advance';
			step: TourStep;
	  }
	| {
			type: 'finish';
			message: string;
	  };

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
	| { tour: TourSsePayload }
	| { error: PublicAppError }
	| { done: true; assistantMessageId?: string };

export const CHAT_STREAM_HEADERS: Record<string, string> = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	Connection: 'keep-alive'
};

export const encodeSse = (payload: ChatSsePayload): string =>
	`data: ${JSON.stringify(payload)}\n\n`;
