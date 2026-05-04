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

	let canvas = $state<HTMLCanvasElement | null>(null);
	let gl: WebGL2RenderingContext | null = null;
	let frameId = 0;
	let elapsedMs = 0;
	let lastTick = 0;

	let atomicNumber = $derived(bohrSimulationValues.atomicNumber);

	const ringSegments = 128;

	let lineProgram: WebGLProgram | null = null;
	let pointProgram: WebGLProgram | null = null;

	let lineUProj: WebGLUniformLocation | null = null;
	let lineUView: WebGLUniformLocation | null = null;
	let lineUColor: WebGLUniformLocation | null = null;

	let pointUProj: WebGLUniformLocation | null = null;
	let pointUView: WebGLUniformLocation | null = null;
	let pointUColor: WebGLUniformLocation | null = null;
	let pointUSize: WebGLUniformLocation | null = null;

	let ringVbo: WebGLBuffer | null = null;
	let gridVbo: WebGLBuffer | null = null;
	let axisVbo: WebGLBuffer | null = null;
	let electronVbo: WebGLBuffer | null = null;
	let nucleusVbo: WebGLBuffer | null = null;

	let ringVertexCount = 0;
	let gridVertexCount = 0;
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

	const clampAtomicNumber = (next: number) => {
		bohrSimulationValues.atomicNumber = Math.max(1, Math.min(20, next));
	};

	const shellDistribution = $derived.by(() => {
		return getBohrShellDistribution(atomicNumber);
	});

	const shellSummary = $derived(shellDistribution.join(', '));

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
	const persistCameraPose = () => {
		saveCameraPose(BOHR_CAMERA_STORAGE_KEY, {
			azimuth: cameraAzimuth,
			elevation: cameraElevation,
			radius: cameraRadius
		});
	};

	const normalize = (v: [number, number, number]): [number, number, number] => {
		const len = Math.hypot(v[0], v[1], v[2]);
		if (len <= 1e-8) {
			return [0, 0, 0];
		}

		return [v[0] / len, v[1] / len, v[2] / len];
	};

	const cross = (
		a: [number, number, number],
		b: [number, number, number]
	): [number, number, number] => {
		return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	};

	const createPlaneBasis = (_shellIndex: number): PlaneBasis => {
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

	const pointVs = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uPointSize;
void main() {
  gl_Position = uProj * uView * vec4(position, 1.0);
  gl_PointSize = uPointSize;
}`;

	const pointFs = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.0, d) * uColor.a;
  fragColor = vec4(uColor.rgb, alpha);
}`;

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

	const buildPlaneGridSegments = (halfSize = 11, step = 2): Float32Array => {
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
	};

	const rebuildModel = () => {
		if (!gl || !ringVbo || !electronVbo) {
			return;
		}

		const ringVertices: number[] = [];
		const orbits: ElectronOrbit[] = [];

		shellDistribution.forEach((electronCount, shellIndex) => {
			const radius = 2.8 + shellIndex * 1.9;
			const plane = createPlaneBasis(shellIndex);

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

		gl.bindBuffer(gl.ARRAY_BUFFER, electronVbo);
		gl.bufferData(gl.ARRAY_BUFFER, electronPositions.byteLength, gl.DYNAMIC_DRAW);
	};

	$effect(() => {
		shellDistribution;
		rebuildModel();
	});

	const uploadProjection = () => {
		if (!gl || !canvas || !lineProgram || !pointProgram || !lineUProj || !pointUProj) {
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

		gl.useProgram(pointProgram);
		gl.uniformMatrix4fv(pointUProj, false, proj);
	};

	const updateElectrons = () => {
		if (!gl || !electronVbo || electronOrbits.length === 0) {
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

		gl.bindBuffer(gl.ARRAY_BUFFER, electronVbo);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, electronPositions);
	};

	const drawFrame = (dtMs: number) => {
		if (
			!gl ||
			!lineProgram ||
			!pointProgram ||
			!lineUView ||
			!lineUColor ||
			!pointUView ||
			!pointUColor ||
			!pointUSize ||
			!ringVbo ||
			!electronVbo ||
			!nucleusVbo
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

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.useProgram(lineProgram);
		gl.uniformMatrix4fv(lineUView, false, view);

		if (gridVbo && gridVertexCount > 0) {
			gl.uniform4f(lineUColor, 0.84, 0.69, 0.47, 0.11);
			gl.bindBuffer(gl.ARRAY_BUFFER, gridVbo);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
			gl.drawArrays(gl.LINES, 0, gridVertexCount);
		}

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

		gl.useProgram(pointProgram);
		gl.uniformMatrix4fv(pointUView, false, view);

		gl.uniform4f(pointUColor, 0.7, 0.86, 1.0, 0.52);
		gl.uniform1f(pointUSize, 11.8);
		gl.bindBuffer(gl.ARRAY_BUFFER, electronVbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.POINTS, 0, electronOrbits.length);

		gl.uniform4f(pointUColor, 0.9, 0.97, 1.0, 1.0);
		gl.uniform1f(pointUSize, 7.0);
		gl.bindBuffer(gl.ARRAY_BUFFER, electronVbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.POINTS, 0, electronOrbits.length);

		gl.uniform4f(pointUColor, 0.85, 0.69, 0.46, 0.95);
		gl.uniform1f(pointUSize, 17.0);
		gl.bindBuffer(gl.ARRAY_BUFFER, nucleusVbo);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.POINTS, 0, 1);
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
		pointProgram = createProgram(gl, pointVs, pointFs);

		lineUProj = gl.getUniformLocation(lineProgram, 'uProj');
		lineUView = gl.getUniformLocation(lineProgram, 'uView');
		lineUColor = gl.getUniformLocation(lineProgram, 'uColor');

		pointUProj = gl.getUniformLocation(pointProgram, 'uProj');
		pointUView = gl.getUniformLocation(pointProgram, 'uView');
		pointUColor = gl.getUniformLocation(pointProgram, 'uColor');
		pointUSize = gl.getUniformLocation(pointProgram, 'uPointSize');

		ringVbo = gl.createBuffer();
		gridVbo = gl.createBuffer();
		axisVbo = gl.createBuffer();
		electronVbo = gl.createBuffer();
		nucleusVbo = gl.createBuffer();
		if (!ringVbo || !gridVbo || !axisVbo || !electronVbo || !nucleusVbo) {
			return;
		}

		const gridVertices = buildPlaneGridSegments(11, 2);
		gridVertexCount = gridVertices.length / 3;
		gl.bindBuffer(gl.ARRAY_BUFFER, gridVbo);
		gl.bufferData(gl.ARRAY_BUFFER, gridVertices, gl.STATIC_DRAW);

		const axisVertices = buildAxesSegments(12);
		axisVertexCount = axisVertices.length / 3;
		gl.bindBuffer(gl.ARRAY_BUFFER, axisVbo);
		gl.bufferData(gl.ARRAY_BUFFER, axisVertices, gl.STATIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, nucleusVbo);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.STATIC_DRAW);

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
	<div class="z-20 bg-[var(--museum-surface)] px-3 py-2 md:px-4 md:py-2.5">
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="rounded border border-[rgba(44,61,75,0.68)] px-2 py-0.5 text-[11px] leading-4 text-[rgba(44,61,75,0.95)] hover:cursor-pointer hover:bg-[rgba(44,61,75,0.1)] disabled:opacity-45 disabled:hover:bg-transparent"
				onclick={() => clampAtomicNumber(atomicNumber - 1)}
				disabled={atomicNumber <= 1}
			>
				-1
			</button>

			<span class="text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase"
				>Bohr model 3D · Z={atomicNumber}</span
			>

			<button
				type="button"
				class="rounded border border-[rgba(44,61,75,0.68)] px-2 py-0.5 text-[11px] leading-4 text-[rgba(44,61,75,0.95)] hover:cursor-pointer hover:bg-[rgba(44,61,75,0.1)] disabled:opacity-45 disabled:hover:bg-transparent"
				onclick={() => clampAtomicNumber(atomicNumber + 1)}
				disabled={atomicNumber >= 20}
			>
				+1
			</button>

			<span class="text-[11px] text-[rgba(44,61,75,0.72)]">Shells: {shellSummary}</span>
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
