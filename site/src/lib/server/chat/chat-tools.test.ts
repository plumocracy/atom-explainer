import { describe, expect, test } from 'vitest';
import {
	expandBatchedToolCalls,
	mergeFragment,
	parseToolArguments,
	ToolCallStreamAccumulator
} from './chat-tools';

describe('chat-tools helpers', () => {
	test('mergeFragment handles overlap cases', () => {
		expect(mergeFragment('', 'abc')).toBe('abc');
		expect(mergeFragment('ab', 'abc')).toBe('abc');
		expect(mergeFragment('abc', 'bc')).toBe('abc');
		expect(mergeFragment('ab', 'cd')).toBe('abcd');
	});

	test('parseToolArguments parses JSON and tolerates invalid', () => {
		expect(parseToolArguments('{"x":1}')).toEqual({ x: 1 });
		expect(parseToolArguments('')).toBeUndefined();
		expect(parseToolArguments('{bad')).toBeUndefined();
	});

	test('ToolCallStreamAccumulator merges deltas and parses arguments', () => {
		const acc = new ToolCallStreamAccumulator();
		acc.consume([
			{ index: 0, id: 'a', function: { name: 'set_', arguments: '{"n":' } },
			{ index: 0, function: { name: 'simulation_params', arguments: '1}' } }
		]);
		const out = acc.toArray();
		expect(out).toHaveLength(1);
		expect(out[0].function.name).toBe('set_simulation_params');
		expect(out[0].function.parsedArguments).toEqual({ n: 1 });
	});

	test('expandBatchedToolCalls converts scene action batches into regular tool calls', () => {
		const out = expandBatchedToolCalls([
			{
				index: 0,
				type: 'function',
				function: {
					name: 'apply_scene_actions',
					arguments:
						'{"actions":[{"type":"set_simulation_params","n":3,"l":2,"m":1},{"type":"move_camera_to_point","x":1,"y":2,"z":3},{"type":"insert_standing_wave_visualization"}]}',
					parsedArguments: {
						actions: [
							{ type: 'set_simulation_params', n: 3, l: 2, m: 1 },
							{ type: 'move_camera_to_point', x: 1, y: 2, z: 3 },
							{ type: 'insert_standing_wave_visualization' },
							{
								type: 'create_button',
								label: 'Try 3d',
								simulationValues: { n: 3, l: 2, m: 1 }
							}
						]
					}
				}
			}
		]);

		expect(out.map((toolCall) => toolCall.function.name)).toEqual([
			'set_simulation_params',
			'move_camera_to_point',
			'insert_standing_wave_visualization',
			'create_button'
		]);
		expect(out.map((toolCall) => toolCall.index)).toEqual([0, 1, 2, 3]);
		expect(out[0].function.parsedArguments).toEqual({ n: 3, l: 2, m: 1 });
		expect(out[3].function.parsedArguments).toEqual({
			buttons: [{ label: 'Try 3d', simulationValues: { n: 3, l: 2, m: 1 } }]
		});
	});
});
