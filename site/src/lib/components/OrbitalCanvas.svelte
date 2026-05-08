<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { loadCameraPose, saveCameraPose } from '$lib/camera-storage';
	import { perspective, lookAt } from '$lib/render_math';
	import {
		orbitalCameraState,
		orbitalViewState,
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
	let uCameraPosition: WebGLUniformLocation | null = null;
	let uSphereRadius: WebGLUniformLocation | null = null;
	let uHidePositiveQuadrant: WebGLUniformLocation | null = null;
	let lUProj: WebGLUniformLocation | null = null;
	let lUView: WebGLUniformLocation | null = null;
	let lUColor: WebGLUniformLocation | null = null;

	let worker: Worker;
	const TOTAL_POINT_COUNT = 40_000;
	const TARGET_CHUNK_SLOTS = 24;
	const BASE_SPHERE_RADIUS = 0.117;
	const RADIAL_COMPRESSION = 0.035;
	const MAX_SAMPLE_RADIUS = 80.0;
	const FLOW_STRENGTH = 1.6;
	const FLOW_MAX_SPEED = 2.25;
	const FLOW_ANIMATION_SPEED = 1.8;
	const SNAPSHOT_BUFFER_DELAY_MS = 220;
	const MAX_SNAPSHOTS_PER_SLOT = 6;
	const STATE_TRANSITION_DURATION_MS = 320;
	const LOD_REFRESH_INTERVAL_MS = 120;
	const LOD_ROTATION_EPSILON = 0.09;
	const LOD_RADIUS_EPSILON = 1.5;
	const MATCHING_GRID_MIN_DIVISIONS = 6;
	const MATCHING_GRID_MAX_DIVISIONS = 18;
	const MATCHING_BIN_SEARCH_RADIUS = 2;
	const MATCHING_POINTS_PER_STEP = 320;
	const MATCHING_TIME_BUDGET_MS = 4;

	type SphereLodLevel = {
		id: string;
		latSegments: number;
		lonSegments: number;
		triangleCount: number;
	};

	const SPHERE_LOD_LEVELS: SphereLodLevel[] = [
		{ id: 'high', latSegments: 10, lonSegments: 8, triangleCount: 160 },
		{ id: 'mid', latSegments: 4, lonSegments: 6, triangleCount: 48 },
		{ id: 'low', latSegments: 2, lonSegments: 4, triangleCount: 16 }
	];

	let worker_state = $state(STATUS_IDLE);
	let worker_progress = $state(0);

	let debounceTimer: ReturnType<typeof setTimeout>;

	// A chunk slot holds a VAO that is always rendering.
	// When new data arrives for this slot, prevBuf is updated to the current
	// interpolated positions and nextBuf is updated to the new points, then t resets.
	type SphereLodBuffers = {
		vao: WebGLVertexArrayObject;
		prevBuf: WebGLBuffer;
		nextBuf: WebGLBuffer;
		flowBuf: WebGLBuffer;
		pointCount: number;
	};

	type ChunkSlot = {
		lodBuffers: SphereLodBuffers[];
		snapshots: SlotSnapshot[];
		prevPoints: Float32Array;
		nextPoints: Float32Array;
		flow: Float32Array;
		t: number;
		activePrevSnapshotTimeMs: number;
		activeNextSnapshotTimeMs: number;
		pendingRefinement: PendingRefinement | null;
		jobId: number;
	};

	type SlotSnapshot = {
		timeMs: number;
		points: Float32Array;
		flow: Float32Array;
	};

	type PendingRefinement = {
		timeMs: number;
		points: Float32Array;
		flow: Float32Array;
		jobId: number;
		started: boolean;
	};

	type PendingTransitionTask = {
		slot: ChunkSlot;
		jobId: number;
		eye: { x: number; y: number; z: number };
		sourcePoints: Float32Array;
		sourceFlow: Float32Array;
		targetPoints: Float32Array;
		targetFlow: Float32Array;
		matchedPoints: Float32Array;
		matchedFlow: Float32Array;
		matchedTarget: Uint8Array;
		targetBins: Map<string, number[]>;
		gridDivisions: number;
		binSize: number;
		minX: number;
		minY: number;
		minZ: number;
		nextSourceIndex: number;
	};

	type Mesh = {
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		vertexCount: number;
	};

	// Fixed-size pool of slots. Initialised on first job, then reused forever.
	let slots: ChunkSlot[] = [];
	let sphereMeshes: Mesh[] = [];
	let axisMesh: Mesh | null = null;

	let lastFrameTime = 0;
	let fps = $state(0);
	let renderedPointCount = $state(0);
	let fpsFrameCount = 0;
	let fpsElapsed = 0;

	let currentJobId = 0;
	let pendingTransitionTasks: PendingTransitionTask[] = [];
	let hasCompletedInitialHydration = false;

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
	let lastLodRefreshAtMs = 0;
	let lastLodCameraAzimuth = cameraAzimuth;
	let lastLodCameraElevation = cameraElevation;
	let lastLodCameraRadius = cameraRadius;
	let lastAutoFitRadiusForJob = 0;

	let isDraggingCamera = false;
	let activePointerId: number | null = null;
	let lastPointerX = 0;
	let lastPointerY = 0;

	let n = $derived(simulationValues.n);
	let l = $derived(simulationValues.l);
	let m = $derived(simulationValues.m);
	let hidePositiveQuadrant = $derived(orbitalViewState.hidePositiveXYCrossSection);

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
out vec3 vWorldPosition;
out vec3 vNormal;
out float vAlpha;
out float vRadialRatio;

vec3 rotateScene(vec3 p) {
  return vec3(p.z, p.y, -p.x);
}

void main() {
  vec3 baseCenter = mix(prevPosition, nextPosition, uT);
  vec3 worldCenter = rotateScene(baseCenter);
  float centerRadius = length(worldCenter);
  vRadialRatio = clamp(length(baseCenter) / ${MAX_SAMPLE_RADIUS.toFixed(1)}, 0.0, 1.0);
  if (centerRadius > 0.0001) {
    // Compress the sampled radius so antinodes sit closer together.
    worldCenter *= 1.0 / (1.0 + ${RADIAL_COMPRESSION.toFixed(3)} * centerRadius);
  }
  float safeMarginX = -uSphereRadius - worldCenter.x;
  float safeMarginY = -uSphereRadius - worldCenter.y;
  float safeMargin = max(safeMarginX, safeMarginY);
  float hiddenAlpha = safeMargin >= 0.0 ? 1.0 : 0.0;
  vAlpha = mix(1.0, hiddenAlpha, uHidePositiveQuadrant);

  vec3 worldPos = worldCenter + rotateScene(position) * uSphereRadius;

  vWorldPosition = worldPos;
  vNormal = rotateScene(normal);
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}`;

	const fs = `#version 300 es
precision highp float;
uniform float uHidePositiveQuadrant;
uniform vec3 uCameraPosition;
in vec3 vWorldPosition;
in vec3 vNormal;
in float vAlpha;
in float vRadialRatio;
out vec4 fragColor;

const float PI = 3.14159265359;

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denom * denom, 0.0001);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NdotV / max(NdotV * (1.0 - k) + k, 0.0001);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggxV = geometrySchlickGGX(NdotV, roughness);
  float ggxL = geometrySchlickGGX(NdotL, roughness);
  return ggxV * ggxL;
}

vec3 evaluateLight(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 albedo, float roughness) {
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  float normalization = max(4.0 * NdotV * NdotL, 0.0001);
  float microOcclusion = 1.0 - clamp((NDF * G) / normalization, 0.0, 0.18);
  vec3 diffuse = (albedo / PI) * microOcclusion;
  return diffuse * radiance * NdotL;
}

void main() {
  if (vAlpha <= 0.001) {
    discard;
  }
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 lightDirA = normalize(vec3(0.28, 0.94, 0.2));
  vec3 lightDirB = normalize(vec3(-0.76, 0.18, 0.62));
  vec3 lightRadianceA = vec3(2.4, 1.95, 1.18);
  vec3 lightRadianceB = vec3(0.52, 0.44, 0.28);
  //vec3 baseColor = vec3(0.96, 0.38, 0.02);
  vec3 baseColor = vec3(0.63, 0.06, 0.53);
  //vec3 baseColor = vec3(0.54, 0.31, 0.62);
	
  float radialFade = smoothstep(0.08, 1.0, vRadialRatio);
  //vec3 farColor = vec3(1.0, 0.78, 0.18);
  vec3 farColor = vec3(0.98, 0.51, 0.89);
  vec3 albedo = mix(baseColor, farColor, radialFade * 0.9);
  float roughness = mix(0.9, 0.96, radialFade);
  vec3 directLighting =
    evaluateLight(normal, viewDir, lightDirA, lightRadianceA, albedo, roughness) +
    evaluateLight(normal, viewDir, lightDirB, lightRadianceB, albedo, roughness);
  vec3 upAmbient = vec3(0.34, 0.22, 0.1);
  vec3 downAmbient = vec3(0.085, 0.038, 0.012);
  float hemiFactor = normal.y * 0.5 + 0.5;
  vec3 ambientLight = mix(downAmbient, upAmbient, hemiFactor);
  vec3 emissive = albedo * mix(0.4, 0.62, radialFade);
  vec3 color = albedo * ambientLight + directLighting * 0.92 + emissive;
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));
  fragColor = vec4(color, vAlpha);
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

	function rotateScenePoint(point: { x: number; y: number; z: number }) {
		return { x: point.z, y: point.y, z: -point.x };
	}

	function toRenderedSphereCenter(x: number, y: number, z: number) {
		let worldCenter = rotateScenePoint({ x, y, z });
		const centerRadius = Math.hypot(worldCenter.x, worldCenter.y, worldCenter.z);
		if (centerRadius > 0.0001) {
			const compressedScale = 1.0 / (1.0 + RADIAL_COMPRESSION * centerRadius);
			worldCenter = {
				x: worldCenter.x * compressedScale,
				y: worldCenter.y * compressedScale,
				z: worldCenter.z * compressedScale
			};
		}

		return worldCenter;
	}

	function classifySphereLod(
		point: { x: number; y: number; z: number },
		eye: { x: number; y: number; z: number }
	) {
		const distanceToCamera = Math.hypot(point.x - eye.x, point.y - eye.y, point.z - eye.z);
		const highDetailDistance = cameraRadius * 0.38 + 3.5;
		const mediumDetailDistance = cameraRadius * 0.8 + 7.5;
		if (distanceToCamera <= highDetailDistance) {
			return 0;
		}
		if (distanceToCamera <= mediumDetailDistance) {
			return 1;
		}
		return 2;
	}

	function getCameraEye() {
		const horizontalRadius = Math.cos(cameraElevation) * cameraRadius;
		return {
			x: Math.cos(cameraAzimuth) * horizontalRadius,
			y: Math.sin(cameraElevation) * cameraRadius,
			z: Math.sin(cameraAzimuth) * horizontalRadius
		};
	}

	function estimateCompressedCloudRadius(points: Float32Array) {
		let maxRadius = 0;
		for (let idx = 0; idx < points.length; idx += 3) {
			const rawRadius = Math.hypot(points[idx] ?? 0, points[idx + 1] ?? 0, points[idx + 2] ?? 0);
			const compressedRadius = rawRadius / (1.0 + RADIAL_COMPRESSION * rawRadius) + BASE_SPHERE_RADIUS;
			if (compressedRadius > maxRadius) {
				maxRadius = compressedRadius;
			}
		}

		return maxRadius;
	}

	function maybeAutoFitCamera(points: Float32Array, jobId: number) {
		if (jobId !== currentJobId || isDraggingCamera) {
			return;
		}

		const cloudRadius = estimateCompressedCloudRadius(points);
		const fitRadius = clamp((cloudRadius / Math.sin(Math.PI / 8)) * 1.12, minCameraRadius, maxCameraRadius);
		if (fitRadius <= cameraRadius + 1.0 || fitRadius <= lastAutoFitRadiusForJob + 0.4) {
			return;
		}

		lastAutoFitRadiusForJob = fitRadius;
		activeCameraTween = {
			startAtMs: performance.now(),
			durationMs: 520,
			startAzimuth: cameraAzimuth,
			targetAzimuth: cameraAzimuth,
			azimuthDelta: 0,
			startElevation: cameraElevation,
			targetElevation: cameraElevation,
			startRadius: cameraRadius,
			targetRadius: fitRadius
		};
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

	function createLodBuffers(mesh: Mesh): SphereLodBuffers {
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);

		gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

		const prevBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(2, 1);

		const nextBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, nextBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(3, 1);

		const flowBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, flowBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(4);
		gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(4, 1);

		gl.bindVertexArray(null);

		return {
			vao,
			prevBuf,
			nextBuf,
			flowBuf,
			pointCount: 0
		};
	}

	function sampleRenderedPoints(slot: ChunkSlot): Float32Array {
		const renderedPoints = new Float32Array(slot.prevPoints.length);
		for (let index = 0; index < renderedPoints.length; index++) {
			renderedPoints[index] =
				slot.prevPoints[index] + (slot.nextPoints[index] - slot.prevPoints[index]) * slot.t;
		}
		return renderedPoints;
	}

	function buildPendingTransitionTask(
		sourcePoints: Float32Array,
		sourceFlow: Float32Array,
		targetPoints: Float32Array,
		targetFlow: Float32Array,
		slot: ChunkSlot,
		jobId: number,
		eye: { x: number; y: number; z: number }
	) {
		if (sourcePoints.length !== targetPoints.length || targetPoints.length !== targetFlow.length) {
			return null;
		}

		const pointCount = sourcePoints.length / 3;
		if (pointCount <= 1) {
			return null;
		}

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let minZ = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		let maxZ = Number.NEGATIVE_INFINITY;
		for (let offset = 0; offset < sourcePoints.length; offset += 3) {
			const sourceX = sourcePoints[offset];
			const sourceY = sourcePoints[offset + 1];
			const sourceZ = sourcePoints[offset + 2];
			const targetX = targetPoints[offset];
			const targetY = targetPoints[offset + 1];
			const targetZ = targetPoints[offset + 2];

			minX = Math.min(minX, sourceX, targetX);
			minY = Math.min(minY, sourceY, targetY);
			minZ = Math.min(minZ, sourceZ, targetZ);
			maxX = Math.max(maxX, sourceX, targetX);
			maxY = Math.max(maxY, sourceY, targetY);
			maxZ = Math.max(maxZ, sourceZ, targetZ);
		}

		const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-3);
		const gridDivisions = clamp(
			Math.round(Math.cbrt(pointCount) * 0.9),
			MATCHING_GRID_MIN_DIVISIONS,
			MATCHING_GRID_MAX_DIVISIONS
		);
		const binSize = maxSpan / gridDivisions;
		const targetBins = new Map<string, number[]>();
		const matchedTarget = new Uint8Array(pointCount);
		const matchedPoints = new Float32Array(targetPoints.length);
		const matchedFlow = new Float32Array(targetFlow.length);

		const getBinIndex = (value: number, min: number) =>
			clamp(Math.floor((value - min) / binSize), 0, gridDivisions - 1);
		const getBinKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

		for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
			const offset = pointIndex * 3;
			const binX = getBinIndex(targetPoints[offset], minX);
			const binY = getBinIndex(targetPoints[offset + 1], minY);
			const binZ = getBinIndex(targetPoints[offset + 2], minZ);
			const key = getBinKey(binX, binY, binZ);
			const bucket = targetBins.get(key);
			if (bucket) {
				bucket.push(pointIndex);
			} else {
				targetBins.set(key, [pointIndex]);
			}
		}

		return {
			slot,
			jobId,
			eye,
			sourcePoints,
			sourceFlow,
			targetPoints,
			targetFlow,
			matchedPoints,
			matchedFlow,
			matchedTarget,
			targetBins,
			gridDivisions,
			binSize,
			minX,
			minY,
			minZ,
			nextSourceIndex: 0
		};
	}

	function buildExpandedTransitionToTarget(
		sourcePoints: Float32Array,
		sourceFlow: Float32Array,
		targetPoints: Float32Array,
		targetFlow: Float32Array
	) {
		if (
			sourcePoints.length !== sourceFlow.length ||
			targetPoints.length !== targetFlow.length ||
			sourcePoints.length <= 0 ||
			targetPoints.length <= 0
		) {
			return null;
		}

		const sourcePointCount = sourcePoints.length / 3;
		const targetPointCount = targetPoints.length / 3;
		if (sourcePointCount <= 0 || targetPointCount <= 0) {
			return null;
		}

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let minZ = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		let maxZ = Number.NEGATIVE_INFINITY;
		for (let offset = 0; offset < sourcePoints.length; offset += 3) {
			minX = Math.min(minX, sourcePoints[offset]);
			minY = Math.min(minY, sourcePoints[offset + 1]);
			minZ = Math.min(minZ, sourcePoints[offset + 2]);
			maxX = Math.max(maxX, sourcePoints[offset]);
			maxY = Math.max(maxY, sourcePoints[offset + 1]);
			maxZ = Math.max(maxZ, sourcePoints[offset + 2]);
		}
		for (let offset = 0; offset < targetPoints.length; offset += 3) {
			minX = Math.min(minX, targetPoints[offset]);
			minY = Math.min(minY, targetPoints[offset + 1]);
			minZ = Math.min(minZ, targetPoints[offset + 2]);
			maxX = Math.max(maxX, targetPoints[offset]);
			maxY = Math.max(maxY, targetPoints[offset + 1]);
			maxZ = Math.max(maxZ, targetPoints[offset + 2]);
		}

		const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-3);
		const gridDivisions = clamp(
			Math.round(Math.cbrt(Math.max(sourcePointCount, targetPointCount)) * 0.9),
			MATCHING_GRID_MIN_DIVISIONS,
			MATCHING_GRID_MAX_DIVISIONS
		);
		const binSize = maxSpan / gridDivisions;
		const sourceBins = new Map<string, number[]>();
		const expandedSourcePoints = new Float32Array(targetPoints.length);
		const expandedSourceFlow = new Float32Array(targetFlow.length);

		for (let pointIndex = 0; pointIndex < sourcePointCount; pointIndex++) {
			const offset = pointIndex * 3;
			const binX = getMatchingBinIndex(sourcePoints[offset], minX, binSize, gridDivisions);
			const binY = getMatchingBinIndex(sourcePoints[offset + 1], minY, binSize, gridDivisions);
			const binZ = getMatchingBinIndex(sourcePoints[offset + 2], minZ, binSize, gridDivisions);
			const key = getMatchingBinKey(binX, binY, binZ);
			const bucket = sourceBins.get(key);
			if (bucket) {
				bucket.push(pointIndex);
			} else {
				sourceBins.set(key, [pointIndex]);
			}
		}

		for (let targetIndex = 0; targetIndex < targetPointCount; targetIndex++) {
			const targetOffset = targetIndex * 3;
			const targetX = targetPoints[targetOffset];
			const targetY = targetPoints[targetOffset + 1];
			const targetZ = targetPoints[targetOffset + 2];
			const targetBinX = getMatchingBinIndex(targetX, minX, binSize, gridDivisions);
			const targetBinY = getMatchingBinIndex(targetY, minY, binSize, gridDivisions);
			const targetBinZ = getMatchingBinIndex(targetZ, minZ, binSize, gridDivisions);

			let bestSourceIndex = -1;
			let bestDistanceSq = Number.POSITIVE_INFINITY;

			for (
				let searchRadius = 0;
				searchRadius <= MATCHING_BIN_SEARCH_RADIUS && bestSourceIndex < 0;
				searchRadius++
			) {
				for (
					let binX = Math.max(0, targetBinX - searchRadius);
					binX <= Math.min(gridDivisions - 1, targetBinX + searchRadius);
					binX++
				) {
					for (
						let binY = Math.max(0, targetBinY - searchRadius);
						binY <= Math.min(gridDivisions - 1, targetBinY + searchRadius);
						binY++
					) {
						for (
							let binZ = Math.max(0, targetBinZ - searchRadius);
							binZ <= Math.min(gridDivisions - 1, targetBinZ + searchRadius);
							binZ++
						) {
							const bucket = sourceBins.get(getMatchingBinKey(binX, binY, binZ));
							if (!bucket) {
								continue;
							}

							for (const sourceIndex of bucket) {
								const sourceOffset = sourceIndex * 3;
								const dx = sourcePoints[sourceOffset] - targetX;
								const dy = sourcePoints[sourceOffset + 1] - targetY;
								const dz = sourcePoints[sourceOffset + 2] - targetZ;
								const distanceSq = dx * dx + dy * dy + dz * dz;
								if (distanceSq < bestDistanceSq) {
									bestDistanceSq = distanceSq;
									bestSourceIndex = sourceIndex;
								}
							}
						}
					}
				}
			}

			if (bestSourceIndex < 0) {
				for (let sourceIndex = 0; sourceIndex < sourcePointCount; sourceIndex++) {
					const sourceOffset = sourceIndex * 3;
					const dx = sourcePoints[sourceOffset] - targetX;
					const dy = sourcePoints[sourceOffset + 1] - targetY;
					const dz = sourcePoints[sourceOffset + 2] - targetZ;
					const distanceSq = dx * dx + dy * dy + dz * dz;
					if (distanceSq < bestDistanceSq) {
						bestDistanceSq = distanceSq;
						bestSourceIndex = sourceIndex;
					}
				}
			}

			if (bestSourceIndex < 0) {
				bestSourceIndex = Math.min(targetIndex, sourcePointCount - 1);
			}

			const sourceOffset = bestSourceIndex * 3;
			expandedSourcePoints[targetOffset] = sourcePoints[sourceOffset];
			expandedSourcePoints[targetOffset + 1] = sourcePoints[sourceOffset + 1];
			expandedSourcePoints[targetOffset + 2] = sourcePoints[sourceOffset + 2];
			expandedSourceFlow[targetOffset] = sourceFlow[sourceOffset];
			expandedSourceFlow[targetOffset + 1] = sourceFlow[sourceOffset + 1];
			expandedSourceFlow[targetOffset + 2] = sourceFlow[sourceOffset + 2];
		}

		return {
			sourcePoints: expandedSourcePoints,
			sourceFlow: expandedSourceFlow
		};
	}

	function findPendingTransitionTask(slot: ChunkSlot) {
		return pendingTransitionTasks.find((task) => task.slot === slot) ?? null;
	}

	function clearPendingTransitionTask(slot: ChunkSlot) {
		pendingTransitionTasks = pendingTransitionTasks.filter((task) => task.slot !== slot);
	}

	function getMatchingBinIndex(value: number, min: number, binSize: number, gridDivisions: number) {
		return clamp(Math.floor((value - min) / binSize), 0, gridDivisions - 1);
	}

	function getMatchingBinKey(x: number, y: number, z: number) {
		return `${x}|${y}|${z}`;
	}

	function assignTransitionTarget(task: PendingTransitionTask, sourceIndex: number) {
		const sourceOffset = sourceIndex * 3;
		const sourceX = task.sourcePoints[sourceOffset];
		const sourceY = task.sourcePoints[sourceOffset + 1];
		const sourceZ = task.sourcePoints[sourceOffset + 2];
		const sourceBinX = getMatchingBinIndex(sourceX, task.minX, task.binSize, task.gridDivisions);
		const sourceBinY = getMatchingBinIndex(sourceY, task.minY, task.binSize, task.gridDivisions);
		const sourceBinZ = getMatchingBinIndex(sourceZ, task.minZ, task.binSize, task.gridDivisions);

		let bestTargetIndex = -1;
		let bestDistanceSq = Number.POSITIVE_INFINITY;

		for (
			let searchRadius = 0;
			searchRadius <= MATCHING_BIN_SEARCH_RADIUS && bestTargetIndex < 0;
			searchRadius++
		) {
			for (
				let binX = Math.max(0, sourceBinX - searchRadius);
				binX <= Math.min(task.gridDivisions - 1, sourceBinX + searchRadius);
				binX++
			) {
				for (
					let binY = Math.max(0, sourceBinY - searchRadius);
					binY <= Math.min(task.gridDivisions - 1, sourceBinY + searchRadius);
					binY++
				) {
					for (
						let binZ = Math.max(0, sourceBinZ - searchRadius);
						binZ <= Math.min(task.gridDivisions - 1, sourceBinZ + searchRadius);
						binZ++
					) {
						const bucket = task.targetBins.get(getMatchingBinKey(binX, binY, binZ));
						if (!bucket) {
							continue;
						}

						for (const targetIndex of bucket) {
							if (task.matchedTarget[targetIndex]) {
								continue;
							}

							const targetOffset = targetIndex * 3;
							const dx = task.targetPoints[targetOffset] - sourceX;
							const dy = task.targetPoints[targetOffset + 1] - sourceY;
							const dz = task.targetPoints[targetOffset + 2] - sourceZ;
							const distanceSq = dx * dx + dy * dy + dz * dz;
							if (distanceSq < bestDistanceSq) {
								bestDistanceSq = distanceSq;
								bestTargetIndex = targetIndex;
							}
						}
					}
				}
			}
		}

		if (bestTargetIndex < 0) {
			const pointCount = task.targetPoints.length / 3;
			for (let targetIndex = 0; targetIndex < pointCount; targetIndex++) {
				if (task.matchedTarget[targetIndex]) {
					continue;
				}

				const targetOffset = targetIndex * 3;
				const dx = task.targetPoints[targetOffset] - sourceX;
				const dy = task.targetPoints[targetOffset + 1] - sourceY;
				const dz = task.targetPoints[targetOffset + 2] - sourceZ;
				const distanceSq = dx * dx + dy * dy + dz * dz;
				if (distanceSq < bestDistanceSq) {
					bestDistanceSq = distanceSq;
					bestTargetIndex = targetIndex;
				}
			}
		}

		if (bestTargetIndex < 0) {
			bestTargetIndex = sourceIndex;
		}

		task.matchedTarget[bestTargetIndex] = 1;
		const targetOffset = bestTargetIndex * 3;
		task.matchedPoints[sourceOffset] = task.targetPoints[targetOffset];
		task.matchedPoints[sourceOffset + 1] = task.targetPoints[targetOffset + 1];
		task.matchedPoints[sourceOffset + 2] = task.targetPoints[targetOffset + 2];
		task.matchedFlow[sourceOffset] = task.targetFlow[targetOffset];
		task.matchedFlow[sourceOffset + 1] = task.targetFlow[targetOffset + 1];
		task.matchedFlow[sourceOffset + 2] = task.targetFlow[targetOffset + 2];
	}

	function commitPendingTransitionTask(task: PendingTransitionTask) {
		const committedAtMs = performance.now();
		const transitionStartTimeMs = committedAtMs - SNAPSHOT_BUFFER_DELAY_MS;
		task.slot.snapshots = [
			{
				timeMs: transitionStartTimeMs,
				points: task.sourcePoints,
				flow: task.sourceFlow
			},
			{
				timeMs: transitionStartTimeMs + STATE_TRANSITION_DURATION_MS,
				points: task.matchedPoints,
				flow: task.matchedFlow
			}
		];
		task.slot.jobId = task.jobId;
		setSlotPlaybackPair(
			task.slot,
			task.slot.snapshots[0],
			task.slot.snapshots[1],
			task.sourcePoints,
			task.eye
		);
		task.slot.t = 0.0;
	}

	function commitTransitionSnapshot(
		slot: ChunkSlot,
		sourcePoints: Float32Array,
		sourceFlow: Float32Array,
		targetPoints: Float32Array,
		targetFlow: Float32Array,
		jobId: number,
		eye: { x: number; y: number; z: number }
	) {
		const committedAtMs = performance.now();
		const transitionStartTimeMs = committedAtMs - SNAPSHOT_BUFFER_DELAY_MS;
		slot.snapshots = [
			{
				timeMs: transitionStartTimeMs,
				points: sourcePoints,
				flow: sourceFlow
			},
			{
				timeMs: transitionStartTimeMs + STATE_TRANSITION_DURATION_MS,
				points: targetPoints,
				flow: targetFlow
			}
		];
		slot.jobId = jobId;
		setSlotPlaybackPair(slot, slot.snapshots[0], slot.snapshots[1], sourcePoints, eye);
		slot.t = 0.0;
	}

	function processPendingTransitionTasks() {
		const deadline = performance.now() + MATCHING_TIME_BUDGET_MS;
		while (pendingTransitionTasks.length > 0 && performance.now() < deadline) {
			const task = pendingTransitionTasks[0];
			const pointCount = task.sourcePoints.length / 3;
			let stepsRemaining = MATCHING_POINTS_PER_STEP;
			while (
				task.nextSourceIndex < pointCount &&
				stepsRemaining > 0 &&
				performance.now() < deadline
			) {
				assignTransitionTarget(task, task.nextSourceIndex);
				task.nextSourceIndex += 1;
				stepsRemaining -= 1;
			}

			if (task.nextSourceIndex >= pointCount) {
				commitPendingTransitionTask(task);
				pendingTransitionTasks.shift();
			}
		}
	}

	function repartitionSlotLods(
		slot: ChunkSlot,
		prevPoints: Float32Array,
		nextPoints: Float32Array,
		flow: Float32Array,
		sortPoints: Float32Array,
		eye: { x: number; y: number; z: number }
	) {
		const lodEntries: Array<
			Array<{
				prev: [number, number, number];
				next: [number, number, number];
				flow: [number, number, number];
			}>
		> = SPHERE_LOD_LEVELS.map(() => []);
		for (let offset = 0; offset < prevPoints.length; offset += 3) {
			const renderedCenter = toRenderedSphereCenter(
				sortPoints[offset],
				sortPoints[offset + 1],
				sortPoints[offset + 2]
			);
			const lodIndex = classifySphereLod(renderedCenter, eye);

			lodEntries[lodIndex].push({
				prev: [prevPoints[offset], prevPoints[offset + 1], prevPoints[offset + 2]],
				next: [nextPoints[offset], nextPoints[offset + 1], nextPoints[offset + 2]],
				flow: [flow[offset], flow[offset + 1], flow[offset + 2]]
			});
		}

		for (let lodIndex = 0; lodIndex < slot.lodBuffers.length; lodIndex++) {
			const prevArray = new Float32Array(lodEntries[lodIndex].length * 3);
			const nextArray = new Float32Array(lodEntries[lodIndex].length * 3);
			const flowArray = new Float32Array(lodEntries[lodIndex].length * 3);
			for (let entryIndex = 0; entryIndex < lodEntries[lodIndex].length; entryIndex++) {
				const dstOffset = entryIndex * 3;
				const entry = lodEntries[lodIndex][entryIndex];
				prevArray[dstOffset] = entry.prev[0];
				prevArray[dstOffset + 1] = entry.prev[1];
				prevArray[dstOffset + 2] = entry.prev[2];
				nextArray[dstOffset] = entry.next[0];
				nextArray[dstOffset + 1] = entry.next[1];
				nextArray[dstOffset + 2] = entry.next[2];
				flowArray[dstOffset] = entry.flow[0];
				flowArray[dstOffset + 1] = entry.flow[1];
				flowArray[dstOffset + 2] = entry.flow[2];
			}
			const lodBuffers = slot.lodBuffers[lodIndex];

			gl.bindBuffer(gl.ARRAY_BUFFER, lodBuffers.prevBuf);
			gl.bufferData(gl.ARRAY_BUFFER, prevArray, gl.DYNAMIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, lodBuffers.nextBuf);
			gl.bufferData(gl.ARRAY_BUFFER, nextArray, gl.DYNAMIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, lodBuffers.flowBuf);
			gl.bufferData(gl.ARRAY_BUFFER, flowArray, gl.DYNAMIC_DRAW);

			lodBuffers.pointCount = prevArray.length / 3;
		}
	}

	function setSlotPlaybackPair(
		slot: ChunkSlot,
		prevSnapshot: SlotSnapshot,
		nextSnapshot: SlotSnapshot,
		sortPoints: Float32Array,
		eye: { x: number; y: number; z: number }
	) {
		slot.prevPoints = prevSnapshot.points;
		slot.nextPoints = nextSnapshot.points;
		slot.flow = nextSnapshot.flow;
		slot.activePrevSnapshotTimeMs = prevSnapshot.timeMs;
		slot.activeNextSnapshotTimeMs = nextSnapshot.timeMs;
		repartitionSlotLods(slot, slot.prevPoints, slot.nextPoints, slot.flow, sortPoints, eye);
	}

	function syncSlotPlayback(
		slot: ChunkSlot,
		playbackTimeMs: number,
		eye: { x: number; y: number; z: number }
	) {
		if (slot.snapshots.length === 0) {
			slot.t = 1.0;
			return;
		}

		while (slot.snapshots.length > 2 && slot.snapshots[1].timeMs <= playbackTimeMs) {
			slot.snapshots.shift();
		}

		const prevSnapshot = slot.snapshots[0];
		const nextSnapshot = slot.snapshots[Math.min(1, slot.snapshots.length - 1)];
		const durationMs = Math.max(1, nextSnapshot.timeMs - prevSnapshot.timeMs);
		const segmentT = clamp((playbackTimeMs - prevSnapshot.timeMs) / durationMs, 0, 1);
		const sortPoints = new Float32Array(prevSnapshot.points.length);
		for (let index = 0; index < sortPoints.length; index++) {
			sortPoints[index] =
				prevSnapshot.points[index] +
				(nextSnapshot.points[index] - prevSnapshot.points[index]) * segmentT;
		}
		if (
			slot.activePrevSnapshotTimeMs !== prevSnapshot.timeMs ||
			slot.activeNextSnapshotTimeMs !== nextSnapshot.timeMs
		) {
			setSlotPlaybackPair(slot, prevSnapshot, nextSnapshot, sortPoints, eye);
		}

		slot.t = segmentT;
	}

	function enqueueSlotSnapshot(
		slot: ChunkSlot,
		snapshot: SlotSnapshot,
		eye: { x: number; y: number; z: number },
		jobId: number
	) {
		if (slot.pendingRefinement && slot.pendingRefinement.jobId === jobId) {
			slot.pendingRefinement.timeMs = snapshot.timeMs;
			slot.pendingRefinement.points = snapshot.points;
			slot.pendingRefinement.flow = snapshot.flow;
			return;
		}

		const pendingTask = findPendingTransitionTask(slot);
		if (pendingTask && pendingTask.jobId === jobId) {
			const rebuiltTask = buildPendingTransitionTask(
				pendingTask.sourcePoints,
				pendingTask.sourceFlow,
				snapshot.points,
				snapshot.flow,
				slot,
				jobId,
				eye
			);
			if (!rebuiltTask) {
				commitTransitionSnapshot(
					slot,
					pendingTask.sourcePoints,
					pendingTask.sourceFlow,
					snapshot.points,
					snapshot.flow,
					jobId,
					eye
				);
				pendingTransitionTasks = pendingTransitionTasks.filter((task) => task !== pendingTask);
				return;
			}
			const taskIndex = pendingTransitionTasks.indexOf(pendingTask);
			pendingTransitionTasks[taskIndex] = rebuiltTask;
			return;
		}

		if (slot.jobId !== jobId) {
			const currentRenderedPoints = sampleRenderedPoints(slot);
			const transitionTask = buildPendingTransitionTask(
				currentRenderedPoints,
				slot.flow.slice(),
				snapshot.points,
				snapshot.flow,
				slot,
				jobId,
				eye
			);
			if (!transitionTask) {
				commitTransitionSnapshot(
					slot,
					currentRenderedPoints,
					slot.flow.slice(),
					snapshot.points,
					snapshot.flow,
					jobId,
					eye
				);
				return;
			}
			pendingTransitionTasks.push(transitionTask);
			return;
		}

		slot.snapshots.push(snapshot);
		while (slot.snapshots.length > MAX_SNAPSHOTS_PER_SLOT) {
			slot.snapshots.shift();
		}
	}

	// Allocates a brand-new slot with both prev and next set to the same points
	// so it appears immediately with no transition.
	function createSlot(
		points: Float32Array,
		flow: Float32Array,
		eye: { x: number; y: number; z: number },
		receivedAtMs: number,
		jobId: number
	): ChunkSlot {
		if (sphereMeshes.length !== SPHERE_LOD_LEVELS.length) {
			throw new Error('Sphere mesh must be created before chunk slots');
		}

		const initialSnapshot: SlotSnapshot = {
			timeMs: receivedAtMs,
			points,
			flow
		};

		const slot: ChunkSlot = {
			lodBuffers: sphereMeshes.map((mesh) => createLodBuffers(mesh)),
			snapshots: [initialSnapshot],
			prevPoints: initialSnapshot.points,
			nextPoints: initialSnapshot.points,
			flow: initialSnapshot.flow,
			t: 1.0, // start fully arrived
			activePrevSnapshotTimeMs: receivedAtMs,
			activeNextSnapshotTimeMs: receivedAtMs,
			pendingRefinement: null,
			jobId
		};
		maybeAutoFitCamera(points, jobId);
		repartitionSlotLods(slot, slot.prevPoints, slot.nextPoints, slot.flow, slot.prevPoints, eye);
		return slot;
	}

	function updateSlot(
		slot: ChunkSlot,
		newPoints: Float32Array,
		flow: Float32Array,
		eye: { x: number; y: number; z: number },
		receivedAtMs: number,
		jobId: number
	) {
		maybeAutoFitCamera(newPoints, jobId);
		enqueueSlotSnapshot(
			slot,
			{
				timeMs: receivedAtMs,
				points: newPoints,
				flow
			},
			eye,
			jobId
		);
	}

	function replaceSlot(
		slot: ChunkSlot,
		points: Float32Array,
		flow: Float32Array,
		eye: { x: number; y: number; z: number },
		receivedAtMs: number,
		jobId: number
	) {
		clearPendingTransitionTask(slot);
		slot.pendingRefinement = null;
		const snapshot: SlotSnapshot = {
			timeMs: receivedAtMs,
			points,
			flow
		};
		slot.snapshots = [snapshot];
		slot.prevPoints = snapshot.points;
		slot.nextPoints = snapshot.points;
		slot.flow = snapshot.flow;
		slot.t = 1.0;
		slot.activePrevSnapshotTimeMs = receivedAtMs;
		slot.activeNextSnapshotTimeMs = receivedAtMs;
		slot.jobId = jobId;
		maybeAutoFitCamera(points, jobId);
		repartitionSlotLods(
			slot,
			snapshot.points,
			snapshot.points,
			snapshot.flow,
			snapshot.points,
			eye
		);
	}

	function queueSlotRefinement(
		slot: ChunkSlot,
		points: Float32Array,
		flow: Float32Array,
		receivedAtMs: number,
		jobId: number
	) {
		slot.pendingRefinement = {
			timeMs: receivedAtMs,
			points,
			flow,
			jobId,
			started: false
		};
	}

	function processPendingSlotRefinements(eye: { x: number; y: number; z: number }) {
		for (const slot of slots) {
			const pendingRefinement = slot.pendingRefinement;
			if (!pendingRefinement) {
				continue;
			}

			if (slot.jobId !== pendingRefinement.jobId) {
				continue;
			}

			if (findPendingTransitionTask(slot)) {
				continue;
			}

			if (slot.t < 0.999) {
				continue;
			}

			if (pendingRefinement.started) {
				replaceSlot(
					slot,
					pendingRefinement.points,
					pendingRefinement.flow,
					eye,
					pendingRefinement.timeMs,
					pendingRefinement.jobId
				);
				continue;
			}

			const sourcePoints = sampleRenderedPoints(slot);
			const expandedTransition = buildExpandedTransitionToTarget(
				sourcePoints,
				slot.flow.slice(),
				pendingRefinement.points,
				pendingRefinement.flow
			);
			if (!expandedTransition) {
				replaceSlot(
					slot,
					pendingRefinement.points,
					pendingRefinement.flow,
					eye,
					pendingRefinement.timeMs,
					pendingRefinement.jobId
				);
				continue;
			}

			commitTransitionSnapshot(
				slot,
				expandedTransition.sourcePoints,
				expandedTransition.sourceFlow,
				pendingRefinement.points,
				pendingRefinement.flow,
				pendingRefinement.jobId,
				eye
			);
			pendingRefinement.started = true;
		}
	}

	function refreshSlotLods(eye: { x: number; y: number; z: number }) {
		for (const slot of slots) {
			repartitionSlotLods(
				slot,
				slot.prevPoints,
				slot.nextPoints,
				slot.flow,
				sampleRenderedPoints(slot),
				eye
			);
		}
	}

	function shouldRefreshLods(now: number) {
		if (isDraggingCamera) {
			return false;
		}

		if (now - lastLodRefreshAtMs < LOD_REFRESH_INTERVAL_MS) {
			return false;
		}

		if (Math.abs(cameraRadius - lastLodCameraRadius) > LOD_RADIUS_EPSILON) {
			return true;
		}

		if (Math.abs(cameraAzimuth - lastLodCameraAzimuth) > LOD_ROTATION_EPSILON) {
			return true;
		}

		return Math.abs(cameraElevation - lastLodCameraElevation) > LOD_ROTATION_EPSILON;
	}

	function markLodsRefreshed(now: number) {
		lastLodRefreshAtMs = now;
		lastLodCameraAzimuth = cameraAzimuth;
		lastLodCameraElevation = cameraElevation;
		lastLodCameraRadius = cameraRadius;
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
					slotIndex?: number;
					replace?: boolean;
					message?: string;
					jobId: number;
				}>
			) => {
				const { status, progress, points, flow, slotIndex, replace, message, jobId } = e.data;
				if (jobId !== currentJobId) {
					return;
				}

				if (status === STATUS_PROCESSING) {
					worker_state = STATUS_PROCESSING;
					worker_progress = progress ?? 0;

					if (points && flow && points.length > 0 && typeof slotIndex === 'number') {
						const receivedAtMs = performance.now();
						const eye = getCameraEye();

						if (slotIndex >= slots.length) {
							slots.push(createSlot(points, flow, eye, receivedAtMs, jobId));
						} else if (replace) {
							queueSlotRefinement(slots[slotIndex], points, flow, receivedAtMs, jobId);
						} else {
							updateSlot(slots[slotIndex], points, flow, eye, receivedAtMs, jobId);
						}
					}
				} else if (status === STATUS_FINISHED) {
					worker_state = STATUS_FINISHED;
					if (!hasCompletedInitialHydration && slots.length > 0) {
						hasCompletedInitialHydration = true;
					}
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
		pendingTransitionTasks = [];
		lastAutoFitRadiusForJob = 0;

		worker_state = STATUS_IDLE;
		worker.postMessage({
			n,
			l,
			m,
			count: TOTAL_POINT_COUNT,
			slotCount: TARGET_CHUNK_SLOTS,
			cameraRadius,
			progressiveHydration: !hasCompletedInitialHydration,
			jobId: currentJobId
		});
	}

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

		refreshSlotLods(getCameraEye());
		markLodsRefreshed(performance.now());

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
		markLodsRefreshed(0);

		gl = canvas.getContext('webgl2')!;

		canvas.width = canvas.clientWidth || window.innerWidth;
		canvas.height = canvas.clientHeight || window.innerHeight;

		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);

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
		uCameraPosition = gl.getUniformLocation(sphereProgram, 'uCameraPosition');
		uSphereRadius = gl.getUniformLocation(sphereProgram, 'uSphereRadius');
		uHidePositiveQuadrant = gl.getUniformLocation(sphereProgram, 'uHidePositiveQuadrant');
		gl.useProgram(lineProgram);
		lUProj = gl.getUniformLocation(lineProgram, 'uProj');
		lUView = gl.getUniformLocation(lineProgram, 'uView');
		lUColor = gl.getUniformLocation(lineProgram, 'uColor');

		sphereMeshes = SPHERE_LOD_LEVELS.map((level) =>
			createSphereMesh(buildSphereTriangles(level.latSegments, level.lonSegments))
		);
		axisMesh = createLineMesh(buildAxesSegments(20));

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

			processPendingTransitionTasks();
			const eye = getCameraEye();
			const view = lookAt(eye, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
			const playbackTimeMs = now - SNAPSHOT_BUFFER_DELAY_MS;
			for (const slot of slots) {
				syncSlotPlayback(slot, playbackTimeMs, eye);
			}
			processPendingSlotRefinements(eye);
			if (shouldRefreshLods(now)) {
				refreshSlotLods(eye);
				markLodsRefreshed(now);
			}
			gl.useProgram(sphereProgram);
			gl.uniformMatrix4fv(uView, false, view);
			gl.uniform1f(uCloudTime, now * 0.001);
			gl.uniform1f(uFlowStrength, FLOW_STRENGTH);
			gl.uniform1f(uFlowMaxSpeed, FLOW_MAX_SPEED);
			gl.uniform1f(uFlowAnimationSpeed, FLOW_ANIMATION_SPEED);
			gl.uniform1f(uCameraRadius, cameraRadius);
			gl.uniform3f(uCameraPosition, eye.x, eye.y, eye.z);
			gl.uniform1f(uSphereRadius, BASE_SPHERE_RADIUS);
			gl.uniform1f(uHidePositiveQuadrant, hidePositiveQuadrant ? 1.0 : 0.0);

			gl.useProgram(lineProgram);
			gl.uniformMatrix4fv(lUView, false, view);

			//gl.clearColor(0.058, 0.086, 0.118, 1.0);
			gl.clearColor(0.05, 0.05, 0.07, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			if (axisMesh) {
				gl.useProgram(lineProgram);
				gl.uniform4f(lUColor, 0.92, 0.82, 0.65, 0.5);
				gl.bindVertexArray(axisMesh.vao);
				gl.drawArrays(gl.LINES, 0, axisMesh.vertexCount);
			}

			gl.useProgram(sphereProgram);
			let frameRenderedPointCount = 0;
			for (const slot of slots) {
				gl.uniform1f(uT, slot.t);
				for (let lodIndex = 0; lodIndex < slot.lodBuffers.length; lodIndex++) {
					const lodBuffers = slot.lodBuffers[lodIndex];
					if (lodBuffers.pointCount <= 0) {
						continue;
					}

					gl.bindVertexArray(lodBuffers.vao);
					frameRenderedPointCount += lodBuffers.pointCount;
					gl.drawArraysInstanced(
						gl.TRIANGLES,
						0,
						sphereMeshes[lodIndex]?.vertexCount ?? 0,
						lodBuffers.pointCount
					);
				}
			}
			renderedPointCount = frameRenderedPointCount;

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
	<div class="relative min-h-0 flex-1">
		<div
			class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_18%,rgba(126,255,163,0.14),transparent_40%),radial-gradient(circle_at_78%_12%,rgba(214,255,228,0.05),transparent_32%),linear-gradient(135deg,#081017_0%,#0e1b25_60%,#142431_100%)]"
		></div>
		<div
			class="pointer-events-none absolute top-3 left-3 z-20 rounded border border-[rgba(44,61,75,0.18)] bg-[rgba(243,229,205,0.86)] px-2 py-1 text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase backdrop-blur-sm"
		>
			FPS {fps} | Points {renderedPointCount}
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
