import { describe, expect, test } from 'vitest';
import { parsePersistedTourState, stringifyPersistedTourState } from './tour-persistence';

describe('tour-persistence', () => {
	test('stringifies and parses valid state', () => {
		const state = {
			kind: 'guided_tour_state' as const,
			status: 'running' as const,
			tourId: 'tour',
			stepId: 's1',
			attemptCount: 1,
			awaitingConfirmation: true
		};
		expect(parsePersistedTourState(stringifyPersistedTourState(state))).toEqual(state);
	});

	test('returns null for missing, invalid, or schema-invalid values', () => {
		expect(parsePersistedTourState(null)).toBeNull();
		expect(parsePersistedTourState('{bad')).toBeNull();
		expect(parsePersistedTourState('{"kind":"x"}')).toBeNull();
	});
});
