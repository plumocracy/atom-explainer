import { probabilityDensity } from './orbital';
import { STATUS_FINISHED, STATUS_PROCESSING, STATUS_ERROR } from '$lib/worker_states';

declare var self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<{ n: number; l: number; m: number; count: number }>) => {
	const { n, l, m, count } = e.data;
	self.postMessage({ status: STATUS_PROCESSING });
	samplePoints(n, l, m, count);
};

function samplePoints(n: number, l: number, m: number, count: number) {
	console.log(`Sampling n:${n}, l:${l}, m:${m}`);
	const points: number[] = [];

	const totalPoints = count * 3;
	let iterations = 0;

	while (points.length < totalPoints) {
		iterations++;
		const r = Math.random() * 20;
		const theta = Math.acos(1 - 2 * Math.random());
		const phi = 2 * Math.PI * Math.random();

		const p = probabilityDensity(n, l, m, r, theta, phi);

		// rejection sampling
		if (Math.random() < p * 50) {
			const x = r * Math.sin(theta) * Math.cos(phi);
			const y = r * Math.sin(theta) * Math.sin(phi);
			const z = r * Math.cos(theta);

			points.push(x, y, z);
		}
		if (iterations % 1000 === 0) {
			self.postMessage({ status: STATUS_PROCESSING, progress: points.length / totalPoints });
		}
	}


	const floatPoints = new Float32Array(points);

	self.postMessage({ status: STATUS_FINISHED, points: floatPoints }, { transfer: [floatPoints.buffer] });
}
