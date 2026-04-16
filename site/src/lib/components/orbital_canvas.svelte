<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { perspective, lookAt } from '$lib/render_math';
	import { simulationValues } from '$lib/chat.svelte';

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

	let loadingTimer: ReturnType<typeof setTimeout>;
	let debounceTimer: ReturnType<typeof setTimeout>;

	// A chunk slot holds a VAO that is always rendering.
	// When new data arrives for this slot, prevBuf is updated to the current
	// interpolated positions and nextBuf is updated to the new points, then t resets.
	type ChunkSlot = {
		vao: WebGLVertexArrayObject;
		prevBuf: WebGLBuffer;
		nextBuf: WebGLBuffer;
		// The raw nextPosition data, kept so we can use it as prevPosition next time.
		nextPoints: Float32Array;
		pointCount: number;
		t: number;
	};

	// Fixed-size pool of slots. Initialised on first job, then reused forever.
	let slots: ChunkSlot[] = [];

	// Index of the next slot to update when a chunk arrives.
	let incomingSlotIndex = 0;

	// TODO: Make transiton duration proportional to time it took to get first buffer back
	// therefore making all transitions take the same length of time, hiding the loading
	// all together
	let transitionDuration = 0.8;
	let lastFrameTime = 0;

	let currentJobId = 0;
	let rotationSpeed = 0.0035;

	let nMax = 5;
	let nMin = 1;

	let n = $derived(simulationValues.n);
	let l = $derived(simulationValues.l);
	let m = $derived(simulationValues.m);

	// Clamp l into [0, n-1] when n changes.
	$effect(() => {
		const maxL = simulationValues.n - 1;
		if (simulationValues.l > maxL) simulationValues.l = maxL;
	});

	// Clamp m into [-l, l] when l changes.
	$effect(() => {
		if (simulationValues.m > simulationValues.l) simulationValues.m = simulationValues.l;
		if (simulationValues.m < -simulationValues.l) simulationValues.m = -simulationValues.l;
	});

	// Debounce worker restarts on quantum number changes.
	$effect(() => {
		const _n = n,
			_l = l,
			_m = m;
		if (!worker) return;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => startWorker(_n, _l, _m), 250);
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

	function sampleCurrentPositions(slot: ChunkSlot): Float32Array {
		return slot.nextPoints.slice();
	}

	// Allocates a brand-new slot with both prev and next set to the same points
	// so it appears immediately with no transition.
	function createSlot(points: Float32Array): ChunkSlot {
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);

		const prevBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
		gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

		const nextBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, nextBuf);
		gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);

		return {
			vao,
			prevBuf,
			nextBuf,
			nextPoints: points.slice(),
			pointCount: points.length / 3,
			t: 1.0 // start fully arrived
		};
	}

	// Updates an existing slot with new destination points, snapping prevPosition
	// to wherever the points currently are and resetting t to kick off a new transition.
	function updateSlot(slot: ChunkSlot, newPoints: Float32Array) {
		const currentPos = sampleCurrentPositions(slot);

		// Upload current interpolated positions as the new prevPosition.
		gl.bindBuffer(gl.ARRAY_BUFFER, slot.prevBuf);
		gl.bufferData(gl.ARRAY_BUFFER, currentPos, gl.DYNAMIC_DRAW);

		// Upload new destination as nextPosition.
		gl.bindBuffer(gl.ARRAY_BUFFER, slot.nextBuf);
		gl.bufferData(gl.ARRAY_BUFFER, newPoints, gl.DYNAMIC_DRAW);

		slot.nextPoints = newPoints;
		slot.pointCount = newPoints.length / 3;
		slot.t = 0.0;
	}

	async function initWebWorker() {
		if (!browser) return;

		if (window.Worker) {
			const OrbitalWorker = await import('../orbital.worker.ts?worker');
			worker = new OrbitalWorker.default();
			startWorker(simulationValues.n, simulationValues.l, simulationValues.m);

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
					worker_progress = progress ?? 0;

					if (points && points.length > 0) {
						const slotIndex = incomingSlotIndex % Math.max(slots.length, 1);

						if (slots.length < 13) {
							// Pool not yet full — allocate a new slot.
							slots.push(createSlot(points));
						} else {
							// Pool is full — update the slot at this index in-place.
							updateSlot(slots[slotIndex], points);
							console.log(`Slot ${slotIndex}: ${slots[slotIndex].pointCount}`);
						}

						incomingSlotIndex++;
					}
				} else if (status === STATUS_FINISHED) {
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
		incomingSlotIndex = 0; // start cycling from slot 0 again

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

			for (const slot of slots) {
				slot.t = Math.min(1.0, slot.t + dt / transitionDuration);
				const eased = slot.t * slot.t * (3.0 - 2.0 * slot.t);
				gl.uniform1f(uT, eased);
				gl.bindVertexArray(slot.vao);
				gl.drawArrays(gl.POINTS, 0, slot.pointCount);
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
	<!-- Controls -->
	<div
		class="absolute top-5 left-5 flex flex-col space-y-5 sm:top-10 sm:left-10 sm:text-xl md:top-10 md:left-10 md:text-2xl"
	>
		<div class="flex flex-col space-y-2">
			<span>n: {simulationValues.n}</span>
			<input type="range" min={nMin} max={nMax} step="1" bind:value={simulationValues.n} />
		</div>

		{#if simulationValues.n > 1}
			<div class="flex flex-col space-y-2">
				<span>l: {simulationValues.l}</span>
				<input
					type="range"
					min="0"
					max={simulationValues.n - 1}
					step="1"
					bind:value={simulationValues.l}
				/>
			</div>

			{#if simulationValues.l > 0}
				<div class="flex flex-col space-y-2">
					<span>m: {simulationValues.m}</span>
					<input
						type="range"
						min={-simulationValues.l}
						max={simulationValues.l}
						step="1"
						bind:value={simulationValues.m}
					/>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Rendering canvas -->
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>
