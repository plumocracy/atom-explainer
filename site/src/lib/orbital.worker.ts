import { STATUS_FINISHED, STATUS_PROCESSING, STATUS_ERROR } from '$lib/worker_states';
import init, {
	advance_batch_complex_flow,
	auto_rejection_scale_complex,
	sample_batch_complex_flow
} from '../../orbital-math/pkg/orbital_math.js';
import wasmUrl from '../../orbital-math/pkg/orbital_math_bg.wasm?url';
declare var self: DedicatedWorkerGlobalScope;

let ready: Promise<void> | null = null;

const DEFAULT_BATCH_SIZE = 500;
const R_MAX = 20.0;
const REJECTION_SCALE_CAP = 0.0;
const REJECTION_SCALE_FALLBACK = 50.0;
const FLOW_STEP_SECONDS = 0.32;
const FLOW_STEP_INTERVAL_MS = 33;

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

export const initWasm = () => {
	if (!ready) ready = init({ module_or_path: wasmUrl }).then(() => {});
	return ready;
};

self.onmessage = async (e: MessageEvent) => {
	await initWasm();

	const { n, l, m, count, batchSize, jobId } = e.data;
	activeJobId = jobId;
	const tunedScale = auto_rejection_scale_complex(n, l, m, R_MAX, REJECTION_SCALE_CAP);
	const effectiveScale = tunedScale > 0 ? tunedScale : REJECTION_SCALE_FALLBACK;
	const effectiveBatchSize = Math.max(
		1,
		Math.min(
			count,
			Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : DEFAULT_BATCH_SIZE
		)
	);

	let totalCollected = 0;
	const chunks: FlowChunk[] = [];

	while (totalCollected < count) {
		if (jobId !== activeJobId) {
			return;
		}

		const remaining = count - totalCollected;
		const batchCount = Math.min(effectiveBatchSize, remaining);

		const chunk = decodeFlowChunk(
			sample_batch_complex_flow(n, l, m, batchCount, R_MAX, effectiveScale)
		);
		const produced = chunk.points.length / 3;
		if (produced <= 0) {
			self.postMessage({
				status: STATUS_ERROR,
				message: 'WASM returned an empty point batch',
				jobId
			});
			return;
		}

		chunks.push({ points: chunk.points.slice(), flow: chunk.flow.slice() });
		totalCollected += produced;

		self.postMessage(
			{
				status: STATUS_PROCESSING,
				progress: Math.min(1, totalCollected / count),
				points: chunk.points,
				flow: chunk.flow,
				jobId
			},
			{ transfer: [chunk.points.buffer, chunk.flow.buffer] }
		);
	}

	self.postMessage({ status: STATUS_FINISHED, jobId });

	while (jobId === activeJobId) {
		const tickStartedAt = Date.now();
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

			self.postMessage(
				{
					status: STATUS_PROCESSING,
					progress: 1,
					points: advancedChunk.points,
					flow: advancedChunk.flow,
					jobId
				},
				{ transfer: [advancedChunk.points.buffer, advancedChunk.flow.buffer] }
			);
		}

		const elapsedMs = Date.now() - tickStartedAt;
		await sleep(Math.max(0, FLOW_STEP_INTERVAL_MS - elapsedMs));
	}
};
