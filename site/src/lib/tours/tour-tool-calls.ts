import type { StreamedToolCall } from '$lib/server/chat/chat-contract';
import type { TourAction } from './tour-schema';

export const toArgumentsText = (value: object): string => JSON.stringify(value);

export const createTourToolCalls = (actions: TourAction[]): StreamedToolCall[] => {
	return actions.map((action, index) => {
		switch (action.type) {
			case 'set_visualization_mode': {
				const parsedArguments = { mode: action.mode };
				return {
					index,
					type: 'function',
					function: {
						name: 'set_visualization_mode',
						arguments: toArgumentsText(parsedArguments),
						parsedArguments
					}
				};
			}

			case 'set_orbital_params': {
				const parsedArguments = { n: action.n, l: action.l, m: action.m };
				return {
					index,
					type: 'function',
					function: {
						name: 'set_simulation_params',
						arguments: toArgumentsText(parsedArguments),
						parsedArguments
					}
				};
			}

			case 'move_camera_to_point': {
				const parsedArguments = {
					x: action.x,
					y: action.y,
					z: action.z,
					durationMs: action.durationMs
				};
				return {
					index,
					type: 'function',
					function: {
						name: 'move_camera_to_point',
						arguments: toArgumentsText(parsedArguments),
						parsedArguments
					}
				};
			}

			case 'set_cross_section_hidden': {
				const parsedArguments = { hidden: action.hidden };
				return {
					index,
					type: 'function',
					function: {
						name: 'toggle_positive_xy_cross_section',
						arguments: toArgumentsText(parsedArguments),
						parsedArguments
					}
				};
			}

			case 'set_bohr_atomic_number': {
				const parsedArguments = { atomicNumber: action.atomicNumber };
				return {
					index,
					type: 'function',
					function: {
						name: 'set_bohr_atomic_number',
						arguments: toArgumentsText(parsedArguments),
						parsedArguments
					}
				};
			}
		}
	});
};
