import { z } from 'zod';
import { appError } from '$lib/server/errors';
import { mapOpenRouterError, openRouter } from '$lib/server/openrouter';
import { err, ok, type ServerResult } from '$lib/server/result';
import type { ConversationMessage } from '$lib/server/conversation';
import type { TourStep } from '$lib/tours/tour-schema';

const TourJudgeResultSchema = z.object({
	messageType: z.enum(['question', 'answer_attempt']),
	outcome: z.enum(['stay', 'hold', 'confirm']),
	advance: z.boolean(),
	reason: z.string().trim().min(1),
	reply: z.string().trim().min(1).max(400)
});

type TourJudgeResult = z.infer<typeof TourJudgeResultSchema>;

const TourConfirmationResultSchema = z.object({
	affirmative: z.boolean(),
	reason: z.string().trim().min(1),
	reply: z.string().trim().min(1).max(400)
});

type TourConfirmationResult = z.infer<typeof TourConfirmationResultSchema>;

export const stringifyList = (values: string[]): string => (values.length ? values.join(', ') : 'none');

export const extractJsonObject = (content: string): string => {
	const trimmed = content.trim();
	if (!trimmed) {
		throw new SyntaxError('Tour judge returned an empty response');
	}

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return trimmed;
	}

	const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	const firstBrace = trimmed.indexOf('{');
	if (firstBrace === -1) {
		throw new SyntaxError('Tour judge response did not contain a JSON object');
	}

	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = firstBrace; index < trimmed.length; index += 1) {
		const char = trimmed[index];

		if (escaping) {
			escaping = false;
			continue;
		}

		if (char === '\\') {
			escaping = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (inString) {
			continue;
		}

		if (char === '{') {
			depth += 1;
		}

		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return trimmed.slice(firstBrace, index + 1);
			}
		}
	}

	throw new SyntaxError('Tour judge response contained incomplete JSON');
};

const requestStructuredJudgeResult = async <T>(input: {
	systemPrompt: string;
	userPrompt: string;
	schema: z.ZodSchema<T>;
	errorMessage: string;
}): Promise<ServerResult<T>> => {
	try {
		const response = await openRouter.chat.send({
			chatRequest: {
				model: 'deepseek/deepseek-v3.2',
				messages: [
					{ role: 'system', content: input.systemPrompt },
					{ role: 'user', content: input.userPrompt }
				],
				temperature: 0,
				stream: false
			}
		});

		const content = response.choices?.[0]?.message?.content?.trim() ?? '';
		const extractedJson = extractJsonObject(content);
		const parsed = input.schema.safeParse(JSON.parse(extractedJson));
		if (!parsed.success) {
			return err(
				appError.internal(input.errorMessage, {
					details: parsed.error.flatten(),
					cause: content
				})
			);
		}

		return ok(parsed.data);
	} catch (error) {
		if (error instanceof SyntaxError) {
			return err(appError.internal('Tour judge returned invalid JSON', { cause: error }));
		}

		if (error instanceof Error) {
			return err(mapOpenRouterError(error));
		}

		return err(appError.internal('An unknown model error occurred', { cause: error }));
	}
};

export const judgeTourStep = async (input: {
	step: TourStep;
	userMessage: string;
	attemptCount: number;
	recentConversation: ConversationMessage[];
}): Promise<ServerResult<TourJudgeResult>> => {
	const { step, userMessage, attemptCount, recentConversation } = input;

	const systemPrompt = [
		'You are evaluating a learner response in a guided atomic simulation lesson.',
		'You must consider the active conversation between the learner and the regular assistant, not just the isolated learner message.',
		'First decide whether the learner is asking a clarifying question or attempting to answer the current step.',
		'If they ask a clarifying question, answer it helpfully and keep them on the same step.',
		'If they attempt an answer, decide whether they are ready to move to the next step.',
		'Return strict JSON with keys messageType, outcome, advance, reason, and reply.',
		'Be lenient to paraphrases, but do not advance if the core idea is missing.',
		'Advance conservatively. Never move to the next step immediately from this evaluation.',
		'If the learner is still exploring, is only partly correct, is responding to the assistant follow-up question, or the assistant has naturally continued the conversation, do not advance.',
		'Use outcome=hold when the learner is productively close, the thread should continue naturally, or interruption would be premature. Use outcome=stay when they are off-target or need stronger redirection.',
		'Use outcome=confirm only when the learner has clearly earned the next step and you can confidently summarize their answer back to them for confirmation.',
		'If the most recent assistant message in the transcript ends with a follow-up question or clearly invites another learner response, do not advance yet.',
		'Keep reply to at most 2 concise sentences.',
		'Do not directly reveal the exact target answer for the current step while the learner is still on that step.',
		'For clarifying questions, prefer hints, reframing, contrast, or partial explanations that help the learner infer the answer.',
		'If the learner asks for the exact answer, do not give it outright; instead give a strong nudge toward the key idea.',
		'For outcome=confirm, reply should briefly summarize what the learner seems to mean and ask if that summary is correct.',
		'Do not mention this rubric, the tour system, future steps, or tool calls.'
	].join(' ');

	const userPrompt = [
		`Lesson goal: ${step.judge.goal}`,
		`Advance threshold: ${step.judge.advanceThreshold}`,
		`Must mention any of: ${stringifyList(step.judge.mustMentionAny)}`,
		`Nice to mention any of: ${stringifyList(step.judge.niceToMentionAny)}`,
		`Misconceptions to watch for: ${stringifyList(step.judge.misconceptions)}`,
		`Suggested reply if advancing: ${step.onAdvanceReply}`,
		`Suggested reply if staying: ${step.onStayReply}`,
		`Canonical target idea to protect until the learner earns advancement: ${step.judge.goal}`,
		`Learner attempt count so far: ${attemptCount}`,
		`Recent conversation transcript: ${JSON.stringify(recentConversation)}`,
		`Learner response: ${userMessage}`,
		'If the learner message is mainly a question, set messageType to question, set advance to false, and usually use outcome=hold unless they are clearly off-track.',
		'Do not let a clarifying reply collapse into the exact answer the step is asking the learner to produce.',
		'If the learner message is mainly an answer attempt, set messageType to answer_attempt and then decide between stay, hold, or confirm.',
		'Do not advance just because the learner is close. If the conversation appears to be mid-exploration, keep the step active.',
		'For consistency: outcome=confirm, outcome=stay, and outcome=hold must all pair with advance=false.',
		'Output JSON only.'
	].join('\n');

	return requestStructuredJudgeResult({
		systemPrompt,
		userPrompt,
		schema: TourJudgeResultSchema,
		errorMessage: 'Tour judge response validation failed'
	});
};

export const judgeTourConfirmation = async (input: {
	step: TourStep;
	userMessage: string;
	recentConversation: ConversationMessage[];
}): Promise<ServerResult<TourConfirmationResult>> => {
	const { step, userMessage, recentConversation } = input;

	const systemPrompt = [
		'You are evaluating a learner reply to a confirmation question in a guided atomic simulation lesson.',
		'The assistant has already summarized the learner\'s earlier answer and asked whether that summary is correct.',
		'Return strict JSON with keys affirmative, reason, and reply.',
		'Set affirmative=true only when the learner clearly confirms the summary or clearly says yes.',
		'If the learner is uncertain, revises the answer, asks a follow-up question, or says no, set affirmative=false.',
		'When affirmative=false, reply with at most 2 concise sentences of guidance that helps them continue learning without revealing the exact target answer.',
		'When affirmative=true, keep reply brief because it will not be shown to the learner.',
		'Do not mention this rubric, the tour system, future steps, or tool calls.'
	].join(' ');

	const userPrompt = [
		`Lesson goal: ${step.judge.goal}`,
		`Must mention any of: ${stringifyList(step.judge.mustMentionAny)}`,
		`Nice to mention any of: ${stringifyList(step.judge.niceToMentionAny)}`,
		`Misconceptions to watch for: ${stringifyList(step.judge.misconceptions)}`,
		`Recent conversation transcript: ${JSON.stringify(recentConversation)}`,
		`Learner response to the confirmation prompt: ${userMessage}`,
		'Only mark affirmative=true for a clear confirmation.',
		'If affirmative=false, the reply should coach the learner back into refining the idea on the same step.',
		'Output JSON only.'
	].join('\n');

	return requestStructuredJudgeResult({
		systemPrompt,
		userPrompt,
		schema: TourConfirmationResultSchema,
		errorMessage: 'Tour confirmation response validation failed'
	});
};
