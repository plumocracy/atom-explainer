import { describe, expect, test } from 'vitest';
import { guidedTourState, resetGuidedTourState } from './tour-state.svelte';

describe('tour state', () => {
	test('resetGuidedTourState returns to idle defaults', () => {
		guidedTourState.status = 'running';
		guidedTourState.activeTourId = 't1';
		guidedTourState.activeStepId = 's1';
		guidedTourState.attemptCount = 2;
		guidedTourState.awaitingConfirmation = true;
		resetGuidedTourState();
		expect(guidedTourState).toMatchObject({
			status: 'idle',
			activeTourId: null,
			activeStepId: null,
			attemptCount: 0,
			awaitingConfirmation: false
		});
	});
});
