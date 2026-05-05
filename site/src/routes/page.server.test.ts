import { describe, expect, test } from 'vitest';
import {
	parseAtomicNumber,
	parseCameraTarget,
	parseSimulationValues,
	parseVisualizationMode
} from './+page.server';

describe('page.server parse helpers', () => {
	test('parseSimulationValues parses known tool payload', () => {
		expect(parseSimulationValues('set_simulation_params', { n: 2, l: 1, m: 0 }, '')).toEqual({
			n: 2,
			l: 1,
			m: 0
		});
		expect(parseSimulationValues('other', { n: 1, l: 0, m: 0 }, '')).toBeUndefined();
	});

	test('parseCameraTarget parses xyz and optional duration', () => {
		expect(parseCameraTarget('move_camera_to_point', { x: 1, y: 2, z: 3, durationMs: 50 }, '')).toEqual({
			x: 1,
			y: 2,
			z: 3,
			durationMs: 50
		});
	});

	test('parseVisualizationMode and parseAtomicNumber parse valid values', () => {
		expect(parseVisualizationMode('set_visualization_mode', { mode: 'bohr' }, '')).toBe('bohr');
		expect(parseAtomicNumber('set_bohr_atomic_number', { atomicNumber: 8 }, '')).toBe(8);
	});
});
