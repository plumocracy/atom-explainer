import { describe, expect, test } from 'vitest';
import {
	isMobileRequest,
	parseAtomicNumber,
	parseCameraTarget,
	parseSimulationValues,
	parseVisualizationAttachment,
	parseVisualizationMode
} from './page.server.helpers';

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
		expect(
			parseCameraTarget('move_camera_to_point', { x: 1, y: 2, z: 3, durationMs: 50 }, '')
		).toEqual({
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

	test('parseVisualizationAttachment parses standing-wave tool', () => {
		expect(parseVisualizationAttachment('insert_standing_wave_visualization')).toEqual({
			type: 'standing_wave'
		});
		expect(parseVisualizationAttachment('move_camera_to_point')).toBeUndefined();
	});

	test('isMobileRequest detects mobile user agents and client hints', () => {
		expect(
			isMobileRequest(
				new Headers({
					'user-agent':
						'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
				})
			)
		).toBe(true);
		expect(isMobileRequest(new Headers({ 'sec-ch-ua-mobile': '?1' }))).toBe(true);
		expect(
			isMobileRequest(
				new Headers({
					'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36'
				})
			)
		).toBe(false);
	});
});
