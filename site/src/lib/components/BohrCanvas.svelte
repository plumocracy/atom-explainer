<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { loadCameraPose, saveCameraPose } from '$lib/camera-storage';
	import { bohrSimulationValues, getBohrShellDistribution } from '$lib/chat.svelte';
	import { lookAt, perspective } from '$lib/render_math';

	type PlaneBasis = {
		u: [number, number, number];
		v: [number, number, number];
	};

	type ElectronOrbit = {
		radius: number;
		baseAngle: number;
		speed: number;
		direction: number;
		plane: PlaneBasis;
	};

	type Mesh = {
		vao: WebGLVertexArrayObject;
		vbo: WebGLBuffer;
		vertexCount: number;
	};

	type InstancedSphereBuffers = {
		vao: WebGLVertexArrayObject;
		instanceVbo: WebGLBuffer;
		pointCount: number;
	};

	let canvas = $state<HTMLCanvasElement | null>(null);
	let gl: WebGL2RenderingContext | null = null;
	let frameId = 0;
	let elapsedMs = 0;
	let lastTick = 0;

	let atomicNumber = $derived(bohrSimulationValues.atomicNumber);
	const shellDistribution = $derived.by(() => getBohrShellDistribution(atomicNumber));


	const ringSegments = 128;
	const ELECTRON_SPHERE_RADIUS = 0.16;
	const NUCLEUS_SPHERE_RADIUS = 0.68;
	const BOHR_MAX_RENDER_RADIUS = 12.0;

	let lineProgram: WebGLProgram | null = null;
	let sphereProgram: WebGLProgram | null = null;

	let lineUProj: WebGLUniformLocation | null = null;
	let lineUView: WebGLUniformLocation | null = null;
	let lineUColor: WebGLUniformLocation | null = null;

	let sphereUProj: WebGLUniformLocation | null = null;
	let sphereUView: WebGLUniformLocation | null = null;
	let sphereUCameraPosition: WebGLUniformLocation | null = null;
	let sphereUSphereRadius: WebGLUniformLocation | null = null;

	let ringVbo: WebGLBuffer | null = null;
	let axisVbo: WebGLBuffer | null = null;
	let electronSpheres: InstancedSphereBuffers | null = null;
	let nucleusSphere: InstancedSphereBuffers | null = null;
	let sphereMesh: Mesh | null = null;

	let ringVertexCount = 0;
	let axisVertexCount = 0;
	let electronOrbits: ElectronOrbit[] = [];
	let electronPositions = new Float32Array(0);

	let cameraAzimuth = 0.95;
	let cameraElevation = 0.52;
	let cameraRadius = 17;
	const minCameraRadius = 9;
	const maxCameraRadius = 34;
	const minCameraElevation = -1.2;
	const maxCameraElevation = 1.2;
	const BOHR_CAMERA_STORAGE_KEY = 'my-atom.camera.bohr.v1';

	let isDraggingCamera = false;
	let activePointerId: number | null = null;
	let lastPointerX = 0;
	let lastPointerY = 0;

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
	const persistCameraPose = () => {
		saveCameraPose(BOHR_CAMERA_STORAGE_KEY, {
			azimuth: cameraAzimuth,
			elevation: cameraElevation,
			radius: cameraRadius
		});
	};

	const createPlaneBasis = (): PlaneBasis => {
		return {
			u: [1, 0, 0],
			v: [0, 0, 1]
		};
	};

	const pointOnOrbit = (radius: number, angle: number, plane: PlaneBasis) => {
		const c = Math.cos(angle);
		const s = Math.sin(angle);

		return {
			x: radius * (plane.u[0] * c + plane.v[0] * s),
			y: radius * (plane.u[1] * c + plane.v[1] * s),
			z: radius * (plane.u[2] * c + plane.v[2] * s)
		};
	};

	const createShader = (glContext: WebGL2RenderingContext, type: number, src: string) => {
		const shader = glContext.createShader(type);
		if (!shader) {
			throw new Error('Could not create shader');
		}

		glContext.shaderSource(shader, src);
		glContext.compileShader(shader);
		if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
			const info = glContext.getShaderInfoLog(shader);
			glContext.deleteShader(shader);
			throw new Error(info ?? 'Could not compile shader');
		}

		return shader;
	};

	const createProgram = (glContext: WebGL2RenderingContext, vertSrc: string, fragSrc: string) => {
		const vert = createShader(glContext, glContext.VERTEX_SHADER, vertSrc);
		const frag = createShader(glContext, glContext.FRAGMENT_SHADER, fragSrc);

		const prog = glContext.createProgram();
		if (!prog) {
			throw new Error('Could not create program');
		}

		glContext.attachShader(prog, vert);
		glContext.attachShader(prog, frag);
		glContext.linkProgram(prog);

		glContext.deleteShader(vert);
		glContext.deleteShader(frag);

		if (!glContext.getProgramParameter(prog, glContext.LINK_STATUS)) {
			const info = glContext.getProgramInfoLog(prog);
			glContext.deleteProgram(prog);
			throw new Error(info ?? 'Could not link program');
		}

		return prog;
	};

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

	const sphereVs = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 center;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uSphereRadius;
out vec3 vWorldPosition;
out vec3 vNormal;
out float vRadialRatio;
void main() {
  vRadialRatio = clamp(length(center) / ${BOHR_MAX_RENDER_RADIUS.toFixed(1)}, 0.0, 1.0);
  vec3 worldPos = center + position * uSphereRadius;
  vWorldPosition = worldPos;
  vNormal = normal;
  gl_Position = uProj * uView * vec4(worldPos, 1.0);
}`;

	const sphereFs = `#version 300 es
precision highp float;
uniform vec3 uCameraPosition;
in vec3 vWorldPosition;
in vec3 vNormal;
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
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 lightDirA = normalize(vec3(0.28, 0.94, 0.2));
  vec3 lightDirB = normalize(vec3(-0.76, 0.18, 0.62));
  vec3 lightRadianceA = vec3(2.4, 1.95, 1.18);
  vec3 lightRadianceB = vec3(0.52, 0.44, 0.28);
  vec3 baseColor = vec3(0.63, 0.06, 0.53);
  vec3 farColor = vec3(0.98, 0.51, 0.89);
  float radialFade = smoothstep(0.08, 1.0, vRadialRatio);
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
  fragColor = vec4(color, 1.0);
}`;

	const buildSphereTriangles = (latSegments = 6, lonSegments = 8): Float32Array => {
		const vertices: number[] = [];

		const pushVertex = (theta: number, phi: number) => {
			const sinTheta = Math.sin(theta);
			const x = sinTheta * Math.cos(phi);
			const y = Math.cos(theta);
			const z = sinTheta * Math.sin(phi);
			vertices.push(x, y, z, x, y, z);
		};

		for (let lat = 0; lat < latSegments; lat += 1) {
			const theta0 = (lat / latSegments) * Math.PI;
			const theta1 = ((lat + 1) / latSegments) * Math.PI;
			for (let lon = 0; lon < lonSegments; lon += 1) {
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
	};

	const createSphereMesh = (glContext: WebGL2RenderingContext, vertices: Float32Array): Mesh => {
		const vao = glContext.createVertexArray();
		const vbo = glContext.createBuffer();
		if (!vao || !vbo) {
			throw new Error('Could not create sphere mesh');
		}

		glContext.bindVertexArray(vao);
		glContext.bindBuffer(glContext.ARRAY_BUFFER, vbo);
		glContext.bufferData(glContext.ARRAY_BUFFER, vertices, glContext.STATIC_DRAW);
		glContext.enableVertexAttribArray(0);
		glContext.vertexAttribPointer(0, 3, glContext.FLOAT, false, 24, 0);
		glContext.enableVertexAttribArray(1);
		glContext.vertexAttribPointer(1, 3, glContext.FLOAT, false, 24, 12);
		glContext.bindVertexArray(null);

		return { vao, vbo, vertexCount: vertices.length / 6 };
	};

	const createInstancedSphereBuffers = (
		glContext: WebGL2RenderingContext,
		mesh: Mesh
	): InstancedSphereBuffers => {
		const vao = glContext.createVertexArray();
		const instanceVbo = glContext.createBuffer();
		if (!vao || !instanceVbo) {
			throw new Error('Could not create instanced sphere buffers');
		}

		glContext.bindVertexArray(vao);
		glContext.bindBuffer(glContext.ARRAY_BUFFER, mesh.vbo);
		glContext.enableVertexAttribArray(0);
		glContext.vertexAttribPointer(0, 3, glContext.FLOAT, false, 24, 0);
		glContext.enableVertexAttribArray(1);
		glContext.vertexAttribPointer(1, 3, glContext.FLOAT, false, 24, 12);

		glContext.bindBuffer(glContext.ARRAY_BUFFER, instanceVbo);
		glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array(0), glContext.DYNAMIC_DRAW);
		glContext.enableVertexAttribArray(2);
		glContext.vertexAttribPointer(2, 3, glContext.FLOAT, false, 0, 0);
		glContext.vertexAttribDivisor(2, 1);
		glContext.bindVertexArray(null);

		return { vao, instanceVbo, pointCount: 0 };
	};

	const buildAxesSegments = (length = 12): Float32Array => {
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
	};

	const rebuildModel = () => {
		if (!gl || !ringVbo || !electronSpheres || !nucleusSphere) {
			return;
		}

		const ringVertices: number[] = [];
		const orbits: ElectronOrbit[] = [];

		shellDistribution.forEach((electronCount, shellIndex) => {
			const radius = 2.8 + shellIndex * 1.9;
			const plane = createPlaneBasis();

			for (let i = 0; i < ringSegments; i += 1) {
				const a0 = (i / ringSegments) * Math.PI * 2;
				const a1 = ((i + 1) / ringSegments) * Math.PI * 2;

				const p0 = pointOnOrbit(radius, a0, plane);
				const p1 = pointOnOrbit(radius, a1, plane);

				ringVertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
			}

			for (let i = 0; i < electronCount; i += 1) {
				orbits.push({
					radius,
					baseAngle: (i / electronCount) * Math.PI * 2,
					speed: 0.55 / (shellIndex + 1),
					direction: 1,
					plane
				});
			}
		});

		electronOrbits = orbits;
		electronPositions = new Float32Array(electronOrbits.length * 3);
		ringVertexCount = ringVertices.length / 3;

		gl.bindBuffer(gl.ARRAY_BUFFER, ringVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ringVertices), gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, electronSpheres.instanceVbo);
		gl.bufferData(gl.ARRAY_BUFFER, electronPositions.byteLength, gl.DYNAMIC_DRAW);
		electronSpheres.pointCount = electronOrbits.length;

		gl.bindBuffer(gl.ARRAY_BUFFER, nucleusSphere.instanceVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.STATIC_DRAW);
		nucleusSphere.pointCount = 1;
	};

	$effect(() => {
		void shellDistribution;
		rebuildModel();
	});

	const uploadProjection = () => {
		if (!gl || !canvas || !lineProgram || !sphereProgram || !lineUProj || !sphereUProj) {
			return;
		}

		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
		const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		gl.viewport(0, 0, width, height);
		const proj = perspective(Math.PI / 4, width / height, 0.1, 120);

		gl.useProgram(lineProgram);
		gl.uniformMatrix4fv(lineUProj, false, proj);

		gl.useProgram(sphereProgram);
		gl.uniformMatrix4fv(sphereUProj, false, proj);
	};

	const updateElectrons = () => {
		if (!gl || !electronSpheres || electronOrbits.length === 0) {
			return;
		}

		const t = elapsedMs * 0.001;
		for (let i = 0; i < electronOrbits.length; i += 1) {
			const orbit = electronOrbits[i];
			const angle = orbit.baseAngle + t * orbit.speed * orbit.direction;
			const pos = pointOnOrbit(orbit.radius, angle, orbit.plane);

			const offset = i * 3;
			electronPositions[offset] = pos.x;
			electronPositions[offset + 1] = pos.y;
			electronPositions[offset + 2] = pos.z;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, electronSpheres.instanceVbo);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, electronPositions);
	};

	const drawFrame = (dtMs: number) => {
		if (
			!gl ||
			!lineProgram ||
			!sphereProgram ||
			!lineUView ||
			!lineUColor ||
			!sphereUView ||
			!sphereUCameraPosition ||
			!sphereUSphereRadius ||
			!ringVbo ||
			!electronSpheres ||
			!nucleusSphere ||
			!sphereMesh
		) {
			return;
		}

		elapsedMs += dtMs;

		uploadProjection();

		const azimuth = cameraAzimuth;
		const horizontalRadius = Math.cos(cameraElevation) * cameraRadius;

		const eye = {
			x: Math.cos(azimuth) * horizontalRadius,
			y: Math.sin(cameraElevation) * cameraRadius,
			z: Math.sin(azimuth) * horizontalRadius
		};

		const view = lookAt(eye, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

		gl.clearColor(0.058, 0.086, 0.118, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.useProgram(lineProgram);
		gl.uniformMatrix4fv(lineUView, false, view);

		if (axisVbo && axisVertexCount > 0) {
			gl.uniform4f(lineUColor, 0.92, 0.82, 0.65, 0.5);
			gl.bindBuffer(gl.ARRAY_BUFFER, axisVbo);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
			gl.drawArrays(gl.LINES, 0, axisVertexCount);
		}

		gl.uniform4f(lineUColor, 0.89, 0.76, 0.58, 0.4);
		gl.bindBuffer(gl.ARRAY_BUFFER, ringVbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.LINES, 0, ringVertexCount);

		updateElectrons();

		gl.useProgram(sphereProgram);
		gl.uniformMatrix4fv(sphereUView, false, view);
		gl.uniform3f(sphereUCameraPosition, eye.x, eye.y, eye.z);

		gl.uniform1f(sphereUSphereRadius, ELECTRON_SPHERE_RADIUS);
		gl.bindVertexArray(electronSpheres.vao);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, sphereMesh.vertexCount, electronSpheres.pointCount);

		gl.uniform1f(sphereUSphereRadius, NUCLEUS_SPHERE_RADIUS);
		gl.bindVertexArray(nucleusSphere.vao);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, sphereMesh.vertexCount, nucleusSphere.pointCount);
		gl.bindVertexArray(null);
	};

	const render = (now: number) => {
		if (!gl || !canvas) {
			return;
		}

		const dt = lastTick ? now - lastTick : 16;
		lastTick = now;

		drawFrame(dt);
		frameId = requestAnimationFrame(render);
	};

	const onCanvasPointerDown = (event: PointerEvent) => {
		if (!canvas) {
			return;
		}

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

		cameraAzimuth -= dx * 0.0065;
		cameraElevation = clamp(cameraElevation - dy * 0.0055, minCameraElevation, maxCameraElevation);
	};

	const onCanvasPointerUp = (event: PointerEvent) => {
		if (!canvas || activePointerId !== event.pointerId) {
			return;
		}

		isDraggingCamera = false;
		activePointerId = null;
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}

		persistCameraPose();
	};

	const onCanvasWheel = (event: WheelEvent) => {
		event.preventDefault();
		const zoomStep = event.deltaY > 0 ? 1.08 : 0.92;
		cameraRadius = clamp(cameraRadius * zoomStep, minCameraRadius, maxCameraRadius);
		persistCameraPose();
	};

	onMount(() => {
		if (!browser || !canvas) {
			return;
		}

		const restoredCamera = loadCameraPose(
			BOHR_CAMERA_STORAGE_KEY,
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

		gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
		if (!gl) {
			return;
		}

		lineProgram = createProgram(gl, lineVs, lineFs);
		sphereProgram = createProgram(gl, sphereVs, sphereFs);

		lineUProj = gl.getUniformLocation(lineProgram, 'uProj');
		lineUView = gl.getUniformLocation(lineProgram, 'uView');
		lineUColor = gl.getUniformLocation(lineProgram, 'uColor');

		sphereUProj = gl.getUniformLocation(sphereProgram, 'uProj');
		sphereUView = gl.getUniformLocation(sphereProgram, 'uView');
		sphereUCameraPosition = gl.getUniformLocation(sphereProgram, 'uCameraPosition');
		sphereUSphereRadius = gl.getUniformLocation(sphereProgram, 'uSphereRadius');

		ringVbo = gl.createBuffer();
		axisVbo = gl.createBuffer();
		if (!ringVbo || !axisVbo) {
			return;
		}

		sphereMesh = createSphereMesh(gl, buildSphereTriangles(32, 48));
		electronSpheres = createInstancedSphereBuffers(gl, sphereMesh);
		nucleusSphere = createInstancedSphereBuffers(gl, sphereMesh);

		const axisVertices = buildAxesSegments(12);
		axisVertexCount = axisVertices.length / 3;
		gl.bindBuffer(gl.ARRAY_BUFFER, axisVbo);
		gl.bufferData(gl.ARRAY_BUFFER, axisVertices, gl.STATIC_DRAW);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		rebuildModel();
		uploadProjection();

		window.addEventListener('resize', uploadProjection);
		frameId = requestAnimationFrame(render);
	});

	onDestroy(() => {
		if (!browser) {
			return;
		}

		if (frameId) {
			cancelAnimationFrame(frameId);
		}

		persistCameraPose();
		window.removeEventListener('resize', uploadProjection);
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden text-[var(--color-exhibit-paper)]">
	<div class="relative min-h-0 flex-1">
		<div
			class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_18%,rgba(126,255,163,0.14),transparent_40%),radial-gradient(circle_at_78%_12%,rgba(214,255,228,0.05),transparent_32%),linear-gradient(135deg,#081017_0%,#0e1b25_60%,#142431_100%)]"
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
