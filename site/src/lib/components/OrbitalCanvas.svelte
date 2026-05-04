<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { loadCameraPose, saveCameraPose } from '$lib/camera-storage';
	import { perspective, lookAt } from '$lib/render_math';
	import { orbitalCameraState, simulationValues } from '$lib/chat.svelte';

	import {
		STATUS_FINISHED,
		STATUS_PROCESSING,
		STATUS_ERROR,
		STATUS_IDLE
	} from '$lib/worker_states';

	let canvas: HTMLCanvasElement;
	let gl: WebGL2RenderingContext;
	let animFrameId: number;
	let pointProgram: WebGLProgram | null = null;
	let lineProgram: WebGLProgram | null = null;

	let uProj: WebGLUniformLocation | null = null;
	let uView: WebGLUniformLocation | null = null;
	let uT: WebGLUniformLocation | null = null;
	let uCloudTime: WebGLUniformLocation | null = null;
	let uCloudDrift: WebGLUniformLocation | null = null;
	let uCloudPulse: WebGLUniformLocation | null = null;
	let uCloudFalloffRadius: WebGLUniformLocation | null = null;
	let uCloudMinSpeed: WebGLUniformLocation | null = null;
	let uHidePositiveQuadrant: WebGLUniformLocation | null = null;

	let lUProj: WebGLUniformLocation | null = null;
	let lUView: WebGLUniformLocation | null = null;
	let lUColor: WebGLUniformLocation | null = null;

	let worker: Worker;
	const TOTAL_POINT_COUNT = 150_000;
	const TARGET_CHUNK_SLOTS = 24;

	let worker_state = $state(STATUS_IDLE);
	let worker_progress = $state(0);

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

	type LineMesh = {
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		vertexCount: number;
	};

	// Fixed-size pool of slots. Initialised on first job, then reused forever.
	let slots: ChunkSlot[] = [];
	let axisMesh: LineMesh | null = null;
	let gridMesh: LineMesh | null = null;

	// Index of the next slot to update when a chunk arrives.
	let incomingSlotIndex = 0;

	// TODO: Make transiton duration proportional to time it took to get first buffer back
	// therefore making all transitions take the same length of time, hiding the loading
	// all together
	let transitionDuration = 0.8;
	let lastFrameTime = 0;

	let currentJobId = 0;
	let maxSlotsForJob = TARGET_CHUNK_SLOTS;

	let cameraAzimuth = 0.85;
	let cameraElevation = 0.48;
	let cameraRadius = 44;
	const minCameraRadius = 0.5;
	const maxCameraRadius = 88;
	const minCameraElevation = -1.3;
	const maxCameraElevation = 1.3;
	const ORBITAL_CAMERA_STORAGE_KEY = 'my-atom.camera.orbital.v1';

	type CameraTween = {
		startAtMs: number;
		durationMs: number;
		startAzimuth: number;
		targetAzimuth: number;
		azimuthDelta: number;
		startElevation: number;
		targetElevation: number;
		startRadius: number;
		targetRadius: number;
	};

	let activeCameraTween: CameraTween | null = null;
	let appliedCameraMoveRequestId = 0;

	let isDraggingCamera = false;
	let activePointerId: number | null = null;
	let lastPointerX = 0;
	let lastPointerY = 0;

	let nMax = 5;
	let nMin = 1;
	const nChoices = Array.from({ length: nMax - nMin + 1 }, (_, idx) => nMin + idx);

	let n = $derived(simulationValues.n);
	let l = $derived(simulationValues.l);
	let m = $derived(simulationValues.m);
	let lChoices = $derived(Array.from({ length: simulationValues.n }, (_, idx) => idx));
	let mChoices = $derived(
		Array.from({ length: simulationValues.l * 2 + 1 }, (_, idx) => idx - simulationValues.l)
	);
	let hidePositiveQuadrant = $state(false);

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
uniform float uCloudTime;
uniform float uCloudDrift;
uniform float uCloudPulse;
uniform float uCloudFalloffRadius;
uniform float uCloudMinSpeed;
out vec3 vWorldPosition;

void main() {
  vec3 basePos = mix(prevPosition, nextPosition, uT);
  vWorldPosition = basePos;
  gl_Position = uProj * uView * vec4(basePos, 1.0);
  gl_PointSize = 3.0;
}`;

	const fs = `#version 300 es
precision highp float;
uniform float uHidePositiveQuadrant;
in vec3 vWorldPosition;
out vec4 fragColor;
void main() {
  if (uHidePositiveQuadrant > 0.5 && vWorldPosition.x > 0.0 && vWorldPosition.y > 0.0) {
    discard;
  }
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.0, d);
  fragColor = vec4(0.8470, 0.6941, 0.4784, alpha);
}`;

	const lineVs = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
uniform mat4 uProj;
uniform mat4 uView;
void main() {
  gl_Position = uProj * uView * vec4(position, 1.0);
}`;

	const lineFs = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  fragColor = uColor;
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

	function createLineMesh(vertices: Float32Array): LineMesh {
		const vao = gl.createVertexArray()!;
		const vbo = gl.createBuffer()!;

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);

		return { vao, vbo, vertexCount: vertices.length / 3 };
	}

	function buildAxesSegments(length = 20): Float32Array {
		return new Float32Array([
			-length,
			0,
			0,
			length,
			0,
			0,
			0,
			-length,
			0,
			0,
			length,
			0,
			0,
			0,
			-length,
			0,
			0,
			length
		]);
	}

	function buildPlaneGridSegments(halfSize = 18, step = 2): Float32Array {
		const verts: number[] = [];
		for (let i = -halfSize; i <= halfSize; i += step) {
			verts.push(-halfSize, 0, i, halfSize, 0, i);
			verts.push(i, 0, -halfSize, i, 0, halfSize);
		}

		for (let i = -halfSize; i <= halfSize; i += step) {
			verts.push(0, -halfSize, i, 0, halfSize, i);
			verts.push(0, i, -halfSize, 0, i, halfSize);
		}

		for (let i = -halfSize; i <= halfSize; i += step) {
			verts.push(-halfSize, i, 0, halfSize, i, 0);
			verts.push(i, -halfSize, 0, i, halfSize, 0);
		}

		return new Float32Array(verts);
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

						if (slots.length < maxSlotsForJob) {
							// Pool not yet full — allocate a new slot.
							slots.push(createSlot(points));
						} else {
							// Pool is full — update the slot at this index in-place.
							updateSlot(slots[slotIndex], points);
							//console.log(`Slot ${slotIndex}: ${slots[slotIndex].pointCount}`);
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
		const batchSize = Math.ceil(TOTAL_POINT_COUNT / TARGET_CHUNK_SLOTS);
		maxSlotsForJob = Math.ceil(TOTAL_POINT_COUNT / batchSize);

		worker_state = STATUS_IDLE;
		worker.postMessage({
			n,
			l,
			m,
			count: TOTAL_POINT_COUNT,
			batchSize,
			jobId: currentJobId
		});
	}

	const setN = (value: number) => {
		simulationValues.n = value;
	};

	const setL = (value: number) => {
		simulationValues.l = value;
	};

	const setM = (value: number) => {
		simulationValues.m = value;
	};

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
	const persistCameraPose = () => {
		saveCameraPose(ORBITAL_CAMERA_STORAGE_KEY, {
			azimuth: cameraAzimuth,
			elevation: cameraElevation,
			radius: cameraRadius
		});
	};

	const shortestAngleDelta = (from: number, to: number) =>
		Math.atan2(Math.sin(to - from), Math.cos(to - from));

	const toOrbitalCamera = (x: number, y: number, z: number) => {
		const radius = clamp(Math.hypot(x, y, z), minCameraRadius, maxCameraRadius);
		if (radius <= 1e-6) {
			return null;
		}

		const azimuth = Math.atan2(z, x);
		const elevation = clamp(Math.asin(y / radius), minCameraElevation, maxCameraElevation);
		return { azimuth, elevation, radius };
	};

	$effect(() => {
		const request = orbitalCameraState.moveRequest;
		if (!request || request.id === appliedCameraMoveRequestId) {
			return;
		}

		const next = toOrbitalCamera(request.x, request.y, request.z);
		appliedCameraMoveRequestId = request.id;
		if (!next) {
			return;
		}

		const durationMs = clamp(request.durationMs ?? 1300, 120, 5000);
		const now = performance.now();

		activeCameraTween = {
			startAtMs: now,
			durationMs,
			startAzimuth: cameraAzimuth,
			targetAzimuth: next.azimuth,
			azimuthDelta: shortestAngleDelta(cameraAzimuth, next.azimuth),
			startElevation: cameraElevation,
			targetElevation: next.elevation,
			startRadius: cameraRadius,
			targetRadius: next.radius
		};
	});

	const onCanvasPointerDown = (event: PointerEvent) => {
		if (!canvas) {
			return;
		}

		activeCameraTween = null;
		isDraggingCamera = true;
		activePointerId = event.pointerId;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
		canvas.setPointerCapture(event.pointerId);
	};

	const onCanvasPointerMove = (event: PointerEvent) => {
		if (!isDraggingCamera || activePointerId !== event.pointerId) {
			return;
		}

		const dx = event.clientX - lastPointerX;
		const dy = event.clientY - lastPointerY;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;

		cameraAzimuth -= dx * 0.007;
		cameraElevation = clamp(cameraElevation - dy * 0.0055, minCameraElevation, maxCameraElevation);
	};

	const onCanvasPointerUp = (event: PointerEvent) => {
		if (activePointerId !== event.pointerId) {
			return;
		}

		isDraggingCamera = false;
		activePointerId = null;
		if (canvas?.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}

		persistCameraPose();
	};

	const onCanvasWheel = (event: WheelEvent) => {
		event.preventDefault();
		activeCameraTween = null;
		const zoomStep = event.deltaY > 0 ? 1.08 : 0.92;
		cameraRadius = clamp(cameraRadius * zoomStep, minCameraRadius, maxCameraRadius);
		persistCameraPose();
	};

	onMount(() => {
		const restoredCamera = loadCameraPose(
			ORBITAL_CAMERA_STORAGE_KEY,
			{ azimuth: cameraAzimuth, elevation: cameraElevation, radius: cameraRadius },
			{
				minElevation: minCameraElevation,
				maxElevation: maxCameraElevation,
				minRadius: minCameraRadius,
				maxRadius: maxCameraRadius
			}
		);
		cameraAzimuth = restoredCamera.azimuth;
		cameraElevation = restoredCamera.elevation;
		cameraRadius = restoredCamera.radius;

		initWebWorker();

		gl = canvas.getContext('webgl2')!;

		canvas.width = canvas.clientWidth || window.innerWidth;
		canvas.height = canvas.clientHeight || window.innerHeight;

		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		pointProgram = createProgram(gl, vs, fs);
		lineProgram = createProgram(gl, lineVs, lineFs);

		gl.useProgram(pointProgram);

		uProj = gl.getUniformLocation(pointProgram, 'uProj');
		uView = gl.getUniformLocation(pointProgram, 'uView');
		uT = gl.getUniformLocation(pointProgram, 'uT');
		uCloudTime = gl.getUniformLocation(pointProgram, 'uCloudTime');
		uCloudDrift = gl.getUniformLocation(pointProgram, 'uCloudDrift');
		uCloudPulse = gl.getUniformLocation(pointProgram, 'uCloudPulse');
		uCloudFalloffRadius = gl.getUniformLocation(pointProgram, 'uCloudFalloffRadius');
		uCloudMinSpeed = gl.getUniformLocation(pointProgram, 'uCloudMinSpeed');
		uHidePositiveQuadrant = gl.getUniformLocation(pointProgram, 'uHidePositiveQuadrant');

		gl.useProgram(lineProgram);
		lUProj = gl.getUniformLocation(lineProgram, 'uProj');
		lUView = gl.getUniformLocation(lineProgram, 'uView');
		lUColor = gl.getUniformLocation(lineProgram, 'uColor');

		axisMesh = createLineMesh(buildAxesSegments(20));
		gridMesh = createLineMesh(buildPlaneGridSegments(18, 2));

		const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
		gl.useProgram(pointProgram);
		gl.uniformMatrix4fv(uProj, false, proj);
		gl.uniform1f(uT, 1.0);
		gl.uniform1f(uCloudDrift, 1.0);
		gl.uniform1f(uCloudPulse, 1.0);
		gl.uniform1f(uCloudFalloffRadius, 26.0);
		gl.uniform1f(uCloudMinSpeed, 0.18);
		gl.uniform1f(uHidePositiveQuadrant, 0.0);

		gl.useProgram(lineProgram);
		gl.uniformMatrix4fv(lUProj, false, proj);

		lastFrameTime = performance.now();

		function render(now: number) {
			const dt = (now - lastFrameTime) / 1000;
			lastFrameTime = now;

			if (canvas.clientWidth !== canvas.width || canvas.clientHeight !== canvas.height) {
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				gl.viewport(0, 0, canvas.width, canvas.height);
				const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
				gl.useProgram(pointProgram);
				gl.uniformMatrix4fv(uProj, false, proj);
				gl.useProgram(lineProgram);
				gl.uniformMatrix4fv(lUProj, false, proj);
			}

			if (activeCameraTween) {
				const elapsedMs = now - activeCameraTween.startAtMs;
				const progress = clamp(elapsedMs / activeCameraTween.durationMs, 0, 1);
				const eased = progress * progress * (3 - 2 * progress);

				cameraAzimuth = activeCameraTween.startAzimuth + activeCameraTween.azimuthDelta * eased;
				cameraElevation =
					activeCameraTween.startElevation +
					(activeCameraTween.targetElevation - activeCameraTween.startElevation) * eased;
				cameraRadius =
					activeCameraTween.startRadius +
					(activeCameraTween.targetRadius - activeCameraTween.startRadius) * eased;

				if (progress >= 1) {
					cameraAzimuth = activeCameraTween.targetAzimuth;
					cameraElevation = activeCameraTween.targetElevation;
					cameraRadius = activeCameraTween.targetRadius;
					activeCameraTween = null;
					persistCameraPose();
				}
			}

			const horizontalRadius = Math.cos(cameraElevation) * cameraRadius;
			const eye = {
				x: Math.cos(cameraAzimuth) * horizontalRadius,
				y: Math.sin(cameraElevation) * cameraRadius,
				z: Math.sin(cameraAzimuth) * horizontalRadius
			};
			const view = lookAt(eye, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
			gl.useProgram(pointProgram);
			gl.uniformMatrix4fv(uView, false, view);
			gl.uniform1f(uCloudTime, now * 0.001);
			gl.uniform1f(uHidePositiveQuadrant, hidePositiveQuadrant ? 1.0 : 0.0);

			gl.useProgram(lineProgram);
			gl.uniformMatrix4fv(lUView, false, view);

			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			if (gridMesh) {
				gl.useProgram(lineProgram);
				gl.uniform4f(lUColor, 0.84, 0.69, 0.47, 0.11);
				gl.bindVertexArray(gridMesh.vao);
				gl.drawArrays(gl.LINES, 0, gridMesh.vertexCount);
			}

			if (axisMesh) {
				gl.useProgram(lineProgram);
				gl.uniform4f(lUColor, 0.92, 0.82, 0.65, 0.5);
				gl.bindVertexArray(axisMesh.vao);
				gl.drawArrays(gl.LINES, 0, axisMesh.vertexCount);
			}

			gl.useProgram(pointProgram);
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
		if (animFrameId) {
			cancelAnimationFrame(animFrameId);
		}

		persistCameraPose();
		clearTimeout(debounceTimer);
		worker?.terminate();
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden text-[var(--color-exhibit-paper)]">
	<div class="z-20 bg-[var(--museum-surface)] px-3 py-2 md:px-4 md:py-2.5">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[rgba(44,61,75,0.95)]">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase"
					>n</span
				>
				{#each nChoices as value}
					<button
						type="button"
						class="rounded border px-1.5 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer {simulationValues.n ===
						value
							? 'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]'
							: 'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]'}"
						onclick={() => setN(value)}
					>
						{value}
					</button>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<span class="text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase"
					>l</span
				>
				{#each lChoices as value}
					<button
						type="button"
						class="rounded border px-1.5 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer {simulationValues.l ===
						value
							? 'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]'
							: 'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]'}"
						onclick={() => setL(value)}
					>
						{value}
					</button>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<span class="text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase"
					>Slice</span
				>
				<button
					type="button"
					class="rounded border px-2 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer {hidePositiveQuadrant
						? 'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]'
						: 'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]'}"
					onclick={() => (hidePositiveQuadrant = !hidePositiveQuadrant)}
				>
					Hide +X/+Y quadrant
				</button>
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<span class="text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase"
					>m</span
				>
				{#each mChoices as value}
					<button
						type="button"
						class="rounded border px-1.5 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer {simulationValues.m ===
						value
							? 'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]'
							: 'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]'}"
						onclick={() => setM(value)}
					>
						{value}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<div class="relative min-h-0 flex-1">
		<div
			class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_18%,rgba(216,176,122,0.18),transparent_44%),radial-gradient(circle_at_78%_12%,rgba(255,243,224,0.06),transparent_35%),linear-gradient(135deg,#0b141d_0%,#102230_60%,#132736_100%)]"
		></div>
		<canvas
			bind:this={canvas}
			onpointerdown={onCanvasPointerDown}
			onpointermove={onCanvasPointerMove}
			onpointerup={onCanvasPointerUp}
			onpointercancel={onCanvasPointerUp}
			onwheel={onCanvasWheel}
			class="relative z-10 block h-full w-full cursor-grab touch-none active:cursor-grabbing"
		></canvas>
	</div>
</div>
