import { beforeEach, describe, expect, test } from 'vitest';
import {
	bohrSimulationValues,
	orbitalCameraState,
	orbitalViewState,
	setSimulationValues,
	simulationValues,
	visualizationState
} from '$lib/chat.svelte';
import { applyTourActions } from './tour-actions';

describe('applyTourActions', () => {
	beforeEach(() => {
		setSimulationValues({ n: 1, l: 0, m: 0 });
		visualizationState.mode = 'orbital';
		orbitalViewState.hidePositiveXYCrossSection = false;
		bohrSimulationValues.atomicNumber = 8;
		orbitalCameraState.moveRequest = null;
	});

	test('applies all tour action types and emits tool calls', () => {
		const calls = applyTourActions([
			{ type: 'set_visualization_mode', mode: 'bohr' },
			{ type: 'set_orbital_params', n: 2, l: 1, m: 0 },
			{ type: 'move_camera_to_point', x: 1, y: 2, z: 3 },
			{ type: 'set_cross_section_hidden', hidden: true },
			{ type: 'set_bohr_atomic_number', atomicNumber: 10 }
		] as never);

		expect(visualizationState.mode).toBe('bohr');
		expect(simulationValues).toMatchObject({ n: 2, l: 1, m: 0 });
		expect(orbitalCameraState.moveRequest?.x).toBe(1);
		expect(orbitalViewState.hidePositiveXYCrossSection).toBe(true);
		expect(bohrSimulationValues.atomicNumber).toBe(10);
		expect(calls).toHaveLength(5);
	});
});
