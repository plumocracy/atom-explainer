import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/tours/tours', () => ({
	getTourStep: vi.fn((tourId: string, stepId: string) =>
		tourId === 't1' && stepId === 's1'
			? { assistantMarkdown: 'prompt text', judge: { goal: 'goal text' } }
			: undefined
	)
}));

import { buildGuidedTourPrompt, buildSimulationContextPrompt } from './chat-prompt';

describe('chat-prompt helpers', () => {
	test('buildSimulationContextPrompt for bohr and orbital', () => {
		expect(
			buildSimulationContextPrompt({
				mode: 'bohr',
				values: { atomicNumber: 8, shellDistribution: [2, 6] }
			})
		).toContain('Bohr model view');
		expect(
			buildSimulationContextPrompt({
				mode: 'orbital',
				values: { n: 2, l: 1, m: 0, hidePositiveXYCrossSection: true }
			})
		).toContain('hidden');
	});

	test('buildGuidedTourPrompt returns empty when no step and populated text when found', () => {
		expect(buildGuidedTourPrompt()).toBe('');
		expect(
			buildGuidedTourPrompt({
				tourId: 'missing',
				stepId: 'x',
				attemptCount: 0,
				awaitingConfirmation: false
			})
		).toBe('');
		expect(
			buildGuidedTourPrompt({
				tourId: 't1',
				stepId: 's1',
				attemptCount: 0,
				awaitingConfirmation: false
			})
		).toContain('goal text');
	});
});
