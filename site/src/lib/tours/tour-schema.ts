import { z } from 'zod';

export const TourActionSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('set_visualization_mode'),
		mode: z.enum(['orbital', 'bohr'])
	}),
	z.object({
		type: z.literal('set_orbital_params'),
		n: z.number().int().min(1).max(8),
		l: z.number().int().min(0).max(7),
		m: z.number().int().min(-7).max(7)
	}),
	z.object({
		type: z.literal('move_camera_to_point'),
		x: z.number(),
		y: z.number(),
		z: z.number(),
		durationMs: z.number().positive().max(10_000).optional()
	}),
	z.object({
		type: z.literal('set_cross_section_hidden'),
		hidden: z.boolean()
	}),
	z.object({
		type: z.literal('set_bohr_atomic_number'),
		atomicNumber: z.number().int().min(1).max(20)
	})
]);

export const TourJudgeConfigSchema = z.object({
	goal: z.string().trim().min(1),
	mustMentionAny: z.array(z.string().trim().min(1)).max(10).default([]),
	niceToMentionAny: z.array(z.string().trim().min(1)).max(10).default([]),
	misconceptions: z.array(z.string().trim().min(1)).max(10).default([]),
	advanceThreshold: z.enum(['lenient', 'medium', 'strict']).default('medium')
});

export const TourStepSchema = z.object({
	id: z.string().trim().min(1),
	assistantMarkdown: z.string().trim().min(1),
	actions: z.array(TourActionSchema).default([]),
	judge: TourJudgeConfigSchema,
	onAdvanceReply: z.string().trim().min(1),
	onStayReply: z.string().trim().min(1),
	nextStepId: z.string().trim().min(1).nullable()
});

export const TourSchema = z.object({
	id: z.string().trim().min(1),
	title: z.string().trim().min(1),
	description: z.string().trim().min(1),
	steps: z.array(TourStepSchema).min(1)
});

export type TourAction = z.infer<typeof TourActionSchema>;
export type TourJudgeConfig = z.infer<typeof TourJudgeConfigSchema>;
export type TourStep = z.infer<typeof TourStepSchema>;
export type Tour = z.infer<typeof TourSchema>;
