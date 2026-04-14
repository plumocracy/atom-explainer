import { OpenRouter } from "@openrouter/sdk";
import { env } from "$env/dynamic/private";

import * as z from "zod";

const openRouter = new OpenRouter({
	apiKey: env.OPENROUTER_API_KEY
});

export type ModelQuery = {
	message: string
	currentSimulationValues: { n: number, l: number, m: number }
}

export const ModelResponseSchema = z.object({
	n: z.number(),
	l: z.number(),
	m: z.number(),
	message: z.string(),
})

export type ModelResponse = z.infer<typeof ModelResponseSchema> | { error: string };

// This is a basic model query that just gets a message in return.
export async function queryModel(query: ModelQuery): Promise<ModelResponse> {

	if (!query.message) {
		return { error: "No message sent" }
	}

	const { n, l, m } = query.currentSimulationValues;

	if (n === undefined || l == undefined || m == undefined) {
		return { error: "No simulation values provided" }
	}

	const systemPrompt =
		"You are a physics professor with a specialty in the quantum model of atoms. " +
		"Respond plainly with no roleplay or story telling. Be incredibly factual. " +
		"You are able to manipulate a 3d simulation of an atom by providing the n, l, and m values back to the student.  " +
		"Only change the simulation if there is real educational value to the change. When you do, be sure to mention it in your response. " +
		"Respond in the following JSON format { n: number, l: number, m: number, message: string } " +
		"If you do not change the simulation, put a 0 in the n, l, and m fields. " +
		`The current simulation values are n: ${n}, l: ${l}, and m: ${m}. ` +
		"The following question is provided by one of your students who is confused: ";

	let result;

	try {
		result = await openRouter.callModel({
			model: "deepseek/deepseek-v3.2",
			instructions: systemPrompt,
			temperature: 0,
			maxOutputTokens: 1000,
			input: query.message.trim()
		}).getText()
	} catch (error) {
		if (error instanceof Error && 'statusCode' in error) {
			if (error.statusCode === 401) {
				return { error: "Invaid API Key" }
			} else if (error.statusCode === 429) {
				return { error: 'Rate limited - try again later' }
			} else if (error.statusCode === 503) {
				return { error: 'Model unavailable' }
			}
		} else {
			return { error: `Unexpected error: ${error}` }
		}
	}

	try {
		const parsedResult = ModelResponseSchema.parse(result);
		return parsedResult;
	} catch (error) {
		return { error: `Error Parsing Result: ${error}` }
	}
}

