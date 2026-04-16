import { OpenRouter } from "@openrouter/sdk";
import { env } from "$env/dynamic/private";

import * as z from "zod";

const openRouter = new OpenRouter({
	apiKey: env.OPENROUTER_API_KEY
});

export const SimulationValuesSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number()
})

export const ModelQuerySchema = z.object({
	message: z.string(),
	currentSimulationValues: SimulationValuesSchema
})

export const ModelResponseSchema = z.object({
	success: z.literal(true),
	params: SimulationValuesSchema,
	message: z.string(),
	inputTokens: z.number(),
	outputTokens: z.number(),
})

export const ModelErrorSchema = z.object({
	success: z.literal(false),
	error: z.string().optional(),
	missing: z.string().optional()
})

export const ChatResponseSchema = z.object({
	success: z.literal(true),
	newSimulationValues: SimulationValuesSchema,
	message: z.string(),
	role: z.enum(["user", "assistant"])
})

export const ChatErrorSchema = z.object({
	success: z.literal(false),
	error: z.string().optional(),
	missing: z.string().optional(),
	timeout: z.object({ reason: z.string(), until: z.date() }).optional()
})

export type ModelResponse = z.infer<typeof ModelResponseSchema>;
export type ModelError = z.infer<typeof ModelErrorSchema>;
export type ModelQuery = z.infer<typeof ModelQuerySchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type ChatError = z.infer<typeof ChatErrorSchema>;

// This is a basic model query that just gets a message in return.
export async function queryModel(query: ModelQuery): Promise<ModelResponse | ModelError> {

	if (!query.message) {
		return { success: false, missing: "No message sent" }
	}

	const { n, l, m } = query.currentSimulationValues;

	if (n === undefined || l == undefined || m == undefined) {
		return { success: false, missing: "No simulation values provided" }
	}

	const systemPrompt =
		"You are a physics professor with a specialty in the quantum model of atoms. " +
		"You will received a question from one of your students: " +
		"You are able to manipulate a 3d simulation of an atom by providing the n, l, and m values back to the student.  " +
		"Only change the simulation if there is real educational value to the change. When you do, be sure to mention it in your response. " +
		"Respond in the following JSON format { params: { n: number, l: number, m: number }, message: string } " +
		"If you do not change the simulation, return null for params. " +
		`The current simulation values are n: ${n}, l: ${l}, and m: ${m}. ` +
		"Respond plainly with no roleplay or story telling. Be incredibly factual. " +
		"The following question is provided by one of your students who is confused: ";


	try {
		const response = await openRouter.chat.send({
			chatRequest: {
				model: "deepseek/deepseek-v3.2",
				messages: [
					{ role: "system", content: systemPrompt.trim() },
					{ role: "user", content: query.message.trim() }
				],
				stream: false
			}
		});

		let json = JSON.parse(response.choices[0].message.content);

		let params = json.params;
		let message = json.message;

		let modelResponse: ModelResponse = {
			success: true,
			params: params,
			message: message,
			inputTokens: response.usage?.completionTokens as number,
			outputTokens: response.usage?.promptTokens as number,
		}

		return modelResponse;
	} catch (error) {
		if (error instanceof Error && 'statusCode' in error) {
			if (error.statusCode === 401) {
				return { success: false, error: "Invalid API Key" }
			} else if (error.statusCode === 429) {
				return { success: false, error: 'Rate limited - try again later' }
			} else if (error.statusCode === 503) {
				return { success: false, error: 'Model unavailable' }
			}
		} else {
			return { success: false, error: `Unexpected error: ${error}` }
		}
	}

	return { success: false, error: "An unknown error occured" }
}

