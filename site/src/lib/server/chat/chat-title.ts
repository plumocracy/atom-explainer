import { appError } from '$lib/server/errors';
import { openRouter } from '$lib/server/openrouter';
import { err, ok, type ServerResult } from '$lib/server/result';

export const normalizeTitle = (value: string): string => {
	const normalized = value.trim().replace(/^['"`]+|['"`]+$/g, '');
	return normalized.replace(/\s+/g, ' ').slice(0, 80).trim();
};

export const generateConversationTitle = async (message: string): Promise<ServerResult<string>> => {
	try {
		const response = await openRouter.chat.send({
			chatRequest: {
				model: 'openai/gpt-oss-120b',
				messages: [
					{
						role: 'system',
						content:
							'Generate a concise conversation title from the first user message. ' +
							'Return only the title text with no quotes, markdown, labels, or extra explanation. ' +
							'Use 2 to 6 words when possible.'
					},
					{ role: 'user', content: message.trim() }
				],
				temperature: 0,
				stream: false
			}
		});

		const title = normalizeTitle(response.choices?.[0]?.message?.content ?? '');
		if (!title) {
			return err(appError.internal('Generated title was empty'));
		}

		return ok(title);
	} catch (error) {
		return err(appError.internal('Could not generate conversation title', { cause: error }));
	}
};
