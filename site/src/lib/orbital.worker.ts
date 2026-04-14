import { probabilityDensity } from './orbital';
import { STATUS_FINISHED, STATUS_PROCESSING, STATUS_ERROR } from '$lib/worker_states';
import init, { sample_batch } from '../../orbital-math/pkg/orbital_math.js';
import wasmUrl from '../../orbital-math/pkg/orbital_math_bg.wasm?url';


declare var self: DedicatedWorkerGlobalScope;

let ready: Promise<void> | null = null;

const BATCH_SIZE = 500;   // points per Rust call
const R_MAX = 20.0;
const REJECTION_SCALE = 50.0;

const initWasm = () => {
	if (!ready) ready = init({ module_or_path: wasmUrl }).then(() => { });
	return ready;
};

self.onmessage = async (e: MessageEvent) => {
	await initWasm();
	const { n, l, m, count, jobId } = e.data;

	const allPoints: number[] = [];

	while (allPoints.length < count * 3) {
		const remaining = count - Math.floor(allPoints.length / 3);
		const batchCount = Math.min(BATCH_SIZE, remaining);

		// Rust returns a Float32Array view into WASM memory
		const batch = sample_batch(n, l, m, batchCount, R_MAX, REJECTION_SCALE);
		allPoints.push(...batch);

		self.postMessage({
			status: STATUS_PROCESSING,
			progress: allPoints.length / (count * 3),
			jobId,
		});
	}

	const floatPoints = new Float32Array(allPoints);
	self.postMessage(
		{ status: STATUS_FINISHED, points: floatPoints, jobId },
		{ transfer: [floatPoints.buffer] }
	);
};
