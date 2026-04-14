<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { orbitalState } from '$lib/stores/obital.svelte';

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
	let pointData;

	let worker_state = $state(STATUS_IDLE);
	let worker_progress = $state();

	let show_loading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout>;

	let debounceTimer: ReturnType<typeof setTimeout>;

	let displayPointCount = $state(0);
	let displayVao: WebGLVertexArrayObject | null = null;

	let currentJobId = 0;

	let n = $derived(orbitalState.n);
	let l = $derived(orbitalState.l);
	let m = $derived(orbitalState.m);

	$effect(() => {
		const _n = n,
			_l = l,
			_m = m; // force tracking

		if (!worker) return;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			const clamped = clampQuantumNumbers(_n, _l, _m);
			startWorker(clamped.n, clamped.l, clamped.m);
		}, 200);
	});

	// Only show the loading bar if a signifigant amount of time has passed.
	$effect(() => {
		if (worker_state === STATUS_PROCESSING) {
			loadingTimer = setTimeout(() => {
				show_loading = true;
			}, 250); // only show if loading takes longer than 150ms
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

	function sub(a: number[], b: number[]) {
		return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
	}

	function cross(a: number[], b: number[]) {
		return [
			a[1]! * b[2]! - a[2]! * b[1]!,
			a[2]! * b[0]! - a[0]! * b[2]!,
			a[0]! * b[1]! - a[1]! * b[0]!
		];
	}

	function dot(a: number[], b: number[]) {
		return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
	}

	function normalize(v: number[]) {
		const l = Math.hypot(...v);
		return v.map((x) => x / l);
	}

	function perspective(fov: number, aspect: number, near: number, far: number) {
		const f = 1 / Math.tan(fov / 2);
		return new Float32Array([
			f / aspect,
			0,
			0,
			0,
			0,
			f,
			0,
			0,
			0,
			0,
			(far + near) / (near - far),
			-1,
			0,
			0,
			(2 * far * near) / (near - far),
			0
		]);
	}

	function lookAt(eye: number[], center: number[], up: number[]) {
		const z = normalize(sub(eye, center));
		const x = normalize(cross(up, z));
		const y = cross(z, x);
		return new Float32Array([
			x[0]!,
			y[0]!,
			z[0]!,
			0,
			x[1]!,
			y[1]!,
			z[1]!,
			0,
			x[2]!,
			y[2]!,
			z[2]!,
			0,
			-dot(x, eye),
			-dot(y, eye),
			-dot(z, eye),
			1
		]);
	}

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
		const clampedN = Math.min(Math.max(1, Math.round(n)), 5);

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
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const program = createProgram(gl, vs, fs);
		gl.useProgram(program);

		uProj = gl.getUniformLocation(program, 'uProj');
		uView = gl.getUniformLocation(program, 'uView');

		const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
		gl.uniformMatrix4fv(uProj, false, proj);

		let angle = 0.1;

		function render() {
			if (canvas.clientWidth !== canvas.width || canvas.clientHeight !== canvas.height) {
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				gl.viewport(0, 0, canvas.width, canvas.height);
				const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
				gl.uniformMatrix4fv(uProj, false, proj);
			}

			angle += 0.01;
			const eye = [Math.cos(angle) * 40, 20, Math.sin(angle) * 40];
			const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
			gl.uniformMatrix4fv(uView, false, view);

			gl.clearColor(0.051, 0.052, 0.061, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			if (displayVao) {
				gl.bindVertexArray(displayVao);
				gl.drawArrays(gl.POINTS, 0, displayPointCount);
				gl.bindVertexArray(null);
			}

			animFrameId = requestAnimationFrame(render);
		}

		render();
	});

	onDestroy(() => {
		worker?.terminate();
	});
</script>

<div class="relative h-dvh w-full">
	<!-- Loading Bar -->
	{#if show_loading}
		<div
			class="absolute bottom-1/2 left-1/2 -translate-x-1/2 -translate-y-5 text-2xl text-zinc-300"
		>
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
		class="absolute top-5 left-5 flex flex-col space-y-5 text-zinc-300 sm:top-10 sm:left-10 sm:text-xl md:top-10 md:left-10 md:text-2xl"
	>
		<!-- I could make these "reusable" but this is fine for now. -->
		<div class="flex flex-col space-y-2">
			<span>n: {orbitalState.n}</span>
			<input
				type="range"
				min="1"
				max="5"
				step="1"
				bind:value={orbitalState.n}
				onchange={() => console.log('slider change: ' + orbitalState.n)}
			/>
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

	<canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>
