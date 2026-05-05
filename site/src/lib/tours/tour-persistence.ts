import { z } from 'zod';

export const PersistedTourStateSchema = z.object({
	kind: z.literal('guided_tour_state'),
	status: z.enum(['running', 'stopped', 'finished']),
	tourId: z.string().trim().min(1),
	stepId: z.string().trim().min(1).nullable(),
	attemptCount: z.number().int().min(0).default(0),
	awaitingConfirmation: z.boolean().default(false)
});

export type PersistedTourState = z.infer<typeof PersistedTourStateSchema>;

export const stringifyPersistedTourState = (state: PersistedTourState): string =>
	JSON.stringify(state);

export const parsePersistedTourState = (
	value: string | null | undefined
): PersistedTourState | null => {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(value);
		const result = PersistedTourStateSchema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
};
