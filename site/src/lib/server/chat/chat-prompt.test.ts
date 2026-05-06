import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/tours/tours', () => ({
	getTourStep: vi.fn((tourId: string, stepId: string) =>
		tourId === 't1' && stepId === 's1'
			? { assistantMarkdown: 'prompt text', judge: { goal: 'goal text' } }
			: undefined
	)
}));

import {
	buildGuidedTourPrompt,
	buildSimulationContextPrompt,
	buildSystemPrompt
} from './chat-prompt';

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
		expect(
			buildSimulationContextPrompt({
				mode: 'orbital',
				values: { n: 2, l: 1, m: 0, hidePositiveXYCrossSection: true }
			})
		).toContain('probability current');
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

	test('buildSystemPrompt only includes first-time standing-wave explanation when needed', () => {
		const simulation = {
			mode: 'orbital' as const,
			values: { n: 2, l: 1, m: 0, hidePositiveXYCrossSection: false }
		};

		expect(buildSystemPrompt(simulation, false)).toContain(
			'The first time you use insert_standing_wave_visualization'
		);
		expect(buildSystemPrompt(simulation, true)).toContain('do not repeat the UI explanation');
	});
});
