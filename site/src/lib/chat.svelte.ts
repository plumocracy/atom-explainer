import { z } from 'zod';

export const SimulationValuesSchema = z.object({ n: z.number(), l: z.number(), m: z.number() });

export type Message = {
	id: number;
	role: 'user' | 'assistant';
	content: string;
	pending?: boolean,
	live?: boolean
	simValues?: { n: number, l: number, m: number }
};

export const simulationValues = $state({ n: 1, l: 0, m: 0 });

export const chatMessages = $state<Message[]>([]);
