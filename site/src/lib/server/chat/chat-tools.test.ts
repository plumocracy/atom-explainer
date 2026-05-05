import { describe, expect, test } from 'vitest';
import { mergeFragment, parseToolArguments, ToolCallStreamAccumulator } from './chat-tools';

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
});
