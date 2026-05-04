import { z } from 'zod';

export const SimulationValuesSchema = z.object({ n: z.number(), l: z.number(), m: z.number() });

export type SimulationValues = z.infer<typeof SimulationValuesSchema>;
export type VisualizationMode = 'orbital' | 'bohr';

const BOHR_SHELL_CAPACITIES = [2, 8, 18, 32, 50] as const;

export const getBohrShellDistribution = (atomicNumber: number): number[] => {
	let remaining = Math.max(0, atomicNumber);
	const shells: number[] = [];

	for (const capacity of BOHR_SHELL_CAPACITIES) {
		if (remaining <= 0) {
			break;
		}

		const shellElectrons = Math.min(remaining, capacity);
		shells.push(shellElectrons);
		remaining -= shellElectrons;
	}

	return shells;
};

export const CameraTargetSchema = z.object({
	x: z.number(),
	y: z.number(),
	z: z.number(),
	durationMs: z.number().positive().max(10_000).optional()
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
	pending?: boolean;
	live?: boolean;
	simValues?: SimulationValues;
	toolCall?: ToolCallMessage;
};

export const simulationValues = $state({ n: 1, l: 0, m: 0 });
export const bohrSimulationValues = $state({ atomicNumber: 8 });
export const visualizationState = $state<{ mode: VisualizationMode }>({ mode: 'orbital' });
export const orbitalCameraState = $state<{ moveRequest: CameraMoveRequest | null }>({
	moveRequest: null
});

export const chatMessages = $state<Message[]>([]);

let nextMessageId = 0;
let nextCameraMoveRequestId = 0;

export const createChatMessage = (message: Omit<Message, 'id'>): Message => ({
	id: nextMessageId++,
	...message
});

export const queueOrbitalCameraMove = (target: CameraTarget): void => {
	orbitalCameraState.moveRequest = {
		id: ++nextCameraMoveRequestId,
		...target
	};
};
