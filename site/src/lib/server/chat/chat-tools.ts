import type { StreamedToolCall } from './chat-contract';
import type { ChatFunctionTool } from '@openrouter/sdk/models';

type ToolCallDelta = {
	index: number;
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
};

type MutableToolCall = {
	index: number;
	id?: string;
	type: 'function';
	functionName: string;
	functionArguments: string;
};

export const CHAT_TOOLS: ChatFunctionTool[] = [
	{
		type: 'function',
		function: {
			name: 'apply_scene_actions',
			description:
				'Apply multiple supported chat scene actions in one call. Use this when the user asks for more than one change, such as changing the orbital and moving the camera, or adding a visualization and a button.',
			parameters: {
				type: 'object',
				properties: {
					actions: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								type: {
									type: 'string',
									enum: [
										'set_simulation_params',
										'create_button',
										'toggle_positive_xy_cross_section',
										'create_toggle_button',
										'insert_standing_wave_visualization',
										'move_camera_to_point'
									]
								},
								n: { type: 'integer' },
								l: { type: 'integer' },
								m: { type: 'integer' },
								hidden: { type: 'boolean' },
								x: { type: 'number' },
								y: { type: 'number' },
								z: { type: 'number' },
								durationMs: { type: 'number' },
								buttons: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											label: { type: 'string' },
											simulationValues: {
												type: 'object',
												properties: {
													n: { type: 'integer' },
													l: { type: 'integer' },
													m: { type: 'integer' }
												},
												required: ['n', 'l', 'm']
											}
										},
										required: ['label']
									}
								},
								toggleType: {
									type: 'string',
									enum: ['positive_xy_cross_section', 'visualization_mode']
								},
								labelWhenVisible: { type: 'string' },
								labelWhenHidden: { type: 'string' },
								labelWhenOrbital: { type: 'string' },
								labelWhenBohr: { type: 'string' }
							},
							required: ['type']
						}
					}
				},
				required: ['actions']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'set_simulation_params',
			description: 'Set the parameters for the atomic simulation',
			parameters: {
				type: 'object',
				properties: {
					n: { type: 'integer' },
					l: { type: 'integer' },
					m: { type: 'integer' }
				},
				required: ['n', 'l', 'm']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_button',
			description:
				'Insert one or more clickable buttons beneath the assistant message to apply predefined simulation parameter actions',
			parameters: {
				type: 'object',
				properties: {
					buttons: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								label: { type: 'string', description: 'Short button text shown to the user' },
								simulationValues: {
									type: 'object',
									properties: {
										n: { type: 'integer' },
										l: { type: 'integer' },
										m: { type: 'integer' }
									},
									required: ['n', 'l', 'm']
								}
							},
							required: ['label']
						}
					}
				},
				required: ['buttons']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'toggle_positive_xy_cross_section',
			description:
				'Turn the +X/+Y orbital cross section on or off by hiding or showing that positive X and positive Y region',
			parameters: {
				type: 'object',
				properties: {
					hidden: {
						type: 'boolean',
						description: 'True hides the +X/+Y cross section, false shows the full cloud again'
					}
				},
				required: ['hidden']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_toggle_button',
			description:
				'Insert a clickable toggle button beneath the assistant message that stays synced with the main UI. It can either toggle the +X/+Y cross section or swap between the orbital and Bohr visualizations.',
			parameters: {
				type: 'object',
				properties: {
					toggleType: {
						type: 'string',
						enum: ['positive_xy_cross_section', 'visualization_mode'],
						description: 'Choose which synchronized toggle button to create'
					},
					labelWhenVisible: {
						type: 'string',
						description:
							'For positive_xy_cross_section only: label shown when the cross section is currently visible and clicking will hide it'
					},
					labelWhenHidden: {
						type: 'string',
						description:
							'For positive_xy_cross_section only: label shown when the cross section is currently hidden and clicking will show it'
					},
					labelWhenOrbital: {
						type: 'string',
						description:
							'For visualization_mode only: label shown when the orbital view is active and clicking will switch to Bohr'
					},
					labelWhenBohr: {
						type: 'string',
						description:
							'For visualization_mode only: label shown when the Bohr view is active and clicking will switch to orbital'
					}
				},
				required: ['toggleType']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'insert_standing_wave_visualization',
			description:
				'Insert the standing-wave nodes and antinodes visualization beneath the assistant message in the chat window',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'move_camera_to_point',
			description:
				'Move the 3D orbital camera to a world-space point (x,y,z) while continuing to look at the atom center',
			parameters: {
				type: 'object',
				properties: {
					x: { type: 'number', description: 'Camera x position in scene coordinates' },
					y: { type: 'number', description: 'Camera y position in scene coordinates' },
					z: { type: 'number', description: 'Camera z position in scene coordinates' },
					durationMs: {
						type: 'number',
						description: 'Optional transition duration in milliseconds'
					}
				},
				required: ['x', 'y', 'z']
			}
		}
	}
];

export const mergeFragment = (current: string, incoming: string): string => {
	if (!incoming) {
		return current;
	}

	if (!current) {
		return incoming;
	}

	if (incoming.startsWith(current)) {
		return incoming;
	}

	if (current.endsWith(incoming)) {
		return current;
	}

	return `${current}${incoming}`;
};

export const parseToolArguments = (argumentsText: string): unknown | undefined => {
	const normalized = argumentsText.trim();
	if (!normalized) {
		return undefined;
	}

	try {
		return JSON.parse(normalized);
	} catch {
		return undefined;
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const toExpandedToolCall = (
	name: string,
	parsedArguments: Record<string, unknown>,
	index: number
): StreamedToolCall => {
	const argumentsText = JSON.stringify(parsedArguments);
	return {
		index,
		type: 'function',
		function: {
			name,
			arguments: argumentsText,
			parsedArguments
		}
	};
};

const normalizeBatchedAction = (
	action: unknown
): { name: string; arguments: Record<string, unknown> } | null => {
	if (!isRecord(action) || typeof action.type !== 'string') {
		return null;
	}

	const { type } = action;
	if (type === 'set_simulation_params') {
		const { n, l, m } = action;
		return typeof n === 'number' && typeof l === 'number' && typeof m === 'number'
			? { name: type, arguments: { n, l, m } }
			: null;
	}

	if (type === 'toggle_positive_xy_cross_section') {
		return typeof action.hidden === 'boolean'
			? { name: type, arguments: { hidden: action.hidden } }
			: null;
	}

	if (type === 'move_camera_to_point') {
		const { x, y, z, durationMs } = action;
		if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
			return null;
		}

		return {
			name: type,
			arguments: {
				x,
				y,
				z,
				...(typeof durationMs === 'number' ? { durationMs } : {})
			}
		};
	}

	if (type === 'insert_standing_wave_visualization') {
		return { name: type, arguments: {} };
	}

	if (type === 'create_button') {
		if (Array.isArray(action.buttons)) {
			return { name: type, arguments: { buttons: action.buttons } };
		}

		if (typeof action.label !== 'string') {
			return null;
		}

		return {
			name: type,
			arguments: {
				buttons: [
					{
						label: action.label,
						...(isRecord(action.simulationValues)
							? { simulationValues: action.simulationValues }
							: {})
					}
				]
			}
		};
	}

	if (type === 'create_toggle_button') {
		const args: Record<string, unknown> = {};
		for (const key of [
			'toggleType',
			'labelWhenVisible',
			'labelWhenHidden',
			'labelWhenOrbital',
			'labelWhenBohr'
		]) {
			if (typeof action[key] === 'string') {
				args[key] = action[key];
			}
		}

		return typeof args.toggleType === 'string' ? { name: type, arguments: args } : null;
	}

	return null;
};

export const expandBatchedToolCalls = (toolCalls: StreamedToolCall[]): StreamedToolCall[] => {
	const expanded: StreamedToolCall[] = [];

	for (const toolCall of toolCalls) {
		if (toolCall.function.name !== 'apply_scene_actions') {
			expanded.push({ ...toolCall, index: expanded.length });
			continue;
		}

		const parsedArguments = isRecord(toolCall.function.parsedArguments)
			? toolCall.function.parsedArguments
			: parseToolArguments(toolCall.function.arguments);
		const actions = isRecord(parsedArguments) ? parsedArguments.actions : undefined;
		if (!Array.isArray(actions)) {
			continue;
		}

		for (const action of actions) {
			const normalized = normalizeBatchedAction(action);
			if (!normalized) {
				continue;
			}

			expanded.push(toExpandedToolCall(normalized.name, normalized.arguments, expanded.length));
		}
	}

	return expanded;
};

export class ToolCallStreamAccumulator {
	private readonly calls = new Map<number, MutableToolCall>();

	consume(deltas: ToolCallDelta[] | undefined): void {
		if (!deltas?.length) {
			return;
		}

		for (const delta of deltas) {
			const current = this.calls.get(delta.index) ?? {
				index: delta.index,
				type: 'function' as const,
				functionName: '',
				functionArguments: ''
			};

			if (delta.id) {
				current.id = delta.id;
			}

			if (delta.function?.name) {
				current.functionName = mergeFragment(current.functionName, delta.function.name);
			}

			if (delta.function?.arguments) {
				current.functionArguments = mergeFragment(
					current.functionArguments,
					delta.function.arguments
				);
			}

			this.calls.set(delta.index, current);
		}
	}

	toArray(): StreamedToolCall[] {
		return [...this.calls.values()]
			.sort((a, b) => a.index - b.index)
			.filter((call) => Boolean(call.functionName))
			.map((call) => ({
				id: call.id,
				index: call.index,
				type: call.type,
				function: {
					name: call.functionName,
					arguments: call.functionArguments,
					parsedArguments: parseToolArguments(call.functionArguments)
				}
			}));
	}
}
