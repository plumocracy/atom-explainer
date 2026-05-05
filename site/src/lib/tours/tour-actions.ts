import {
	bohrSimulationValues,
	queueOrbitalCameraMove,
	setPositiveXYCrossSectionHidden,
	simulationValues,
	type ToolCallMessage,
	visualizationState
} from '$lib/chat.svelte';
import type { TourAction } from './tour-schema';

export const applyTourActions = (actions: TourAction[]): ToolCallMessage[] => {
	const toolCalls: ToolCallMessage[] = [];

	for (const action of actions) {
		switch (action.type) {
			case 'set_visualization_mode':
				visualizationState.mode = action.mode;
				toolCalls.push({
					toolName: 'set_visualization_mode',
					visualizationMode: action.mode
				});
				break;

			case 'set_orbital_params':
				simulationValues.n = action.n;
				simulationValues.l = action.l;
				simulationValues.m = action.m;
				toolCalls.push({
					toolName: 'set_simulation_params',
					simulationValues: { n: action.n, l: action.l, m: action.m }
				});
				break;

			case 'move_camera_to_point':
				queueOrbitalCameraMove(action);
				toolCalls.push({
					toolName: 'move_camera_to_point',
					cameraTarget: action
				});
				break;

			case 'set_cross_section_hidden':
				setPositiveXYCrossSectionHidden(action.hidden);
				toolCalls.push({
					toolName: 'toggle_positive_xy_cross_section',
					crossSectionHidden: action.hidden
				});
				break;

			case 'set_bohr_atomic_number':
				bohrSimulationValues.atomicNumber = action.atomicNumber;
				toolCalls.push({
					toolName: 'set_bohr_atomic_number',
					atomicNumber: action.atomicNumber
				});
				break;
		}
	}

	return toolCalls;
};
