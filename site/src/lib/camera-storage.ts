import { browser } from '$app/environment';

export type CameraPose = {
	azimuth: number;
	elevation: number;
	radius: number;
};

type CameraLimits = {
	minElevation: number;
	maxElevation: number;
	minRadius: number;
	maxRadius: number;
};

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

export const loadCameraPose = (
	storageKey: string,
	fallback: CameraPose,
	limits: CameraLimits
): CameraPose => {
	if (!browser) {
		return fallback;
	}

	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) {
			return fallback;
		}

		const parsed = JSON.parse(raw) as Partial<CameraPose>;
		if (
			!isFiniteNumber(parsed.azimuth) ||
			!isFiniteNumber(parsed.elevation) ||
			!isFiniteNumber(parsed.radius)
		) {
			return fallback;
		}

		return {
			azimuth: parsed.azimuth,
			elevation: clamp(parsed.elevation, limits.minElevation, limits.maxElevation),
			radius: clamp(parsed.radius, limits.minRadius, limits.maxRadius),
		};
	} catch {
		return fallback;
	}
};

export const saveCameraPose = (storageKey: string, pose: CameraPose): void => {
	if (!browser) {
		return;
	}

	try {
		localStorage.setItem(storageKey, JSON.stringify(pose));
	} catch {
		// no-op: localStorage may be unavailable in private mode/quota edge-cases
	}
};
