<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { orbitalState } from '$lib/stores/obital.svelte';
	import { perspective, lookAt } from '$lib/render_math';

	import {
		STATUS_FINISHED,
		STATUS_PROCESSING,
		STATUS_ERROR,
		STATUS_IDLE
	} from '$lib/worker_states';

	let canvas: HTMLCanvasElement;
	let gl: WebGL2RenderingContext;
	let animFrameId: number;

	let uProj: WebGLUniformLocation | null = null;
	let uView: WebGLUniformLocation | null = null;
	let uT: WebGLUniformLocation | null = null;

	let worker: Worker;

	let worker_state = $state(STATUS_IDLE);
	let worker_progress = $state(0);

	let show_loading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout>;
	let debounceTimer: ReturnType<typeof setTimeout>;

	// Each chunk gets its own VAO and independent transition t.
	type ChunkVao = {
		vao: WebGLVertexArrayObject;
		pointCount: number;
		t: number;
	};

	let chunks: ChunkVao[] = [];

	// Snapshot of the full old cloud at job-start, used for pairing new chunks against.
	let oldPoints: Float32Array = new Float32Array(0);
	// Accumulates chunks for the current job so we can snapshot them for the next job.
	let collectedPoints: number[] = [];

	let transitionDuration = 0.8;
	let lastFrameTime = 0;

	let currentJobId = 0;
	let rotationSpeed = 0.0035;

	let nMax = 5;
	let nMin = 1;

	let n = $derived(orbitalState.n);
	let l = $derived(orbitalState.l);
	let m = $derived(orbitalState.m);

	// Clamp l into [0, n-1] when n changes.
	$effect(() => {
		const maxL = orbitalState.n - 1;
		if (orbitalState.l > maxL) orbitalState.l = maxL;
	});

	// Clamp m into [-l, l] when l changes.
	$effect(() => {
		if (orbitalState.m > orbitalState.l) orbitalState.m = orbitalState.l;
		if (orbitalState.m < -orbitalState.l) orbitalState.m = -orbitalState.l;
	});

	// Debounce worker restarts when quantum numbers change.
	$effect(() => {
		const _n = n,
			_l = l,
			_m = m;
		if (!worker) return;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			startWorker(_n, _l, _m);
		}, 100);
	});

	// Only show the loading bar if processing takes a noticeable amount of time.
	$effect(() => {
		if (worker_state === STATUS_PROCESSING) {
			loadingTimer = setTimeout(() => {
				show_loading = true;
			}, 150);
		} else {
			clearTimeout(loadingTimer);
			show_loading = false;
		}
	});

	$effect(() => {
		if (worker_progress >= 0.95) {
			clearTimeout(loadingTimer);
			show_loading = false;
		}
	});

	const vs = `#version 300 es
precision highp float;
layout(location=0) in vec3 prevPosition;
layout(location=1) in vec3 nextPosition;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uT;
void main() {
  vec3 pos = mix(prevPosition, nextPosition, uT);
  gl_Position = uProj * uView * vec4(pos, 1.0);
  gl_PointSize = 3.0;
}`;

	const fs = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.0, d);
  fragColor = vec4(0.8902, 0.4235, 0.0784, alpha);
}`;

	function createShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
			console.error(gl.getShaderInfoLog(s));
			throw new Error('Could not compile shader');
		}
		return s;
	}

	function createProgram(
		gl: WebGL2RenderingContext,
		vertSrc: string,
		fragSrc: string
	): WebGLProgram {
		const prog = gl.createProgram()!;
		gl.attachShader(prog, createShader(gl, gl.VERTEX_SHADER, vertSrc));
		gl.attachShader(prog, createShader(gl, gl.FRAGMENT_SHADER, fragSrc));
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error(gl.getProgramInfoLog(prog));
			throw new Error('Could not link program');
		}
		return prog;
	}

	// Randomly permutes point triples via Fisher-Yates and returns a copy.
	function shuffleFloat32(arr: Float32Array): Float32Array {
		const n = arr.length / 3;
		const out = arr.slice();
		for (let i = n - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			for (let k = 0; k < 3; k++) {
				const tmp = out[i * 3 + k];
				out[i * 3 + k] = out[j * 3 + k];
				out[j * 3 + k] = tmp;
			}
		}
		return out;
	}

	// Builds a VAO with prevPosition at location 0 and nextPosition at location 1.
	function buildTransitionVao(prev: Float32Array, next: Float32Array): WebGLVertexArrayObject {
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);

		const prevBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
		gl.bufferData(gl.ARRAY_BUFFER, prev, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

		const nextBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, nextBuf);
		gl.bufferData(gl.ARRAY_BUFFER, next, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);
		return vao;
	}

	// Returns a randomly sampled slice of `count` points from arr.
	function randomSlice(arr: Float32Array, count: number): Float32Array {
		return shuffleFloat32(arr).slice(0, count * 3);
	}

	async function initWebWorker() {
		if (!browser) return;

		if (window.Worker) {
			const OrbitalWorker = await import('../orbital.worker.ts?worker');
			worker = new OrbitalWorker.default();
			startWorker(orbitalState.n, orbitalState.l, orbitalState.m);

			worker.onmessage = (
				e: MessageEvent<{
					status: string;
					progress?: number;
					points?: Float32Array;
					message?: string;
					jobId: number;
				}>
			) => {
				const { status, progress, points, message, jobId } = e.data;

				if (jobId !== currentJobId) return;

				if (status === STATUS_PROCESSING) {
					worker_state = STATUS_PROCESSING;
					worker_progress = progress ?? 0;
					if (points && points.length > 0) {
						collectedPoints.push(...points);

						const chunkPointCount = points.length / 3;
						const prev =
							oldPoints.length >= points.length ? randomSlice(oldPoints, chunkPointCount) : points;

						const vao = buildTransitionVao(prev, points);
						const newChunk = { vao, pointCount: chunkPointCount, t: 0.0 };

						// First chunk of this job — now it's safe to drop the old cloud.
						if (collectedPoints.length / 3 <= chunkPointCount) {
							chunks = [newChunk];
						} else {
							chunks.push(newChunk);
						}
					}
				} else if (status === STATUS_FINISHED) {
					// Snapshot the full collected cloud for pairing on the next job.
					oldPoints = new Float32Array(collectedPoints);
					worker_state = STATUS_FINISHED;
				} else if (status === STATUS_ERROR) {
					console.error('Worker error:', message);
					worker_state = STATUS_ERROR;
				}
			};
		}
	}

	function startWorker(n: number, l: number, m: number) {
		if (!worker) return;

		currentJobId++;
		oldPoints = new Float32Array(collectedPoints);
		collectedPoints = [];
		// Don't clear chunks here — let the old cloud keep rendering

		worker_state = STATUS_IDLE;
		worker.postMessage({ n, l, m, count: 6_500, jobId: currentJobId });
	}

	onMount(() => {
		initWebWorker();

		gl = canvas.getContext('webgl2')!;

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const program = createProgram(gl, vs, fs);
		gl.useProgram(program);

		uProj = gl.getUniformLocation(program, 'uProj');
		uView = gl.getUniformLocation(program, 'uView');
		uT = gl.getUniformLocation(program, 'uT');

		const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
		gl.uniformMatrix4fv(uProj, false, proj);
		gl.uniform1f(uT, 1.0);

		let angle = rotationSpeed;
		lastFrameTime = performance.now();

		function render(now: number) {
			const dt = (now - lastFrameTime) / 1000;
			lastFrameTime = now;

			if (canvas.clientWidth !== canvas.width || canvas.clientHeight !== canvas.height) {
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				gl.viewport(0, 0, canvas.width, canvas.height);
				const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
				gl.uniformMatrix4fv(uProj, false, proj);
			}

			angle += rotationSpeed;
			const eye = { x: Math.cos(angle) * 40, y: 20, z: Math.sin(angle) * 40 };
			const view = lookAt(eye, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
			gl.uniformMatrix4fv(uView, false, view);

			gl.clearColor(0.051, 0.052, 0.061, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			for (const chunk of chunks) {
				chunk.t = Math.min(1.0, chunk.t + dt / transitionDuration);
				const eased = chunk.t * chunk.t * (3.0 - 2.0 * chunk.t);
				gl.uniform1f(uT, eased);
				gl.bindVertexArray(chunk.vao);
				gl.drawArrays(gl.POINTS, 0, chunk.pointCount);
			}

			animFrameId = requestAnimationFrame(render);
		}

		animFrameId = requestAnimationFrame(render);
	});

	onDestroy(() => {
		//cancelAnimationFrame(animFrameId);
		worker?.terminate();
	});
</script>

<div class="relative h-dvh w-full text-zinc-300">
	<!-- Loading Bar
	{#if show_loading}
		<div class="absolute bottom-1/2 left-1/2 -translate-x-1/2 -translate-y-5 text-2xl">
			Loading <strong>Atom</strong>
		</div>
		<div
			class="absolute bottom-1/2 left-1/2 h-2 w-48 -translate-x-1/2 overflow-hidden bg-[#1a1b1e]"
		>
			<div
				class="h-full bg-[#dc5719] transition-[width] duration-100 ease-linear"
				style="width: {worker_progress * 100}%"
			></div>
		</div>
	{/if}
	-->

	<!-- Controls -->
	<div
		class="absolute top-5 left-5 flex flex-col space-y-5 sm:top-10 sm:left-10 sm:text-xl md:top-10 md:left-10 md:text-2xl"
	>
		<div class="flex flex-col space-y-2">
			<span>n: {orbitalState.n}</span>
			<input type="range" min={nMin} max={nMax} step="1" bind:value={orbitalState.n} />
		</div>

		{#if orbitalState.n > 1}
			<div class="flex flex-col space-y-2">
				<span>l: {orbitalState.l}</span>
				<input type="range" min="0" max={orbitalState.n - 1} step="1" bind:value={orbitalState.l} />
			</div>

			{#if orbitalState.l > 0}
				<div class="flex flex-col space-y-2">
					<span>m: {orbitalState.m}</span>
					<input
						type="range"
						min={-orbitalState.l}
						max={orbitalState.l}
						step="1"
						bind:value={orbitalState.m}
					/>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Rendering canvas -->
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>
