import type { ChatButton } from '$lib/chat-buttons';

export type SimulationValues = {
	n: number;
	l: number;
	m: number;
};
export type VisualizationMode = 'orbital' | 'bohr';

const BOHR_SHELL_CAPACITIES = [2, 8, 18, 32, 50] as const;

export const getBohrShellDistribution = (atomicNumber: number): number[] => {
	let remaining = Math.max(0, atomicNumber);
	const shells: number[] = [];

	for (const capacity of BOHR_SHELL_CAPACITIES) {
		if (remaining <= 0) {
			break;
		}

		const shellElectrons = Math.min(remaining, capacity);
		shells.push(shellElectrons);
		remaining -= shellElectrons;
	}

	return shells;
};

export type CameraTarget = {
	x: number;
	y: number;
	z: number;
	durationMs?: number;
};

export type CameraMoveRequest = CameraTarget & {
	id: number;
};

export type ToolCallMessage = {
	toolName: string;
	providerCallId?: string | null;
	callIndex?: number;
	argumentsRaw?: string;
	argumentsJson?: unknown;
	simulationValues?: SimulationValues;
	cameraTarget?: CameraTarget;
	crossSectionHidden?: boolean;
	visualizationMode?: VisualizationMode;
	atomicNumber?: number;
};

export type MessageVisualization = {
	type: 'standing_wave';
};

export type Message = {
	id: number;
	serverId?: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	feedbackSubmitted?: boolean;
	pending?: boolean;
	live?: boolean;
	autoFinishPending?: boolean;
	simValues?: SimulationValues;
	toolCall?: ToolCallMessage;
	toolCalls?: ToolCallMessage[];
	buttons?: ChatButton[];
	visualizations?: MessageVisualization[];
	tourState?: {
		status: 'running' | 'stopped' | 'finished';
		tourId: string;
		stepId: string | null;
		attemptCount: number;
	} | null;
};

export const simulationValues = $state({ n: 1, l: 0, m: 0 });
export const bohrSimulationValues = $state({ atomicNumber: 8 });
export const visualizationState = $state<{ mode: VisualizationMode }>({ mode: 'orbital' });
export const orbitalViewState = $state({ hidePositiveXYCrossSection: false });
export const orbitalCameraState = $state<{ moveRequest: CameraMoveRequest | null }>({
	moveRequest: null
});

const clampSimulationValues = (next: SimulationValues): SimulationValues => {
	const n = next.n;
	const l = Math.max(0, Math.min(next.l, n - 1));
	const m = Math.max(-l, Math.min(next.m, l));
	return { n, l, m };
};

export const setSimulationValues = (next: SimulationValues): void => {
	const normalized = clampSimulationValues(next);
	simulationValues.n = normalized.n;
	simulationValues.l = normalized.l;
	simulationValues.m = normalized.m;
};

export const chatMessages = $state<Message[]>([]);

let nextMessageId = 0;
let nextCameraMoveRequestId = 0;

export const createChatMessage = (message: Omit<Message, 'id'>): Message => ({
	id: nextMessageId++,
	...message
});

export const queueOrbitalCameraMove = (target: CameraTarget): void => {
	orbitalCameraState.moveRequest = {
		id: ++nextCameraMoveRequestId,
		...target
	};
};

export const setPositiveXYCrossSectionHidden = (hidden: boolean): void => {
	orbitalViewState.hidePositiveXYCrossSection = hidden;
};

export const getChatButtonLabel = (button: ChatButton): string => {
	if (button.toggleButton?.toggleType === 'positive_xy_cross_section') {
		return orbitalViewState.hidePositiveXYCrossSection
			? button.toggleButton.labelWhenHidden
			: button.toggleButton.labelWhenVisible;
	}

	if (button.toggleButton?.toggleType === 'visualization_mode') {
		return visualizationState.mode === 'orbital'
			? button.toggleButton.labelWhenOrbital
			: button.toggleButton.labelWhenBohr;
	}

	return button.label ?? '';
};

export const applyChatButton = (button: ChatButton): void => {
	if (button.simulationValues) {
		setSimulationValues(button.simulationValues);
	}

	if (button.visualizationMode) {
		visualizationState.mode = button.visualizationMode;
	}

	if (button.toggleButton?.toggleType === 'positive_xy_cross_section') {
		orbitalViewState.hidePositiveXYCrossSection = !orbitalViewState.hidePositiveXYCrossSection;
	}

	if (button.toggleButton?.toggleType === 'visualization_mode') {
		visualizationState.mode = visualizationState.mode === 'orbital' ? 'bohr' : 'orbital';
	}
};

export const applyToolCallMessage = (toolCall: ToolCallMessage): void => {
	if (toolCall.simulationValues) {
		setSimulationValues(toolCall.simulationValues);
	}

	if (toolCall.cameraTarget) {
		queueOrbitalCameraMove(toolCall.cameraTarget);
	}

	if (typeof toolCall.crossSectionHidden === 'boolean') {
		setPositiveXYCrossSectionHidden(toolCall.crossSectionHidden);
	}

	if (toolCall.visualizationMode) {
		visualizationState.mode = toolCall.visualizationMode;
	}

	if (typeof toolCall.atomicNumber === 'number') {
		bohrSimulationValues.atomicNumber = toolCall.atomicNumber;
	}
};

export const applyToolCallMessages = (toolCalls: ToolCallMessage[]): void => {
	for (const toolCall of toolCalls) {
		applyToolCallMessage(toolCall);
	}
};
