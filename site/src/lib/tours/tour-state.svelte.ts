export type GuidedTourStatus = 'idle' | 'running' | 'finished';

export const guidedTourState = $state<{
	status: GuidedTourStatus;
	activeTourId: string | null;
	activeStepId: string | null;
	attemptCount: number;
	awaitingConfirmation: boolean;
}>({
	status: 'idle',
	activeTourId: null,
	activeStepId: null,
	attemptCount: 0,
	awaitingConfirmation: false
});

export const resetGuidedTourState = (): void => {
	guidedTourState.status = 'idle';
	guidedTourState.activeTourId = null;
	guidedTourState.activeStepId = null;
	guidedTourState.attemptCount = 0;
	guidedTourState.awaitingConfirmation = false;
};
