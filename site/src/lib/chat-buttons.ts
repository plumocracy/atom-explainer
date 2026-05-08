import { z } from 'zod';

export const ButtonSimulationValuesSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number()
});

export const ButtonToggleSchema = z.discriminatedUnion('toggleType', [
	z.object({
		toggleType: z.literal('positive_xy_cross_section'),
		labelWhenVisible: z.string().trim().min(1).max(40),
		labelWhenHidden: z.string().trim().min(1).max(40)
	}),
	z.object({
		toggleType: z.literal('visualization_mode'),
		labelWhenOrbital: z.string().trim().min(1).max(40),
		labelWhenBohr: z.string().trim().min(1).max(40)
	})
]);

export const ChatButtonSchema = z
	.object({
		label: z.string().trim().min(1).max(40).optional(),
		simulationValues: ButtonSimulationValuesSchema.optional(),
		toggleButton: ButtonToggleSchema.optional(),
		visualizationMode: z.enum(['orbital', 'bohr']).optional()
	})
	.refine(
		(button) =>
			Boolean(button.simulationValues || button.toggleButton || button.visualizationMode) &&
			(button.toggleButton || button.label),
		{
			message: 'A button must define at least one action'
		}
	);

export const CreateButtonArgumentsSchema = z.object({
	buttons: z
		.array(
			z.object({
				label: z.string().trim().min(1).max(40),
				simulationValues: ButtonSimulationValuesSchema.optional()
			})
		)
		.min(1)
		.max(4)
});

const SingleCreateButtonArgumentsSchema = z.object({
	label: z.string().trim().min(1).max(40),
	simulationValues: ButtonSimulationValuesSchema.optional()
});

export const CreateToggleButtonArgumentsSchema = z.discriminatedUnion('toggleType', [
	z.object({
		toggleType: z.literal('positive_xy_cross_section'),
		labelWhenVisible: z.string().trim().min(1).max(40).default('Hide +X/+Y cross section'),
		labelWhenHidden: z.string().trim().min(1).max(40).default('Show +X/+Y cross section')
	}),
	z.object({
		toggleType: z.literal('visualization_mode'),
		labelWhenOrbital: z.string().trim().min(1).max(40).default('Switch to Bohr view'),
		labelWhenBohr: z.string().trim().min(1).max(40).default('Switch to Orbital view')
	})
]);

const LegacyCreateButtonArgumentsSchema = z.object({
	buttons: z
		.array(
			z.object({
				label: z.string().trim().min(1).max(40),
				visualizationMode: z.enum(['orbital', 'bohr']).optional(),
				simulationValues: ButtonSimulationValuesSchema.optional()
			})
		)
		.min(1)
		.max(4)
});

const LegacyCrossSectionToggleButtonArgumentsSchema = z.object({
	labelWhenVisible: z.string().trim().min(1).max(40).default('Hide +X/+Y cross section'),
	labelWhenHidden: z.string().trim().min(1).max(40).default('Show +X/+Y cross section')
});

export type ChatButton = z.infer<typeof ChatButtonSchema>;

const parseToolArguments = (argumentsJson: unknown, argumentsRaw: string): unknown => {
	if (typeof argumentsJson === 'object' && argumentsJson !== null) {
		return argumentsJson;
	}

	if (!argumentsRaw) {
		return null;
	}

	try {
		return JSON.parse(argumentsRaw);
	} catch {
		return null;
	}
};

export const parseCreateButtons = (
	toolName: string,
	argumentsJson: unknown,
	argumentsRaw: string
): ChatButton[] | undefined => {
	const parsed = parseToolArguments(argumentsJson, argumentsRaw);

	if (toolName === 'create_button') {
		const result = CreateButtonArgumentsSchema.safeParse(parsed);
		if (result.success) {
			return result.data.buttons;
		}

		const legacyResult = LegacyCreateButtonArgumentsSchema.safeParse(parsed);
		if (legacyResult.success) {
			return legacyResult.data.buttons;
		}

		const singleResult = SingleCreateButtonArgumentsSchema.safeParse(parsed);
		return singleResult.success ? [singleResult.data] : undefined;
	}

	if (toolName === 'create_toggle_button') {
		const result = CreateToggleButtonArgumentsSchema.safeParse(parsed);
		if (!result.success) {
			return undefined;
		}

		return [{ toggleButton: result.data }];
	}

	if (toolName === 'create_cross_section_toggle_button') {
		const result = LegacyCrossSectionToggleButtonArgumentsSchema.safeParse(parsed);
		if (!result.success) {
			return undefined;
		}

		return [
			{
				toggleButton: {
					toggleType: 'positive_xy_cross_section',
					labelWhenVisible: result.data.labelWhenVisible,
					labelWhenHidden: result.data.labelWhenHidden
				}
			}
		];
	}

	return undefined;
};
