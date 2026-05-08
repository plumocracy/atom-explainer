import { showErrorToast } from '$lib/toast.svelte';
import { chatMessages, createChatMessage, type Message } from '$lib/chat.svelte';
import type { TourSsePayload } from '$lib/server/chat/chat-contract';
import { guidedTourState, resetGuidedTourState } from './tour-state.svelte';
import { applyTourActions } from './tour-actions';
import { getTourStep } from './tours';

export const animateAssistantMessage = (content: string): Message => {
	return createChatMessage({
		role: 'assistant',
		content,
		live: true,
		pending: true,
		autoFinishPending: true
	});
};

export const appendStep = (tourId: string, stepId: string): void => {
	const step = getTourStep(tourId, stepId);
	if (!step) {
		throw new Error(`Could not find step ${stepId} in tour ${tourId}`);
	}

	guidedTourState.activeStepId = step.id;
	guidedTourState.attemptCount = 0;
	guidedTourState.awaitingConfirmation = false;

	const assistantMessage = animateAssistantMessage(step.assistantMarkdown);
	assistantMessage.toolCalls = applyTourActions(step.actions);
	chatMessages.push(assistantMessage);
};

export const appendTourMessage = (content: string): void => {
	chatMessages.push(animateAssistantMessage(content));
};

const isStartTourPayload = (payload: unknown): payload is { success: true; step: { id: string } } => {
	if (typeof payload !== 'object' || payload === null || !('success' in payload) || !('step' in payload)) {
		return false;
	}

	const { success, step } = payload as { success?: unknown; step?: unknown };
	return (
		success === true &&
		typeof step === 'object' &&
		step !== null &&
		'id' in step &&
		typeof step.id === 'string'
	);
};

const isStopTourPayload = (payload: unknown): payload is { success: true } =>
	typeof payload === 'object' && payload !== null && 'success' in payload && payload.success === true;

export const applyGuidedTourEvent = (tourEvent: TourSsePayload): void => {
	if (!guidedTourState.activeTourId) {
		return;
	}

	if (tourEvent.type === 'stay') {
		if (tourEvent.messageType === 'answer_attempt') {
			guidedTourState.attemptCount += 1;
		}
		return;
	}

	if (tourEvent.type === 'hold') {
		return;
	}

	if (tourEvent.type === 'message') {
		guidedTourState.awaitingConfirmation = tourEvent.awaitingConfirmation;
		appendTourMessage(tourEvent.message);
		return;
	}

	if (tourEvent.type === 'advance') {
		appendStep(guidedTourState.activeTourId, tourEvent.step.id);
		return;
	}

	guidedTourState.status = 'finished';
	guidedTourState.activeStepId = null;
	guidedTourState.attemptCount = 0;
	guidedTourState.awaitingConfirmation = false;
	chatMessages.push(animateAssistantMessage(tourEvent.message));
};

export const startGuidedTour = (tourId: string): void => {
	void (async () => {
		try {
			const response = await fetch('/api/tour/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tourId })
			});

			const payload = (await response.json().catch(() => null)) as
				| { success?: true; step?: { id?: string } }
				| { error?: unknown }
				| null;
			const started = isStartTourPayload(payload) ? payload : null;

			if (!response.ok || !started) {
				throw (
					(payload && 'error' in payload ? payload.error : payload) ??
					new Error('Could not start the guided tour.')
				);
			}

			guidedTourState.status = 'running';
			guidedTourState.activeTourId = tourId;
			guidedTourState.awaitingConfirmation = false;
			const stepId = started.step.id;
			appendStep(tourId, stepId);
		} catch (error) {
			showErrorToast(error, 'Could not start the guided tour.');
		}
	})();
};

export const stopGuidedTour = (): void => {
	void (async () => {
		const activeTourId = guidedTourState.activeTourId;
		const activeStepId = guidedTourState.activeStepId;

		try {
			const response = await fetch('/api/tour/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tourId: activeTourId,
					stepId: activeStepId
				})
			});

			const payload = (await response.json().catch(() => null)) as
				| { success?: true }
				| { error?: unknown }
				| null;
			const stopped = isStopTourPayload(payload);

			if (!response.ok || !stopped) {
				throw (
					(payload && 'error' in payload ? payload.error : payload) ??
					new Error('Could not stop the guided tour.')
				);
			}

			resetGuidedTourState();
			chatMessages.push(
				animateAssistantMessage(
					'The guided tour has been stopped. You can start it again at any time.'
				)
			);
		} catch (error) {
			showErrorToast(error, 'Could not stop the guided tour.');
		}
	})();
};

export const clearGuidedTour = (): void => {
	resetGuidedTourState();
};
