<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { loadCameraPose, saveCameraPose } from '$lib/camera-storage';
	import { perspective, lookAt } from '$lib/render_math';
	import {
		orbitalCameraState,
		orbitalViewState,
		setPositiveXYCrossSectionHidden,
		simulationValues
	} from '$lib/chat.svelte';

	import {
		STATUS_FINISHED,
		STATUS_PROCESSING,
		STATUS_ERROR,
		STATUS_IDLE
	} from '$lib/worker_states';

	let canvas: HTMLCanvasElement;
	let gl: WebGL2RenderingContext;
	let animFrameId: number;
	let sphereProgram: WebGLProgram | null = null;
	let lineProgram: WebGLProgram | null = null;

	let uProj: WebGLUniformLocation | null = null;
	let uView: WebGLUniformLocation | null = null;
	let uT: WebGLUniformLocation | null = null;
	let uCloudTime: WebGLUniformLocation | null = null;
	let uCloudDrift: WebGLUniformLocation | null = null;
	let uCloudPulse: WebGLUniformLocation | null = null;
	let uCloudFalloffRadius: WebGLUniformLocation | null = null;
	let uCloudMinSpeed: WebGLUniformLocation | null = null;
	let uFlowStrength: WebGLUniformLocation | null = null;
	let uFlowMaxSpeed: WebGLUniformLocation | null = null;
	let uFlowAnimationSpeed: WebGLUniformLocation | null = null;
	let uCameraRadius: WebGLUniformLocation | null = null;
	let uSphereRadius: WebGLUniformLocation | null = null;
	let uHidePositiveQuadrant: WebGLUniformLocation | null = null;
	let uZRotation: WebGLUniformLocation | null = null;

	let lUProj: WebGLUniformLocation | null = null;
	let lUView: WebGLUniformLocation | null = null;
	let lUColor: WebGLUniformLocation | null = null;

	let worker: Worker;
	const TOTAL_POINT_COUNT = 20_000;
	const TARGET_CHUNK_SLOTS = 24;
	const BASE_SPHERE_RADIUS = 0.117;
	const SPHERE_FADE_BAND = 0.08;
	const RADIAL_COMPRESSION = 0.035;
	const FLOW_STRENGTH = 1.6;
	const FLOW_MAX_SPEED = 2.25;
	const FLOW_ANIMATION_SPEED = 1.8;

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
		flowBuf: WebGLBuffer;
		prevPoints: Float32Array;
		// The raw nextPosition data, kept so we can use it as prevPosition next time.
		nextPoints: Float32Array;
		flow: Float32Array;
		pointCount: number;
		t: number;
	};

	type Mesh = {
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		vertexCount: number;
	};

	// Fixed-size pool of slots. Initialised on first job, then reused forever.
	let slots: ChunkSlot[] = [];
	let sphereMesh: Mesh | null = null;
	let axisMesh: Mesh | null = null;
	let gridMesh: Mesh | null = null;

	// Index of the next slot to update when a chunk arrives.
	let incomingSlotIndex = 0;

	// TODO: Make transiton duration proportional to time it took to get first buffer back
	// therefore making all transitions take the same length of time, hiding the loading
	// all together
	let transitionDuration = 0.12;
	let lastFrameTime = 0;
	let fps = $state(0);
	let fpsFrameCount = 0;
	let fpsElapsed = 0;

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
	let hidePositiveQuadrant = $derived(orbitalViewState.hidePositiveXYCrossSection);
	let zRotationDegrees = $state(0);

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
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 prevPosition;
layout(location=3) in vec3 nextPosition;
	layout(location=4) in vec3 flowVelocity;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uT;
uniform float uSphereRadius;
uniform float uHidePositiveQuadrant;
uniform float uZRotation;
out vec3 vWorldPosition;
out vec3 vNormal;
out float vAlpha;

vec3 rotateScene(vec3 p) {
  return vec3(p.z, p.y, -p.x);
}

vec3 rotateZ(vec3 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

void main() {
  vec3 baseCenter = mix(prevPosition, nextPosition, uT);
  vec3 worldCenter = rotateScene(baseCenter);
  float centerRadius = length(worldCenter);
  if (centerRadius > 0.0001) {
    // Compress the sampled radius so antinodes sit closer together.
    worldCenter *= 1.0 / (1.0 + ${RADIAL_COMPRESSION.toFixed(3)} * centerRadius);
  }
  worldCenter = rotateZ(worldCenter, uZRotation);
  float safeMarginX = -uSphereRadius - worldCenter.x;
  float safeMarginY = -uSphereRadius - worldCenter.y;
  float safeMargin = max(safeMarginX, safeMarginY);
  float hiddenAlpha = smoothstep(-${SPHERE_FADE_BAND.toFixed(2)}, ${SPHERE_FADE_BAND.toFixed(2)}, safeMargin);
  vAlpha = mix(1.0, hiddenAlpha, uHidePositiveQuadrant);

  vec3 worldPos = worldCenter + rotateZ(rotateScene(position), uZRotation) * uSphereRadius;

  vWorldPosition = worldPos;
  vNormal = rotateZ(rotateScene(normal), uZRotation);
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}`;

	const fs = `#version 300 es
precision highp float;
uniform float uHidePositiveQuadrant;
in vec3 vWorldPosition;
in vec3 vNormal;
in float vAlpha;
out vec4 fragColor;

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));

  if (y == 0) {
    if (x == 0) return 0.0 / 16.0;
    if (x == 1) return 8.0 / 16.0;
    if (x == 2) return 2.0 / 16.0;
    return 10.0 / 16.0;
  }
  if (y == 1) {
    if (x == 0) return 12.0 / 16.0;
    if (x == 1) return 4.0 / 16.0;
    if (x == 2) return 14.0 / 16.0;
    return 6.0 / 16.0;
  }
  if (y == 2) {
    if (x == 0) return 3.0 / 16.0;
    if (x == 1) return 11.0 / 16.0;
    if (x == 2) return 1.0 / 16.0;
    return 9.0 / 16.0;
  }

  if (x == 0) return 15.0 / 16.0;
  if (x == 1) return 7.0 / 16.0;
  if (x == 2) return 13.0 / 16.0;
  return 5.0 / 16.0;
}

void main() {
  if (vAlpha <= 0.001) {
    discard;
  }
  if (vAlpha < 0.999) {
    float threshold = bayer4(gl_FragCoord.xy);
    if (vAlpha < threshold) {
      discard;
    }
  }
  vec3 normal = normalize(vNormal);
  vec3 lightDirA = normalize(vec3(0.28, 0.94, 0.2));
  vec3 lightDirB = normalize(vec3(-0.76, 0.18, 0.62));
  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
  float diffuseA = max(dot(normal, lightDirA), 0.0);
  float diffuseB = max(dot(normal, lightDirB), 0.0);
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 1.8);
  float edgeShade = 1.0 - 0.18 * rim;
  float lighting = (0.68 + 0.26 * diffuseA + 0.16 * diffuseB + 0.12 * rim) * edgeShade;
  vec3 baseColor = vec3(0.965, 0.455, 0.12);
  float radialFade = clamp(length(vWorldPosition) / 15.0, 0.0, 1.0);
  vec3 shadedColor = mix(baseColor, vec3(1.0), radialFade * 0.44);
  fragColor = vec4(shadedColor * lighting, 1.0);
}`;

	const lineVs = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
uniform mat4 uProj;
uniform mat4 uView;

vec3 rotateScene(vec3 p) {
  return vec3(p.z, p.y, -p.x);
}

void main() {
  gl_Position = uProj * uView * vec4(rotateScene(position), 1.0);
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

	function createLineMesh(vertices: Float32Array): Mesh {
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

	function buildSphereTriangles(latSegments = 6, lonSegments = 8): Float32Array {
		const vertices: number[] = [];

		const pushVertex = (theta: number, phi: number) => {
			const sinTheta = Math.sin(theta);
			const x = sinTheta * Math.cos(phi);
			const y = Math.cos(theta);
			const z = sinTheta * Math.sin(phi);
			vertices.push(x, y, z, x, y, z);
		};

		for (let lat = 0; lat < latSegments; lat++) {
			const theta0 = (lat / latSegments) * Math.PI;
			const theta1 = ((lat + 1) / latSegments) * Math.PI;
			for (let lon = 0; lon < lonSegments; lon++) {
				const phi0 = (lon / lonSegments) * Math.PI * 2;
				const phi1 = ((lon + 1) / lonSegments) * Math.PI * 2;

				pushVertex(theta0, phi0);
				pushVertex(theta1, phi0);
				pushVertex(theta1, phi1);

				pushVertex(theta0, phi0);
				pushVertex(theta1, phi1);
				pushVertex(theta0, phi1);
			}
		}

		return new Float32Array(vertices);
	}

	function createSphereMesh(vertices: Float32Array): Mesh {
		const vao = gl.createVertexArray()!;
		const vbo = gl.createBuffer()!;

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
		gl.bindVertexArray(null);

		return { vao, vbo, vertexCount: vertices.length / 6 };
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
		const positions = new Float32Array(slot.nextPoints.length);
		for (let idx = 0; idx < positions.length; idx++) {
			positions[idx] =
				slot.prevPoints[idx] + (slot.nextPoints[idx] - slot.prevPoints[idx]) * slot.t;
		}
		return positions;
	}

	// Allocates a brand-new slot with both prev and next set to the same points
	// so it appears immediately with no transition.
	function createSlot(points: Float32Array, flow: Float32Array): ChunkSlot {
		if (!sphereMesh) {
			throw new Error('Sphere mesh must be created before chunk slots');
		}

		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, sphereMesh.vbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

		const prevBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
		gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(2, 1);

		const nextBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, nextBuf);
		gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(3, 1);

		const flowBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, flowBuf);
		gl.bufferData(gl.ARRAY_BUFFER, flow, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(4);
		gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(4, 1);

		gl.bindVertexArray(null);

		return {
			vao,
			prevBuf,
			nextBuf,
			flowBuf,
			prevPoints: points.slice(),
			nextPoints: points.slice(),
			flow: flow.slice(),
			pointCount: points.length / 3,
			t: 1.0 // start fully arrived
		};
	}

	// Updates an existing slot with new destination points, snapping prevPosition
	// to wherever the points currently are and resetting t to kick off a new transition.
	function updateSlot(slot: ChunkSlot, newPoints: Float32Array, flow: Float32Array) {
		const currentPos = sampleCurrentPositions(slot);

		// Upload current interpolated positions as the new prevPosition.
		gl.bindBuffer(gl.ARRAY_BUFFER, slot.prevBuf);
		gl.bufferData(gl.ARRAY_BUFFER, currentPos, gl.DYNAMIC_DRAW);

		// Upload new destination as nextPosition.
		gl.bindBuffer(gl.ARRAY_BUFFER, slot.nextBuf);
		gl.bufferData(gl.ARRAY_BUFFER, newPoints, gl.DYNAMIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, slot.flowBuf);
		gl.bufferData(gl.ARRAY_BUFFER, flow, gl.DYNAMIC_DRAW);

		slot.prevPoints = currentPos;
		slot.nextPoints = newPoints.slice();
		slot.flow = flow.slice();
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
					flow?: Float32Array;
					message?: string;
					jobId: number;
				}>
			) => {
				const { status, progress, points, flow, message, jobId } = e.data;
				if (jobId !== currentJobId) {
					return;
				}

				if (status === STATUS_PROCESSING) {
					worker_state = STATUS_PROCESSING;
					worker_progress = progress ?? 0;

					if (points && flow && points.length > 0) {
						const slotIndex = incomingSlotIndex % Math.max(slots.length, 1);

						if (slots.length < maxSlotsForJob) {
							// Pool not yet full — allocate a new slot.
							slots.push(createSlot(points, flow));
						} else {
							// Pool is full — update the slot at this index in-place.
							updateSlot(slots[slotIndex], points, flow);
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

		gl = canvas.getContext('webgl2')!;

		canvas.width = canvas.clientWidth || window.innerWidth;
		canvas.height = canvas.clientHeight || window.innerHeight;

		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		sphereProgram = createProgram(gl, vs, fs);
		lineProgram = createProgram(gl, lineVs, lineFs);

		gl.useProgram(sphereProgram);

		uProj = gl.getUniformLocation(sphereProgram, 'uProj');
		uView = gl.getUniformLocation(sphereProgram, 'uView');
		uT = gl.getUniformLocation(sphereProgram, 'uT');
		uCloudTime = gl.getUniformLocation(sphereProgram, 'uCloudTime');
		uCloudDrift = gl.getUniformLocation(sphereProgram, 'uCloudDrift');
		uCloudPulse = gl.getUniformLocation(sphereProgram, 'uCloudPulse');
		uCloudFalloffRadius = gl.getUniformLocation(sphereProgram, 'uCloudFalloffRadius');
		uCloudMinSpeed = gl.getUniformLocation(sphereProgram, 'uCloudMinSpeed');
		uFlowStrength = gl.getUniformLocation(sphereProgram, 'uFlowStrength');
		uFlowMaxSpeed = gl.getUniformLocation(sphereProgram, 'uFlowMaxSpeed');
		uFlowAnimationSpeed = gl.getUniformLocation(sphereProgram, 'uFlowAnimationSpeed');
		uCameraRadius = gl.getUniformLocation(sphereProgram, 'uCameraRadius');
		uSphereRadius = gl.getUniformLocation(sphereProgram, 'uSphereRadius');
		uHidePositiveQuadrant = gl.getUniformLocation(sphereProgram, 'uHidePositiveQuadrant');
		uZRotation = gl.getUniformLocation(sphereProgram, 'uZRotation');

		gl.useProgram(lineProgram);
		lUProj = gl.getUniformLocation(lineProgram, 'uProj');
		lUView = gl.getUniformLocation(lineProgram, 'uView');
		lUColor = gl.getUniformLocation(lineProgram, 'uColor');

		sphereMesh = createSphereMesh(buildSphereTriangles(10, 8));
		axisMesh = createLineMesh(buildAxesSegments(20));
		gridMesh = createLineMesh(buildPlaneGridSegments(18, 2));

		const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
		gl.useProgram(sphereProgram);
		gl.uniformMatrix4fv(uProj, false, proj);
		gl.uniform1f(uT, 1.0);
		gl.uniform1f(uCloudDrift, 1.0);
		gl.uniform1f(uCloudPulse, 1.0);
		gl.uniform1f(uCloudFalloffRadius, 26.0);
		gl.uniform1f(uCloudMinSpeed, 0.18);
		gl.uniform1f(uFlowStrength, FLOW_STRENGTH);
		gl.uniform1f(uFlowMaxSpeed, FLOW_MAX_SPEED);
		gl.uniform1f(uFlowAnimationSpeed, FLOW_ANIMATION_SPEED);
		gl.uniform1f(uCameraRadius, cameraRadius);
		gl.uniform1f(uSphereRadius, BASE_SPHERE_RADIUS);
		gl.uniform1f(uHidePositiveQuadrant, 0.0);
		gl.uniform1f(uZRotation, 0.0);

		gl.useProgram(lineProgram);
		gl.uniformMatrix4fv(lUProj, false, proj);

		initWebWorker();

		lastFrameTime = performance.now();

		function render(now: number) {
			const dt = (now - lastFrameTime) / 1000;
			lastFrameTime = now;
			fpsElapsed += dt;
			fpsFrameCount += 1;
			if (fpsElapsed >= 0.25) {
				fps = Math.round(fpsFrameCount / fpsElapsed);
				fpsElapsed = 0;
				fpsFrameCount = 0;
			}

			if (canvas.clientWidth !== canvas.width || canvas.clientHeight !== canvas.height) {
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				gl.viewport(0, 0, canvas.width, canvas.height);
				const proj = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
				gl.useProgram(sphereProgram);
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
			gl.useProgram(sphereProgram);
			gl.uniformMatrix4fv(uView, false, view);
			gl.uniform1f(uCloudTime, now * 0.001);
			gl.uniform1f(uFlowStrength, FLOW_STRENGTH);
			gl.uniform1f(uFlowMaxSpeed, FLOW_MAX_SPEED);
			gl.uniform1f(uFlowAnimationSpeed, FLOW_ANIMATION_SPEED);
			gl.uniform1f(uCameraRadius, cameraRadius);
			gl.uniform1f(uSphereRadius, BASE_SPHERE_RADIUS);
			gl.uniform1f(uHidePositiveQuadrant, hidePositiveQuadrant ? 1.0 : 0.0);
			gl.uniform1f(uZRotation, (zRotationDegrees * Math.PI) / 180);

			gl.useProgram(lineProgram);
			gl.uniformMatrix4fv(lUView, false, view);

			gl.clearColor(0.058, 0.086, 0.118, 1.0);
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

			gl.useProgram(sphereProgram);
			for (const slot of slots) {
				slot.t = Math.min(1.0, slot.t + dt / transitionDuration);
				const eased = slot.t * slot.t * (3.0 - 2.0 * slot.t);
				gl.uniform1f(uT, eased);
				gl.bindVertexArray(slot.vao);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, sphereMesh?.vertexCount ?? 0, slot.pointCount);
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

			<div class="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					class="rounded border px-2 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer {hidePositiveQuadrant
						? 'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]'
						: 'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]'}"
					onclick={() => setPositiveXYCrossSectionHidden(!hidePositiveQuadrant)}
				>
					{hidePositiveQuadrant ? 'Show +X/+Y cross section' : 'Hide +X/+Y cross section'}
				</button>
			</div>

			<div class="flex items-center gap-2 text-[11px] leading-4 text-[rgba(44,61,75,0.95)]">
				<label for="orbital-z-rotation" class="font-semibold tracking-wide uppercase"
					>rotate z</label
				>
				<input
					id="orbital-z-rotation"
					type="range"
					min="-180"
					max="180"
					step="1"
					value={zRotationDegrees}
					oninput={(event) => {
						zRotationDegrees = Number((event.currentTarget as HTMLInputElement).value);
					}}
					class="h-1.5 w-28 accent-[rgba(44,61,75,0.95)] md:w-36"
				/>
				<span class="w-11 text-right tabular-nums">{zRotationDegrees}deg</span>
			</div>
		</div>
	</div>

	<div class="relative min-h-0 flex-1">
		<div
			class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_18%,rgba(126,255,163,0.14),transparent_40%),radial-gradient(circle_at_78%_12%,rgba(214,255,228,0.05),transparent_32%),linear-gradient(135deg,#081017_0%,#0e1b25_60%,#142431_100%)]"
		></div>
		<div
			class="pointer-events-none absolute top-3 left-3 z-20 rounded border border-[rgba(44,61,75,0.18)] bg-[rgba(243,229,205,0.86)] px-2 py-1 text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase backdrop-blur-sm"
		>
			FPS {fps}
		</div>
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
