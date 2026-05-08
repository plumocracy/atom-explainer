import { beforeEach, describe, expect, test } from 'vitest';
import {
	applyChatButton,
	applyToolCallMessage,
	applyToolCallMessages,
	bohrSimulationValues,
	chatMessages,
	createChatMessage,
	getBohrShellDistribution,
	getChatButtonLabel,
	orbitalCameraState,
	orbitalViewState,
	queueOrbitalCameraMove,
	setSimulationValues,
	setPositiveXYCrossSectionHidden,
	simulationValues,
	visualizationState
} from './chat.svelte';

describe('chat.svelte helpers', () => {
	beforeEach(() => {
		setSimulationValues({ n: 1, l: 0, m: 0 });
		bohrSimulationValues.atomicNumber = 8;
		visualizationState.mode = 'orbital';
		orbitalViewState.hidePositiveXYCrossSection = false;
		orbitalCameraState.moveRequest = null;
		chatMessages.splice(0, chatMessages.length);
	});

	test('getBohrShellDistribution allocates by shell capacities', () => {
		expect(getBohrShellDistribution(0)).toEqual([]);
		expect(getBohrShellDistribution(10)).toEqual([2, 8]);
		expect(getBohrShellDistribution(100)).toEqual([2, 8, 18, 32, 40]);
	});

	test('createChatMessage assigns monotonic ids', () => {
		const a = createChatMessage({ role: 'user', content: 'a' });
		const b = createChatMessage({ role: 'assistant', content: 'b' });
		expect(b.id).toBe(a.id + 1);
	});

	test('queueOrbitalCameraMove and cross-section setters update state', () => {
		queueOrbitalCameraMove({ x: 1, y: 2, z: 3 });
		expect(orbitalCameraState.moveRequest?.x).toBe(1);
		setPositiveXYCrossSectionHidden(true);
		expect(orbitalViewState.hidePositiveXYCrossSection).toBe(true);
	});

	test('getChatButtonLabel respects toggle state', () => {
		const crossButton = {
			toggleButton: {
				toggleType: 'positive_xy_cross_section' as const,
				labelWhenVisible: 'Hide',
				labelWhenHidden: 'Show'
			}
		};
		expect(getChatButtonLabel(crossButton)).toBe('Hide');
		orbitalViewState.hidePositiveXYCrossSection = true;
		expect(getChatButtonLabel(crossButton)).toBe('Show');
	});

	test('applyChatButton handles simulation and visualization toggles', () => {
		applyChatButton({ simulationValues: { n: 2, l: 1, m: 0 } });
		expect(simulationValues).toMatchObject({ n: 2, l: 1, m: 0 });
		applyChatButton({
			toggleButton: { toggleType: 'visualization_mode', labelWhenOrbital: 'x', labelWhenBohr: 'y' }
		});
		expect(visualizationState.mode).toBe('bohr');
	});

	test('applyToolCallMessage(s) applies all supported fields', () => {
		applyToolCallMessage({
			toolName: 'x',
			simulationValues: { n: 3, l: 2, m: 1 },
			crossSectionHidden: true,
			visualizationMode: 'bohr',
			atomicNumber: 12,
			cameraTarget: { x: 4, y: 5, z: 6 }
		});
		expect(simulationValues).toMatchObject({ n: 3, l: 2, m: 1 });
		expect(orbitalViewState.hidePositiveXYCrossSection).toBe(true);
		expect(visualizationState.mode).toBe('bohr');
		expect(bohrSimulationValues.atomicNumber).toBe(12);
		expect(orbitalCameraState.moveRequest?.x).toBe(4);

		applyToolCallMessages([{ toolName: 'x', simulationValues: { n: 1, l: 0, m: 0 } }]);
		expect(simulationValues).toMatchObject({ n: 1, l: 0, m: 0 });
	});
});
