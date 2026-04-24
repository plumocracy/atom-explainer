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
					m: { type: 'integer' },
				},
				required: ['n', 'l', 'm'],
			},
		},
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
						description: 'Optional transition duration in milliseconds',
					},
				},
				required: ['x', 'y', 'z'],
			},
		},
	},
];

const mergeFragment = (current: string, incoming: string): string => {
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

const parseToolArguments = (argumentsText: string): unknown | undefined => {
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
				functionArguments: '',
			};

			if (delta.id) {
				current.id = delta.id;
			}

			if (delta.function?.name) {
				current.functionName = mergeFragment(current.functionName, delta.function.name);
			}

			if (delta.function?.arguments) {
				current.functionArguments = mergeFragment(current.functionArguments, delta.function.arguments);
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
					parsedArguments: parseToolArguments(call.functionArguments),
				},
			}));
	}
}
