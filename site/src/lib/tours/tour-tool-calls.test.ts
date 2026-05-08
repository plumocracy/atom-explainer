import { describe, expect, test } from 'vitest';
import { createTourToolCalls, toArgumentsText } from './tour-tool-calls';

describe('tour-tool-calls', () => {
	test('toArgumentsText serializes object', () => {
		expect(toArgumentsText({ a: 1 })).toBe('{"a":1}');
	});

	test('createTourToolCalls maps each action type to a function call', () => {
		const calls = createTourToolCalls([
			{ type: 'set_visualization_mode', mode: 'bohr' },
			{ type: 'set_orbital_params', n: 2, l: 1, m: 0 },
			{ type: 'move_camera_to_point', x: 1, y: 2, z: 3 },
			{ type: 'set_cross_section_hidden', hidden: true },
			{ type: 'set_bohr_atomic_number', atomicNumber: 12 }
		] as never);

		expect(calls.map((call) => call.function.name)).toEqual([
			'set_visualization_mode',
			'set_simulation_params',
			'move_camera_to_point',
			'toggle_positive_xy_cross_section',
			'set_bohr_atomic_number'
		]);
	});
});
