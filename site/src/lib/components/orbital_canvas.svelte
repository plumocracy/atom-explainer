<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { orbitalState } from '$lib/stores/obital.svelte';
	import { perspective, lookAt, type vector3 } from '$lib/render_math';

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

	let worker: Worker;
	let pointCount = 0;

	let worker_state = $state(STATUS_IDLE);
	let worker_progress = $state();

	let show_loading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout>;

	let debounceTimer: ReturnType<typeof setTimeout>;

	// Needed to keep rendering when background job is gonig.
	let displayPointCount = $state(0);
	let displayVao: WebGLVertexArrayObject | null = null;

	let currentJobId = 0;

	// TODO: Make this modifiable?
	let rotationSpeed = 0.0035;

	let n = $derived(orbitalState.n);
	let l = $derived(orbitalState.l);
	let m = $derived(orbitalState.m);

	let nMax = 5;
	let nMin = 1;

	// Handle updaing the simulation values whenever the gloabal n, l, and m state changes.
	$effect(() => {
		const _n = n,
			_l = l,
			_m = m; // force tracking

		if (!worker) return;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			const clamped = clampQuantumNumbers(_n, _l, _m);
			startWorker(clamped.n, clamped.l, clamped.m);
		}, 100);
	});

	// Only show the loading bar if a signifigant amount of time has passed.
	$effect(() => {
		if (worker_state === STATUS_PROCESSING) {
			loadingTimer = setTimeout(() => {
				show_loading = true;
			}, 150); // only show if loading takes longer than 250ms
		} else {
			clearTimeout(loadingTimer);
			show_loading = false;
		}
	});

	// "Dont show the progress bar if its nearly done" effect
	$effect(() => {
		if (worker_progress >= 0.95) {
			clearTimeout(loadingTimer);
			show_loading = false;
		}
	});

	const vs = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
uniform mat4 uProj;
uniform mat4 uView;
void main() {
  gl_Position = uProj * uView * vec4(position, 1.0);
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

	// Ensures that the quantum numbers provided are valid, stops a crash from occuring.
	function clampQuantumNumbers(
		n: number,
		l: number,
		m: number
	): { n: number; l: number; m: number } {
		// n must be a positive integer between 1 and 5
		const clampedN = Math.min(Math.max(nMin, Math.round(n)), nMax);

		// l must be in range [0, n-1]
		const clampedL = Math.min(Math.max(0, Math.round(l)), clampedN - 1);

		// m must be in range [-l, l]
		const clampedM = Math.min(Math.max(-clampedL, Math.round(m)), clampedL);

		return { n: clampedN, l: clampedL, m: clampedM };
	}

	async function initWebWorker() {
		if (!browser) {
			return;
		}
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

				if (jobId !== currentJobId) {
					return;
				}

				if (status === STATUS_PROCESSING) {
					worker_state = STATUS_PROCESSING;
					worker_progress = progress;
				} else if (status === STATUS_FINISHED) {
					if (!points) {
						console.error('No points returned! ' + points);
						return;
					}

					pointCount = points.length / 3;

					const buf = gl.createBuffer()!;
					gl.bindBuffer(gl.ARRAY_BUFFER, buf);
					gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);

					const vao = gl.createVertexArray()!;
					gl.bindVertexArray(vao);

					gl.enableVertexAttribArray(0);
					gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
					gl.bindVertexArray(null);

					displayVao = vao;
					displayPointCount = points.length / 3;

					worker_state = STATUS_FINISHED;
				} else if (status === STATUS_ERROR) {
					console.error('Worker error:', message);
				}
			};
		}
	}

	function startWorker(n: number, l: number, m: number) {
		if (!worker) {
			console.error('Cannot generate points without worker');
			return;
		}

		currentJobId++; // invalidate previous job
		const jobId = currentJobId;

		worker_state = STATUS_IDLE;

		worker.postMessage({ n, l, m, count: 6_500, jobId });
	}

	onMount(() => {
		initWebWorker();

		gl = canvas.getContext('webgl2')!;

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

		gl.viewport(0, 0, canvas.width, canvas.height);

		// This is used to get that "matte" look on the particles.
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const program = createProgram(gl, vs, fs);
		gl.useProgram(program);

		uProj = gl.getUniformLocation(program, 'uProj');
		uView = gl.getUniformLocation(program, 'uView');

		const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
		gl.uniformMatrix4fv(uProj, false, proj);

		let angle = rotationSpeed;

		function render() {
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

			if (displayVao) {
				gl.bindVertexArray(displayVao);
				gl.drawArrays(gl.POINTS, 0, displayPointCount);
			}

			animFrameId = requestAnimationFrame(render);
		}

		render();
	});

	onDestroy(() => {
		worker?.terminate();
	});
</script>

<div class="relative h-dvh w-full text-zinc-300">
	<!-- Loading Bar -->
	{#if show_loading}
		<div class="absolute bottom-1/2 left-1/2 -translate-x-1/2 -translate-y-5 text-2xl">
			Loading <strong class="">Atom</strong>
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

	<!-- Controls -->
	<div
		class="absolute top-5 left-5 flex flex-col space-y-5 sm:top-10 sm:left-10 sm:text-xl md:top-10 md:left-10 md:text-2xl"
	>
		<!-- Theres a bunch of logic in here that handles keeping the sliders in sync with each other -->
		<!-- The general rule is this: (n >= 1 <= 5) (l >= 0 <= n-1)  (m >= -l <= l) -->
		<!-- if you keep those in mind, all the special value min maxes make a lot of sense. -->
		<div class="flex flex-col space-y-2">
			<span>n: {orbitalState.n}</span>
			<input
				type="range"
				min={nMin}
				max={nMax}
				step="1"
				bind:value={orbitalState.n}
				onchange={() => console.log('slider change: ' + orbitalState.n)}
			/>
		</div>
		<!-- Only show L if it is modifiable -->
		{#if orbitalState.n > 1}
			<div class="flex flex-col space-y-2">
				<span>l: {orbitalState.l}</span>
				<input type="range" min="0" max={orbitalState.n - 1} step="1" bind:value={orbitalState.l} />
			</div>

			<!-- Only show M if it is modifiable -->
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
