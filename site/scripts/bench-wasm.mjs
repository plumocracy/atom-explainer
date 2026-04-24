#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { auto_rejection_scale, sample_batch } from '../orbital-math/pkg/orbital_math.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_CASES = [
	[1, 0, 0],
	[2, 0, 0],
	[2, 1, 0],
	[3, 2, 1],
	[5, 0, 0],
	[5, 4, 0],
];

function parseArgs(argv) {
	const opts = {
		points: 6500,
		batch: 500,
		repeats: 5,
		warmup: 1,
		rmax: 20,
		fixedScale: 50,
		scaleCap: 0,
		cases: DEFAULT_CASES,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];

		if (arg === '--points' && next) {
			opts.points = Number(next);
			i++;
		} else if (arg === '--batch' && next) {
			opts.batch = Number(next);
			i++;
		} else if (arg === '--repeats' && next) {
			opts.repeats = Number(next);
			i++;
		} else if (arg === '--warmup' && next) {
			opts.warmup = Number(next);
			i++;
		} else if (arg === '--rmax' && next) {
			opts.rmax = Number(next);
			i++;
		} else if (arg === '--fixed-scale' && next) {
			opts.fixedScale = Number(next);
			i++;
		} else if (arg === '--scale-cap' && next) {
			opts.scaleCap = Number(next);
			i++;
		} else if (arg === '--cases' && next) {
			opts.cases = next
				.split(';')
				.map((triple) => triple.split(',').map((v) => Number(v.trim())))
				.filter((vals) => vals.length === 3 && vals.every((v) => Number.isFinite(v)));
			i++;
		} else if (arg === '--help' || arg === '-h') {
			printHelp();
			process.exit(0);
		}
	}

	return opts;
}

function printHelp() {
	console.log(`Usage: node scripts/bench-wasm.mjs [options]

Options:
  --points <n>        Total points per run (default: 6500)
  --batch <n>         Batch size (default: 500)
  --repeats <n>       Timed runs per orbital (default: 5)
  --warmup <n>        Warmup runs per orbital (default: 1)
  --rmax <n>          r_max passed to WASM (default: 20)
  --fixed-scale <n>   Fixed rejection scale baseline (default: 50)
  --scale-cap <n>     Cap for auto scale; 0 means uncapped (default: 0)
  --cases <list>      Semicolon-separated triples, e.g. 1,0,0;2,1,0
  --help, -h          Show this help
`);
}

function mean(values) {
	return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function runWorkerStyle(n, l, m, points, batch, rmax, scale) {
	let produced = 0;

	while (produced < points) {
		const need = Math.min(batch, points - produced);
		const chunk = sample_batch(n, l, m, need, rmax, scale);
		const got = Math.floor(chunk.length / 3);
		if (got <= 0) {
			throw new Error(`WASM returned empty batch for (${n},${l},${m})`);
		}
		produced += got;
	}
}

function formatMs(ms) {
	return `${ms.toFixed(2)} ms`;
}

function pad(value, width) {
	return String(value).padEnd(width, ' ');
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	const wasmPath = resolve(__dirname, '../orbital-math/pkg/orbital_math_bg.wasm');
	const wasmBytes = readFileSync(wasmPath);
	await init({ module_or_path: new WebAssembly.Module(wasmBytes) });

	console.log('WASM benchmark');
	console.log(
		`points=${opts.points}, batch=${opts.batch}, repeats=${opts.repeats}, warmup=${opts.warmup}, rmax=${opts.rmax}`
	);
	console.log(`fixedScale=${opts.fixedScale}, autoScaleCap=${opts.scaleCap}`);
	console.log('');

	const headers = ['orbital', 'fixed avg', 'auto avg', 'speedup'];
	console.log(
		`${pad(headers[0], 10)} ${pad(headers[1], 12)} ${pad(headers[2], 12)} ${pad(headers[3], 10)}`
	);
	console.log('-'.repeat(50));

	for (const [n, l, m] of opts.cases) {
		for (let i = 0; i < opts.warmup; i++) {
			runWorkerStyle(n, l, m, opts.points, opts.batch, opts.rmax, opts.fixedScale);
			const warmScale = auto_rejection_scale(n, l, m, opts.rmax, opts.scaleCap);
			const warmEffective = warmScale > 0 ? warmScale : opts.fixedScale;
			runWorkerStyle(n, l, m, opts.points, opts.batch, opts.rmax, warmEffective);
		}

		const fixedTimes = [];
		for (let i = 0; i < opts.repeats; i++) {
			const t0 = performance.now();
			runWorkerStyle(n, l, m, opts.points, opts.batch, opts.rmax, opts.fixedScale);
			fixedTimes.push(performance.now() - t0);
		}

		const autoTimes = [];
		for (let i = 0; i < opts.repeats; i++) {
			const t0 = performance.now();
			const tuned = auto_rejection_scale(n, l, m, opts.rmax, opts.scaleCap);
			const effectiveScale = tuned > 0 ? tuned : opts.fixedScale;
			runWorkerStyle(n, l, m, opts.points, opts.batch, opts.rmax, effectiveScale);
			autoTimes.push(performance.now() - t0);
		}

		const fixedAvg = mean(fixedTimes);
		const autoAvg = mean(autoTimes);
		const speedup = fixedAvg / autoAvg;

		const label = `${n}${l}${m}`;
		console.log(
			`${pad(label, 10)} ${pad(formatMs(fixedAvg), 12)} ${pad(formatMs(autoAvg), 12)} ${pad(`${speedup.toFixed(2)}x`, 10)}`
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
