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
						description:
							'True hides the +X/+Y cross section, false shows the full cloud again'
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
