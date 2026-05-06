import { describe, expect, test, vi } from 'vitest';

const initMock = vi.fn(() => Promise.resolve());

vi.mock('../../orbital-math/pkg/orbital_math.js', () => ({
	default: initMock,
	advance_batch_complex_flow: vi.fn(() => new Float32Array([0, 0, 0, 1, 0, 0])),
	auto_rejection_scale_complex: vi.fn(() => 1),
	sample_batch_complex_flow: vi.fn(() => new Float32Array([0, 0, 0, 1, 0, 0]))
}));
vi.mock('../../orbital-math/pkg/orbital_math_bg.wasm?url', () => ({ default: 'mock-wasm-url' }));

describe('orbital.worker', () => {
	test('initWasm memoizes wasm initialization', async () => {
		vi.stubGlobal('self', { postMessage: vi.fn() });
		const mod = await import('./orbital.worker');
		await mod.initWasm();
		await mod.initWasm();
		expect(initMock).toHaveBeenCalledTimes(1);
	});

	test('applyRadialBandCaps limits dense inner bands but preserves outer points', async () => {
		vi.stubGlobal('self', { postMessage: vi.fn() });
		const mod = await import('./orbital.worker');
		const profile = {
			key: 'test',
			innerBands: [{ maxRadius: 0.5, maxPoints: 1 }]
		};
		const chunk = {
			points: new Float32Array([
				0.1, 0, 0,
				0.2, 0, 0,
				1.0, 0, 0,
				1.1, 0, 0,
				2.2, 0, 0
			]),
			flow: new Float32Array([
				1, 0, 0,
				2, 0, 0,
				3, 0, 0,
				4, 0, 0,
				6, 0, 0
			])
		};

		const filtered = mod.applyRadialBandCaps(chunk, profile, [0]);

		expect(Array.from(filtered.points)).toEqual(Array.from(new Float32Array([
			0.1, 0, 0,
			1.0, 0, 0,
			1.1, 0, 0,
			2.2, 0, 0
		])));
		expect(Array.from(filtered.flow)).toEqual(Array.from(new Float32Array([
			1, 0, 0,
			3, 0, 0,
			4, 0, 0,
			6, 0, 0
		])));
	});

	test('getRadialDensityProfile becomes more aggressive as the camera gets closer', async () => {
		vi.stubGlobal('self', { postMessage: vi.fn() });
		const mod = await import('./orbital.worker');

		expect(mod.getRadialDensityProfile(4).key).toBe('close');
		expect(mod.getRadialDensityProfile(8).key).toBe('mid');
		expect(mod.getRadialDensityProfile(18).key).toBe('far');
	});

});
