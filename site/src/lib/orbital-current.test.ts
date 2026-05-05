import { describe, expect, test, vi } from 'vitest';

const { initMock, sampleMock } = vi.hoisted(() => ({
	initMock: vi.fn(() => Promise.resolve()),
	sampleMock: vi.fn(() => [1, 2, 3, 4, 5, 6, 7])
}));

vi.mock('../../orbital-math/pkg/orbital_math.js', () => ({
	default: initMock,
	probability_current_velocity_cartesian: sampleMock
}));
vi.mock('../../orbital-math/pkg/orbital_math_bg.wasm?url', () => ({ default: 'mock-wasm-url' }));

import { getProbabilityCurrentVelocity, initOrbitalCurrent, sampleProbabilityCurrentVelocity } from './orbital-current';

describe('orbital-current', () => {
	test('initOrbitalCurrent initializes wasm only once', async () => {
		await initOrbitalCurrent();
		await initOrbitalCurrent();
		expect(initMock).toHaveBeenCalledTimes(1);
	});

	test('sample/get map wasm array result to objects', async () => {
		const asyncOut = await sampleProbabilityCurrentVelocity(1, 0, 0, 0, 0, 0);
		const syncOut = getProbabilityCurrentVelocity(1, 0, 0, 0, 0, 0);
		expect(asyncOut.current.x).toBe(1);
		expect(syncOut.velocity.z).toBe(6);
		expect(syncOut.density).toBe(7);
	});
});
