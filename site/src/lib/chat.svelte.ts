import { z } from 'zod';

export const SimulationValuesSchema = z.object({ n: z.number(), l: z.number(), m: z.number() });

export type SimulationValues = z.infer<typeof SimulationValuesSchema>;

export const CameraTargetSchema = z.object({
	x: z.number(),
	y: z.number(),
	z: z.number(),
	durationMs: z.number().positive().max(10_000).optional(),
});

export type CameraTarget = z.infer<typeof CameraTargetSchema>;

export type CameraMoveRequest = CameraTarget & {
	id: number;
};

export type ToolCallMessage = {
	toolName: string;
	providerCallId?: string | null;
	callIndex?: number;
	argumentsRaw?: string;
	argumentsJson?: unknown;
	simulationValues?: SimulationValues;
	cameraTarget?: CameraTarget;
};

export type Message = {
	id: number;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	pending?: boolean,
	live?: boolean
	simValues?: SimulationValues
	toolCall?: ToolCallMessage;
};

export const simulationValues = $state({ n: 1, l: 0, m: 0 });
export const orbitalCameraState = $state<{ moveRequest: CameraMoveRequest | null }>({
	moveRequest: null,
});

export const chatMessages = $state<Message[]>([]);

let nextMessageId = 0;
let nextCameraMoveRequestId = 0;

export const createChatMessage = (message: Omit<Message, 'id'>): Message => ({
	id: nextMessageId++,
	...message,
});

export const queueOrbitalCameraMove = (target: CameraTarget): void => {
	orbitalCameraState.moveRequest = {
		id: ++nextCameraMoveRequestId,
		...target,
	};
};
