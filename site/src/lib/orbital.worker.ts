import { STATUS_FINISHED, STATUS_PROCESSING, STATUS_ERROR } from '$lib/worker_states';
import init, { auto_rejection_scale, sample_batch } from '../../orbital-math/pkg/orbital_math.js';
import wasmUrl from '../../orbital-math/pkg/orbital_math_bg.wasm?url';
declare var self: DedicatedWorkerGlobalScope;

let ready: Promise<void> | null = null;

const DEFAULT_BATCH_SIZE = 500;
const R_MAX = 20.0;
const REJECTION_SCALE_CAP = 0.0;
const REJECTION_SCALE_FALLBACK = 50.0;

const initWasm = () => {
	if (!ready) ready = init({ module_or_path: wasmUrl }).then(() => { });
	return ready;
};

self.onmessage = async (e: MessageEvent) => {
	await initWasm();

	const { n, l, m, count, batchSize, jobId } = e.data;
	const tunedScale = auto_rejection_scale(n, l, m, R_MAX, REJECTION_SCALE_CAP);
	const effectiveScale = tunedScale > 0 ? tunedScale : REJECTION_SCALE_FALLBACK;
	const effectiveBatchSize = Math.max(
		1,
		Math.min(
			count,
			Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : DEFAULT_BATCH_SIZE
		)
	);

	let totalCollected = 0;

	while (totalCollected < count) {
		const remaining = count - totalCollected;
		const batchCount = Math.min(effectiveBatchSize, remaining);

		const chunk = sample_batch(n, l, m, batchCount, R_MAX, effectiveScale);
		const produced = chunk.length / 3;
		if (produced <= 0) {
			self.postMessage({
				status: STATUS_ERROR,
				message: 'WASM returned an empty point batch',
				jobId,
			});
			return;
		}

		totalCollected += produced;

		self.postMessage(
			{
				status: STATUS_PROCESSING,
				progress: Math.min(1, totalCollected / count),
				points: chunk,
				jobId,
			},
			{ transfer: [chunk.buffer] }
		);
	}

	self.postMessage({ status: STATUS_FINISHED, jobId });
};
