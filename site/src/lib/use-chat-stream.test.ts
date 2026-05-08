import { describe, expect, test, vi } from 'vitest';

const listenMock = vi.fn();

vi.mock('event-source-plus', () => ({
	EventSourcePlus: class {
		listen = listenMock;
	}
}));

vi.mock('$lib/chat-buttons', () => ({
	parseCreateButtons: vi.fn(() => [])
}));
vi.mock('$lib/chat.svelte', () => ({
	applyToolCallMessage: vi.fn(),
	createChatMessage: vi.fn((m: object) => ({ id: 1, ...m })),
	getBohrShellDistribution: vi.fn(() => [2, 6]),
	orbitalViewState: { hidePositiveXYCrossSection: false }
}));
vi.mock('$lib/tours/tour-state.svelte', () => ({
	guidedTourState: {
		status: 'idle',
		activeTourId: null,
		activeStepId: null,
		attemptCount: 0,
		awaitingConfirmation: false
	}
}));
vi.mock('$lib/tours/tour-runner', () => ({ applyGuidedTourEvent: vi.fn() }));
vi.mock('$lib/toast.svelte', () => ({ showErrorToast: vi.fn() }));

import {
	applySimulationToolCalls,
	isRecord,
	parseToolCalls,
	summarizeToolCall,
	useChatStream
} from './use-chat-stream';
import { applyGuidedTourEvent } from '$lib/tours/tour-runner';

describe('use-chat-stream helpers', () => {
	test('tour-only message replaces empty assistant placeholder', () => {
		const abort = vi.fn();
		const onAbort = vi.fn();
		let handlers: { onMessage: (message: { data: string }) => void } | null = null;
		listenMock.mockImplementation(
			(nextHandlers: { onMessage: (message: { data: string }) => void }) => {
				handlers = nextHandlers;
				return { abort, onAbort };
			}
		);

		const messages: Array<{ role: string; content: string; pending?: boolean; live?: boolean }> =
			[];
		const stream = useChatStream({
			chatMessages: messages as never,
			simulationValues: { n: 1, l: 0, m: 0 },
			bohrSimulationValues: { atomicNumber: 8 },
			visualizationState: { mode: 'orbital' },
			setLoading: vi.fn()
		});

		stream.sendMessage('first');
		expect(handlers).not.toBeNull();
		if (!handlers) {
			throw new Error('Expected stream handlers');
		}
		const streamHandlers = handlers as { onMessage: (message: { data: string }) => void };

		streamHandlers.onMessage({
			data: JSON.stringify({
				tour: { type: 'message', message: 'Judge reply', awaitingConfirmation: true }
			})
		});
		streamHandlers.onMessage({ data: JSON.stringify({ done: true }) });

		expect(applyGuidedTourEvent).toHaveBeenCalledWith({
			type: 'message',
			message: 'Judge reply',
			awaitingConfirmation: true
		});
		expect(messages).toEqual([{ id: 1, role: 'user', content: 'first', live: false }]);
		expect(abort).toHaveBeenCalled();
	});

	test('isRecord and parseToolCalls handle supported forms', () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord(null)).toBe(false);
		expect(parseToolCalls([{ function: { name: 'x' } }])).toHaveLength(1);
		expect(parseToolCalls('{"function":{"name":"x"}}')).toHaveLength(1);
		expect(parseToolCalls(1)).toEqual([]);
	});

	test('applySimulationToolCalls parses tool payloads', () => {
		const out = applySimulationToolCalls([
			{ function: { name: 'set_simulation_params', arguments: '{"n":2,"l":1,"m":0}' } }
		]);
		expect(out.toolCallMessages[0].simulationValues).toEqual({ n: 2, l: 1, m: 0 });
	});

	test('applySimulationToolCalls captures standing-wave visualizations', () => {
		const out = applySimulationToolCalls([
			{ function: { name: 'insert_standing_wave_visualization', arguments: '{}' } }
		]);
		expect(out.visualizations).toEqual([{ type: 'standing_wave' }]);
		expect(out.toolCallMessages[0].toolName).toBe('insert_standing_wave_visualization');
	});

	test('summarizeToolCall emits user-facing summary', () => {
		expect(summarizeToolCall({ toolName: 'x', simulationValues: { n: 1, l: 0, m: 0 } })).toContain(
			'n=1'
		);
		expect(summarizeToolCall({ toolName: 'x', crossSectionHidden: true })).toContain('hid');
		expect(summarizeToolCall({ toolName: 'insert_standing_wave_visualization' })).toContain(
			'standing-wave visualization'
		);
	});

	test('useChatStream ignores concurrent send while in flight', () => {
		listenMock.mockReturnValue({ abort: vi.fn(), onAbort: vi.fn() });
		const messages: Array<{ role: string; content: string }> = [];
		const setLoading = vi.fn();
		const stream = useChatStream({
			chatMessages: messages as never,
			simulationValues: { n: 1, l: 0, m: 0 },
			bohrSimulationValues: { atomicNumber: 8 },
			visualizationState: { mode: 'orbital' },
			setLoading
		});

		stream.sendMessage('first');
		stream.sendMessage('second');
		expect(messages.length).toBe(2);
	});

	test('marks streamed assistant message non-live when the stream is done', () => {
		const abort = vi.fn();
		const onAbort = vi.fn();
		let handlers: { onMessage: (message: { data: string }) => void } | null = null;
		listenMock.mockImplementation(
			(nextHandlers: { onMessage: (message: { data: string }) => void }) => {
				handlers = nextHandlers;
				return { abort, onAbort };
			}
		);

		const messages: Array<{
			role: string;
			content: string;
			pending?: boolean;
			live?: boolean;
			serverId?: string;
		}> = [];
		const stream = useChatStream({
			chatMessages: messages as never,
			simulationValues: { n: 1, l: 0, m: 0 },
			bohrSimulationValues: { atomicNumber: 8 },
			visualizationState: { mode: 'orbital' },
			setLoading: vi.fn()
		});

		stream.sendMessage('first');
		expect(handlers).not.toBeNull();
		if (!handlers) {
			throw new Error('Expected stream handlers');
		}
		const streamHandlers = handlers as { onMessage: (message: { data: string }) => void };

		streamHandlers.onMessage({ data: JSON.stringify({ token: 'Hello' }) });
		streamHandlers.onMessage({
			data: JSON.stringify({ done: true, assistantMessageId: 'assistant-1' })
		});

		expect(messages.at(-1)).toMatchObject({
			role: 'assistant',
			content: 'Hello',
			pending: false,
			live: false,
			serverId: 'assistant-1'
		});
		expect(abort).toHaveBeenCalled();
	});
});
