import { STATUS_FINISHED, STATUS_PROCESSING, STATUS_ERROR } from '$lib/worker_states';
import init, {
	advance_batch_complex_flow,
	auto_rejection_scale_complex,
	sample_batch_complex_flow
} from '../../orbital-math/pkg/orbital_math.js';
import wasmUrl from '../../orbital-math/pkg/orbital_math_bg.wasm?url';
declare var self: DedicatedWorkerGlobalScope;

let ready: Promise<void> | null = null;

const R_MAX = 80.0;
const REJECTION_SCALE_CAP = 0.0;
const REJECTION_SCALE_FALLBACK = 50.0;
const FLOW_STEP_SECONDS = 0.12;
const FLOW_STEP_INTERVAL_MS = 16;
const FAST_INITIAL_POINT_COUNT = 12_000;

type RadialBandLimit = {
	maxRadius: number;
	maxPoints: number;
};

type RadialDensityProfile = {
	key: string;
	innerBands: RadialBandLimit[];
};

const RADIAL_DENSITY_PROFILES: Array<{ maxCameraRadius: number; profile: RadialDensityProfile }> = [
	{
		maxCameraRadius: 5,
		profile: {
			key: 'close',
			innerBands: [{ maxRadius: 0.45, maxPoints: 360 }]
		}
	},
	{
		maxCameraRadius: 10,
		profile: {
			key: 'mid',
			innerBands: [{ maxRadius: 0.45, maxPoints: 720 }]
		}
	},
	{
		maxCameraRadius: Number.POSITIVE_INFINITY,
		profile: {
			key: 'far',
			innerBands: [{ maxRadius: 0.45, maxPoints: 1400 }]
		}
	}
];

let activeJobId = 0;

type FlowChunk = {
	points: Float32Array;
	flow: Float32Array;
};

const decodeFlowChunk = (chunk: Float32Array): FlowChunk => {
	const produced = chunk.length / 6;
	const points = new Float32Array(produced * 3);
	const flow = new Float32Array(produced * 3);
	for (let index = 0; index < produced; index++) {
		const srcOffset = index * 6;
		const dstOffset = index * 3;
		points[dstOffset] = chunk[srcOffset];
		points[dstOffset + 1] = chunk[srcOffset + 1];
		points[dstOffset + 2] = chunk[srcOffset + 2];
		flow[dstOffset] = chunk[srcOffset + 3];
		flow[dstOffset + 1] = chunk[srcOffset + 4];
		flow[dstOffset + 2] = chunk[srcOffset + 5];
	}
	return { points, flow };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getRadialDensityProfile = (cameraRadius: number): RadialDensityProfile => {
	for (const entry of RADIAL_DENSITY_PROFILES) {
		if (cameraRadius <= entry.maxCameraRadius) {
			return entry.profile;
		}
	}

	return RADIAL_DENSITY_PROFILES[RADIAL_DENSITY_PROFILES.length - 1].profile;
};

export const applyRadialBandCaps = (
	chunk: FlowChunk,
	profile: RadialDensityProfile,
	bandOccupancy: number[]
): FlowChunk => {
	const keptPointOffsets: number[] = [];

	for (let pointIndex = 0; pointIndex < chunk.points.length; pointIndex += 3) {
		const x = chunk.points[pointIndex];
		const y = chunk.points[pointIndex + 1];
		const z = chunk.points[pointIndex + 2];
		const radius = Math.hypot(x, y, z);

		let keepPoint = true;
		for (let bandIndex = 0; bandIndex < profile.innerBands.length; bandIndex++) {
			const band = profile.innerBands[bandIndex];
			if (radius > band.maxRadius) {
				continue;
			}

			if (bandOccupancy[bandIndex] >= band.maxPoints) {
				keepPoint = false;
			} else {
				bandOccupancy[bandIndex] += 1;
			}
			break;
		}

		if (keepPoint) {
			keptPointOffsets.push(pointIndex);
		}
	}

	if (keptPointOffsets.length * 3 === chunk.points.length) {
		return {
			points: chunk.points.slice(),
			flow: chunk.flow.slice()
		};
	}

	const filteredPoints = new Float32Array(keptPointOffsets.length * 3);
	const filteredFlow = new Float32Array(keptPointOffsets.length * 3);
	for (let keptIndex = 0; keptIndex < keptPointOffsets.length; keptIndex++) {
		const srcOffset = keptPointOffsets[keptIndex];
		const dstOffset = keptIndex * 3;
		filteredPoints[dstOffset] = chunk.points[srcOffset];
		filteredPoints[dstOffset + 1] = chunk.points[srcOffset + 1];
		filteredPoints[dstOffset + 2] = chunk.points[srcOffset + 2];
		filteredFlow[dstOffset] = chunk.flow[srcOffset];
		filteredFlow[dstOffset + 1] = chunk.flow[srcOffset + 1];
		filteredFlow[dstOffset + 2] = chunk.flow[srcOffset + 2];
	}

	return {
		points: filteredPoints,
		flow: filteredFlow
	};
};

const sampleChunk = (n: number, l: number, m: number, pointCount: number, effectiveScale: number) =>
	decodeFlowChunk(sample_batch_complex_flow(n, l, m, pointCount, R_MAX, effectiveScale));

export const initWasm = () => {
	if (!ready) {
		ready = init({ module_or_path: wasmUrl })
			.then(() => {})
			.catch((error) => {
				ready = null;
				throw error;
			});
	}

	return ready;
};

self.onmessage = async (e: MessageEvent) => {
	await initWasm();

	const { n, l, m, count, slotCount, cameraRadius, progressiveHydration, jobId } = e.data;
	activeJobId = jobId;
	const tunedScale = auto_rejection_scale_complex(n, l, m, R_MAX, REJECTION_SCALE_CAP);
	const effectiveScale = tunedScale > 0 ? tunedScale : REJECTION_SCALE_FALLBACK;
	const radialDensityProfile = getRadialDensityProfile(
		Number.isFinite(cameraRadius) ? cameraRadius : Number.POSITIVE_INFINITY
	);
	const effectiveSlotCount = Math.max(
		1,
		Number.isFinite(slotCount) && slotCount > 0 ? Math.floor(slotCount) : 1
	);
	const shouldProgressivelyHydrate = Boolean(progressiveHydration);
	const initialCount = shouldProgressivelyHydrate
		? Math.min(count, FAST_INITIAL_POINT_COUNT)
		: count;
	const initialPointsPerSlot = Math.max(1, Math.ceil(initialCount / effectiveSlotCount));
	const fullPointsPerSlot = Math.max(1, Math.ceil(count / effectiveSlotCount));
	const chunks: FlowChunk[] = [];

	for (let slotIndex = 0; slotIndex < effectiveSlotCount; slotIndex++) {
		if (jobId !== activeJobId) {
			return;
		}

		const remainingInitial = initialCount - slotIndex * initialPointsPerSlot;
		if (remainingInitial <= 0) {
			break;
		}

		const visiblePointCount = Math.min(initialPointsPerSlot, remainingInitial);
		const visibleChunk = sampleChunk(n, l, m, visiblePointCount, effectiveScale);
		if (!shouldProgressivelyHydrate) {
			chunks.push({ points: visibleChunk.points.slice(), flow: visibleChunk.flow.slice() });
		}

		self.postMessage(
			{
				status: STATUS_PROCESSING,
				progress: shouldProgressivelyHydrate
					? Math.min(0.35, ((slotIndex + 1) / effectiveSlotCount) * 0.35)
					: (slotIndex + 1) / effectiveSlotCount,
				points: visibleChunk.points,
				flow: visibleChunk.flow,
				slotIndex,
				replace: false,
				jobId
			},
			{ transfer: [visibleChunk.points.buffer, visibleChunk.flow.buffer] }
		);
	}

	if (!shouldProgressivelyHydrate) {
		self.postMessage({ status: STATUS_FINISHED, jobId });

		while (jobId === activeJobId) {
			const tickStartedAt = Date.now();
			const frameBandOccupancy = radialDensityProfile.innerBands.map(() => 0);
			for (let index = 0; index < chunks.length; index++) {
				if (jobId !== activeJobId) {
					return;
				}

				const advancedChunk = decodeFlowChunk(
					advance_batch_complex_flow(
						n,
						l,
						m,
						chunks[index].points,
						FLOW_STEP_SECONDS,
						R_MAX,
						effectiveScale
					)
				);
				chunks[index] = {
					points: advancedChunk.points.slice(),
					flow: advancedChunk.flow.slice()
				};
				const filteredChunk = applyRadialBandCaps(
					advancedChunk,
					radialDensityProfile,
					frameBandOccupancy
				);

				self.postMessage(
					{
						status: STATUS_PROCESSING,
						progress: 1,
						points: filteredChunk.points,
						flow: filteredChunk.flow,
						slotIndex: index,
						replace: false,
						jobId
					},
					{ transfer: [filteredChunk.points.buffer, filteredChunk.flow.buffer] }
				);
			}

			const elapsedMs = Date.now() - tickStartedAt;
			await sleep(Math.max(0, FLOW_STEP_INTERVAL_MS - elapsedMs));
		}

		return;
	}

	const refinedChunks: FlowChunk[] = [];
	const refinementBandOccupancy = radialDensityProfile.innerBands.map(() => 0);
	for (let slotIndex = 0; slotIndex < effectiveSlotCount; slotIndex++) {
		if (jobId !== activeJobId) {
			return;
		}

		const remaining = count - slotIndex * fullPointsPerSlot;
		if (remaining <= 0) {
			break;
		}

		const refinedPointCount = Math.min(fullPointsPerSlot, remaining);
		const refinedChunk = applyRadialBandCaps(
			sampleChunk(n, l, m, refinedPointCount, effectiveScale),
			radialDensityProfile,
			refinementBandOccupancy
		);
		const produced = refinedChunk.points.length / 3;
		if (produced <= 0) {
			self.postMessage({
				status: STATUS_ERROR,
				message: 'WASM returned an empty point batch',
				jobId
			});
			return;
		}

		refinedChunks.push({ points: refinedChunk.points.slice(), flow: refinedChunk.flow.slice() });

		self.postMessage(
			{
				status: STATUS_PROCESSING,
				progress: 0.35 + ((slotIndex + 1) / effectiveSlotCount) * 0.65,
				points: refinedChunk.points,
				flow: refinedChunk.flow,
				slotIndex,
				replace: true,
				jobId
			},
			{ transfer: [refinedChunk.points.buffer, refinedChunk.flow.buffer] }
		);
	}
	chunks.push(...refinedChunks);

	self.postMessage({ status: STATUS_FINISHED, jobId });

	while (jobId === activeJobId) {
		const tickStartedAt = Date.now();
		const frameBandOccupancy = radialDensityProfile.innerBands.map(() => 0);
		for (let index = 0; index < chunks.length; index++) {
			if (jobId !== activeJobId) {
				return;
			}

			const advancedChunk = decodeFlowChunk(
				advance_batch_complex_flow(
					n,
					l,
					m,
					chunks[index].points,
					FLOW_STEP_SECONDS,
					R_MAX,
					effectiveScale
				)
			);
			chunks[index] = {
				points: advancedChunk.points.slice(),
				flow: advancedChunk.flow.slice()
			};
			const filteredChunk = applyRadialBandCaps(
				advancedChunk,
				radialDensityProfile,
				frameBandOccupancy
			);

			self.postMessage(
				{
					status: STATUS_PROCESSING,
					progress: 1,
					points: filteredChunk.points,
					flow: filteredChunk.flow,
					slotIndex: index,
					replace: false,
					jobId
				},
				{ transfer: [filteredChunk.points.buffer, filteredChunk.flow.buffer] }
			);
		}

		const elapsedMs = Date.now() - tickStartedAt;
		await sleep(Math.max(0, FLOW_STEP_INTERVAL_MS - elapsedMs));
	}
};
