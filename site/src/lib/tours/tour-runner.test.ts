import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./tours', () => ({
	getTourStep: vi.fn((tourId: string, stepId: string) =>
		tourId === 't1' && stepId === 's1'
			? {
				id: 's1',
				assistantMarkdown: 'step text',
				actions: [],
				judge: { goal: 'g', advanceThreshold: 'x', mustMentionAny: [], niceToMentionAny: [], misconceptions: [] },
				onAdvanceReply: 'a',
				onStayReply: 'b'
			}
			: undefined
	),
	getTourCompletionMessage: vi.fn(() => 'summary text')
}));
vi.mock('./tour-actions', () => ({ applyTourActions: vi.fn(() => []) }));
vi.mock('$lib/toast.svelte', () => ({ showErrorToast: vi.fn() }));

import { chatMessages } from '$lib/chat.svelte';
import { guidedTourState, resetGuidedTourState } from './tour-state.svelte';
import {
	animateAssistantMessage,
	appendStep,
	applyGuidedTourEvent,
	clearGuidedTour
} from './tour-runner';

describe('tour-runner', () => {
	beforeEach(() => {
		chatMessages.splice(0, chatMessages.length);
		resetGuidedTourState();
		guidedTourState.activeTourId = 't1';
	});

	test('animateAssistantMessage sets live pending assistant message', () => {
		const msg = animateAssistantMessage('hi');
		expect(msg.role).toBe('assistant');
		expect(msg.pending).toBe(true);
	});

	test('appendStep sets active step and appends message', () => {
		appendStep('t1', 's1');
		expect(guidedTourState.activeStepId).toBe('s1');
		expect(chatMessages.at(-1)?.content).toBe('step text');
	});

	test('applyGuidedTourEvent handles stay/hold/message/finish', () => {
		guidedTourState.attemptCount = 0;
		applyGuidedTourEvent({ type: 'stay', messageType: 'answer_attempt' });
		expect(guidedTourState.attemptCount).toBe(1);
		applyGuidedTourEvent({ type: 'hold', messageType: 'question' });
		applyGuidedTourEvent({
			type: 'message',
			message: 'Please confirm your answer.',
			awaitingConfirmation: true
		});
		expect(guidedTourState.awaitingConfirmation).toBe(true);
		expect(chatMessages.at(-1)?.content).toBe('Please confirm your answer.');
		applyGuidedTourEvent({ type: 'finish', message: 'summary text' });
		expect(guidedTourState.status).toBe('finished');
		expect(chatMessages.at(-1)?.content).toBe('summary text');
	});

	test('clearGuidedTour resets state', () => {
		guidedTourState.status = 'running';
		clearGuidedTour();
		expect(guidedTourState.status).toBe('idle');
	});
});
