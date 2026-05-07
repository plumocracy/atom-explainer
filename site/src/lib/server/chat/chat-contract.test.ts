import { describe, expect, test } from 'vitest';
import { MessageFeedbackRequestSchema } from './chat-contract';

describe('MessageFeedbackRequestSchema', () => {
	test('accepts valid assistant message feedback payloads', () => {
		const parsed = MessageFeedbackRequestSchema.safeParse({
			messageId: '123e4567-e89b-12d3-a456-426614174000',
			preference: 'up',
			correctness: 5,
			tone: 4,
			understandability: 5,
			explanation: 'Very clear.'
		});

		expect(parsed.success).toBe(true);
	});

	test('rejects out-of-range scores', () => {
		const parsed = MessageFeedbackRequestSchema.safeParse({
			messageId: '123e4567-e89b-12d3-a456-426614174000',
			preference: 'down',
			correctness: 0,
			tone: 6,
			understandability: 3
		});

		expect(parsed.success).toBe(false);
	});
});
