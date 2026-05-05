import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/chat-buttons', () => ({ parseCreateButtons: vi.fn(() => []) }));

import {
	_hasUserFacingText,
	_parseCameraTargetFromToolCall,
	_parseCrossSectionHiddenFromToolCall,
	_parseSimulationValuesFromToolCall,
	_synthesizeToolOnlyResponse
} from './+server';

describe('chat api helpers', () => {
	test('hasUserFacingText filters blank/non-alnum', () => {
		expect(_hasUserFacingText('   ')).toBe(false);
		expect(_hasUserFacingText('***')).toBe(false);
		expect(_hasUserFacingText('hello')).toBe(true);
	});

	test('parse helper functions parse tool call arguments', () => {
		expect(
			_parseSimulationValuesFromToolCall({
				index: 0,
				type: 'function',
				function: { name: 'x', arguments: '{"n":1,"l":0,"m":0}' }
			})
		).toEqual({ n: 1, l: 0, m: 0 });
		expect(
			_parseCameraTargetFromToolCall({
				index: 0,
				type: 'function',
				function: { name: 'x', arguments: '{"x":1,"y":2,"z":3}' }
			})
		).toEqual({ x: 1, y: 2, z: 3 });
		expect(
			_parseCrossSectionHiddenFromToolCall({
				index: 0,
				type: 'function',
				function: { name: 'x', arguments: '{"hidden":true}' }
			})
		).toBe(true);
	});

	test('synthesizeToolOnlyResponse summarizes known tool calls', () => {
		const msg = _synthesizeToolOnlyResponse([
			{
				index: 0,
				type: 'function',
				function: { name: 'set_simulation_params', arguments: '{"n":2,"l":1,"m":0}' }
			}
		]);
		expect(msg).toContain('n=2');
	});
});
