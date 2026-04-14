import { STATUS_FINISHED, STATUS_PROCESSING, STATUS_ERROR } from '$lib/worker_states';
import init, { sample_batch } from '../../orbital-math/pkg/orbital_math.js';
import wasmUrl from '../../orbital-math/pkg/orbital_math_bg.wasm?url';
declare var self: DedicatedWorkerGlobalScope;

let ready: Promise<void> | null = null;

const BATCH_SIZE = 500;
const R_MAX = 20.0;
const REJECTION_SCALE = 50.0;

const initWasm = () => {
	if (!ready) ready = init({ module_or_path: wasmUrl }).then(() => { });
	return ready;
};

self.onmessage = async (e: MessageEvent) => {
	await initWasm();

	const { n, l, m, count, jobId } = e.data;

	let totalCollected = 0;

	while (totalCollected < count) {
		const remaining = count - totalCollected;
		const batchCount = Math.min(BATCH_SIZE, remaining);

		// Rust returns a Float32Array view into WASM memory — copy it out before
		// the next call invalidates the view.
		const batch = sample_batch(n, l, m, batchCount, R_MAX, REJECTION_SCALE);
		const chunk = new Float32Array(batch);

		totalCollected += batchCount;

		self.postMessage(
			{
				status: STATUS_PROCESSING,
				progress: totalCollected / count,
				points: chunk,
				jobId,
			},
			{ transfer: [chunk.buffer] }
		);
	}

	self.postMessage({ status: STATUS_FINISHED, jobId });
};
