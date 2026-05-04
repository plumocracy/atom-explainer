import init, { probability_current_velocity_cartesian } from '../../orbital-math/pkg/orbital_math.js';
import wasmUrl from '../../orbital-math/pkg/orbital_math_bg.wasm?url';

let ready: Promise<void> | null = null;

export type ProbabilityCurrentSample = {
	current: { x: number; y: number; z: number };
	velocity: { x: number; y: number; z: number };
	density: number;
};

export const initOrbitalCurrent = () => {
	if (!ready) {
		ready = init({ module_or_path: wasmUrl }).then(() => {});
	}

	return ready;
};

export const sampleProbabilityCurrentVelocity = async (
	n: number,
	l: number,
	m: number,
	x: number,
	y: number,
	z: number,
	step = 1e-3,
	densityEpsilon = 1e-8,
	velocityCap = 0
): Promise<ProbabilityCurrentSample> => {
	await initOrbitalCurrent();

	const sample = probability_current_velocity_cartesian(
		n,
		l,
		m,
		x,
		y,
		z,
		step,
		densityEpsilon,
		velocityCap
	);

	return {
		current: { x: sample[0], y: sample[1], z: sample[2] },
		velocity: { x: sample[3], y: sample[4], z: sample[5] },
		density: sample[6]
	};
};

export const getProbabilityCurrentVelocity = (
	n: number,
	l: number,
	m: number,
	x: number,
	y: number,
	z: number,
	step = 1e-3,
	densityEpsilon = 1e-8,
	velocityCap = 0
): ProbabilityCurrentSample => {
	const sample = probability_current_velocity_cartesian(
		n,
		l,
		m,
		x,
		y,
		z,
		step,
		densityEpsilon,
		velocityCap
	);

	return {
		current: { x: sample[0], y: sample[1], z: sample[2] },
		velocity: { x: sample[3], y: sample[4], z: sample[5] },
		density: sample[6]
	};
};
