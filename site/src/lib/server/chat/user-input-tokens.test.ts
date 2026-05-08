import { describe, expect, test } from 'vitest';
import { estimateTextTokens, estimateUserInputTokens } from './user-input-tokens';

describe('estimateUserInputTokens', () => {
	test('counts segmented tokens across words, numbers, punctuation', () => {
		expect(estimateUserInputTokens('')).toBe(0);
		expect(estimateUserInputTokens('Hi, atom 2!')).toBe(5);
	});

	test('exposes the same estimator for non-user prompt segments', () => {
		expect(estimateTextTokens('System prompt: be concise.')).toBe(6);
	});
});
