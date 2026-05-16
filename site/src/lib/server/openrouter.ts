import { OpenRouter } from '@openrouter/sdk';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { appError } from './errors';
import { err, ok, type ServerResult } from './result';
import { retryAsync } from './retry';

export const openRouter = new OpenRouter({
	apiKey: env.OPENROUTER_API_KEY
});

export const SimulationValuesSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number()
});

export const ModelQuerySchema = z.object({
	message: z.string(),
	currentSimulationValues: SimulationValuesSchema
});

export const ModelResponseSchema = z.object({
	success: z.literal(true),
	params: SimulationValuesSchema,
	message: z.string(),
	inputTokens: z.number(),
	outputTokens: z.number()
});

export type ModelResponse = z.infer<typeof ModelResponseSchema>;
export type ModelQuery = z.infer<typeof ModelQuerySchema>;

type OpenRouterErrorWithStatus = Error & { statusCode?: number; status?: number };
type SendOpenRouterOptions = Parameters<typeof openRouter.chat.send>[1] & { attempts?: number };

const TRANSIENT_OPENROUTER_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export const getOpenRouterStatus = (error: unknown): number | undefined => {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const maybeError = error as OpenRouterErrorWithStatus;
	return maybeError.statusCode ?? maybeError.status;
};

export const isRetryableOpenRouterError = (error: unknown): boolean => {
	const status = getOpenRouterStatus(error);
	return typeof status === 'number' && TRANSIENT_OPENROUTER_STATUSES.has(status);
};

export const mapOpenRouterError = (error: OpenRouterErrorWithStatus) => {
	const status = getOpenRouterStatus(error);
	if (status === 401) {
		return appError.unauthorized('The model provider rejected the API key.');
	}

	if (status === 429) {
		return appError.rateLimited('The model provider is rate limited. Please try again shortly.');
	}

	if (status === 408 || status === 504) {
		return appError.internal('The model provider timed out. Please try again.', { cause: error });
	}

	if (status === 502 || status === 503) {
		return appError.internal('The model provider is temporarily unavailable. Please try again.', {
			cause: error
		});
	}

	return appError.internal('Unexpected model error', { cause: error });
};

export const sendOpenRouterChat = <T>(
	request: Parameters<typeof openRouter.chat.send>[0],
	options?: SendOpenRouterOptions
): Promise<T> => {
	const { attempts, ...requestOptions } = options ?? {};
	return retryAsync(() => openRouter.chat.send(request, requestOptions) as Promise<T>, {
		attempts,
		signal: requestOptions.signal ?? undefined,
		shouldRetry: isRetryableOpenRouterError
	});
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
		const response = await sendOpenRouterChat<{
			choices: Array<{ message: { content?: string | null } }>;
			usage?: { completionTokens?: number; promptTokens?: number };
		}>({
			chatRequest: {
				model: 'deepseek/deepseek-v3.2',
				messages: [
					{ role: 'system', content: systemPrompt.trim() },
					{ role: 'user', content: message.trim() }
				],
				stream: false
			}
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
			outputTokens: response.usage?.promptTokens ?? 0
		};

		const validatedResponse = ModelResponseSchema.safeParse(modelResponse);
		if (!validatedResponse.success) {
			return err(
				appError.internal('Model response validation failed', {
					details: validatedResponse.error.flatten()
				})
			);
		}

		return ok(validatedResponse.data);
	} catch (error) {
		if (error instanceof Error) {
			return err(mapOpenRouterError(error));
		}

		return err(appError.internal('An unknown model error occurred', { cause: error }));
	}
}
