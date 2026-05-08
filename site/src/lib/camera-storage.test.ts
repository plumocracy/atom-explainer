import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

import { clamp, isFiniteNumber, loadCameraPose, saveCameraPose } from './camera-storage';

describe('camera-storage', () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
			clear: () => store.clear()
		});
	});

	test('clamp bounds values', () => {
		expect(clamp(10, 0, 5)).toBe(5);
		expect(clamp(-1, 0, 5)).toBe(0);
		expect(clamp(3, 0, 5)).toBe(3);
	});

	test('isFiniteNumber guards numeric values', () => {
		expect(isFiniteNumber(1)).toBe(true);
		expect(isFiniteNumber(Infinity)).toBe(false);
		expect(isFiniteNumber('1')).toBe(false);
	});

	test('saveCameraPose and loadCameraPose persist and clamp', () => {
		saveCameraPose('k', { azimuth: 1, elevation: 20, radius: -2 });
		const loaded = loadCameraPose(
			'k',
			{ azimuth: 0, elevation: 0, radius: 0 },
			{ minElevation: -10, maxElevation: 10, minRadius: 1, maxRadius: 5 }
		);
		expect(loaded).toEqual({ azimuth: 1, elevation: 10, radius: 1 });
	});

	test('loadCameraPose falls back on invalid JSON', () => {
		localStorage.setItem('bad', '{oops');
		const fallback = { azimuth: 1, elevation: 2, radius: 3 };
		expect(
			loadCameraPose('bad', fallback, { minElevation: -1, maxElevation: 1, minRadius: 1, maxRadius: 2 })
		).toEqual(fallback);
	});
});
