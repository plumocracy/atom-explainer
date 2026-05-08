import { OpenRouter } from '@openrouter/sdk';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { appError } from './errors';
import { err, ok, type ServerResult } from './result';

export const openRouter = new OpenRouter({
	apiKey: env.OPENROUTER_API_KEY,
});

export const SimulationValuesSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number(),
});

export const ModelQuerySchema = z.object({
	message: z.string(),
	currentSimulationValues: SimulationValuesSchema,
});

export const ModelResponseSchema = z.object({
	success: z.literal(true),
	params: SimulationValuesSchema,
	message: z.string(),
	inputTokens: z.number(),
	outputTokens: z.number(),
});

export type ModelResponse = z.infer<typeof ModelResponseSchema>;
export type ModelQuery = z.infer<typeof ModelQuerySchema>;

type OpenRouterErrorWithStatus = Error & { statusCode?: number };

export const mapOpenRouterError = (error: OpenRouterErrorWithStatus) => {
	if (error.statusCode === 401) {
		return appError.unauthorized('Invalid API key');
	}

	if (error.statusCode === 429) {
		return appError.rateLimited('Rate limited - try again later');
	}

	if (error.statusCode === 503) {
		return appError.internal('Model unavailable', { cause: error });
	}

	return appError.internal('Unexpected model error', { cause: error });
};

export async function queryModel(query: ModelQuery): Promise<ServerResult<ModelResponse>> {
	const parsedQuery = ModelQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return err(appError.badRequest('Invalid model query', parsedQuery.error.flatten()));
	}

	const { message, currentSimulationValues } = parsedQuery.data;
	const { n, l, m } = currentSimulationValues;

	const systemPrompt =
		'You are a physics professor with a specialty in the quantum model of atoms. ' +
		'You will received a question from one of your students: ' +
		'You are able to manipulate a 3d simulation of an atom by providing the n, l, and m values back to the student.  ' +
		'Only change the simulation if there is real educational value to the change. When you do, be sure to mention it in your response. ' +
		'Respond in the following JSON format { params: { n: number, l: number, m: number }, message: string } ' +
		'If you do not change the simulation, return null for params. ' +
		`The current simulation values are n: ${n}, l: ${l}, and m: ${m}. ` +
		'Respond plainly with no roleplay or story telling. Be incredibly factual. ' +
		'The following question is provided by one of your students who is confused: ';

	try {
		const response = await openRouter.chat.send({
			chatRequest: {
				model: 'deepseek/deepseek-v3.2',
				messages: [
					{ role: 'system', content: systemPrompt.trim() },
					{ role: 'user', content: message.trim() },
				],
				stream: false,
			},
		});

		const parsedJson = JSON.parse(response.choices[0].message.content ?? '{}') as {
			params: { n: number; l: number; m: number };
			message: string;
		};

		const modelResponse: ModelResponse = {
			success: true,
			params: parsedJson.params,
			message: parsedJson.message,
			inputTokens: response.usage?.completionTokens ?? 0,
			outputTokens: response.usage?.promptTokens ?? 0,
		};

		const validatedResponse = ModelResponseSchema.safeParse(modelResponse);
		if (!validatedResponse.success) {
			return err(appError.internal('Model response validation failed', { details: validatedResponse.error.flatten() }));
		}

		return ok(validatedResponse.data);
	} catch (error) {
		if (error instanceof Error) {
			return err(mapOpenRouterError(error));
		}

		return err(appError.internal('An unknown model error occurred', { cause: error }));
	}
}
