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
});
