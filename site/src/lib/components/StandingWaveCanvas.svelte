<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	const MODES = [1, 2, 4, 6] as const;
	const GUITAR_SAMPLE_PATHS = ['/1hz.wav', '/2hz.wav', '/4hz.wav', '/6hz.wav'];
	const LABEL_WIDTH = 70;
	const SIDE_PADDING = 26;
	const TOP_PADDING = 28;
	const BOTTOM_PADDING = 72;
	const ROW_GAP = 12;
	const BACKGROUND_COLOR = '#081017';
	const PLUCK_DURATION_MS = 1400;
	const PLUCK_DECAY_PER_SECOND = 2.6;
	const PLUCK_SWAY_AMOUNT = 1.1;
	const SAMPLE_GAIN = 0.65;

	let canvas = $state<HTMLCanvasElement | null>(null);
	let resizeObserver: ResizeObserver | null = null;
	let frameId = 0;
	let audioContext: AudioContext | null = null;
	let audioBuffers: Array<AudioBuffer | null> = [];
	let hoverState = $state<{
		rowIndex: number;
		x: number;
		y: number;
		probabilityPercent: number;
	} | null>(null);

	type PluckState = {
		startedAtMs: number;
	};

	const activePlucks: Array<PluckState | null> = MODES.map(() => null);

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

	const preloadAudioBuffers = async () => {
		if (!browser || !audioContext) {
			return;
		}

		audioBuffers = await Promise.all(
			GUITAR_SAMPLE_PATHS.map(async (path) => {
				if (!path) {
					return null;
				}

				try {
					const response = await fetch(path);
					if (!response.ok) {
						return null;
					}

					const buffer = await response.arrayBuffer();
					return await audioContext.decodeAudioData(buffer);
				} catch {
					return null;
				}
			})
		);
	};

	const getWaveSnapshot = (nowMs: number, rowIndex: number) => {
		const pluck = activePlucks[rowIndex];
		if (!pluck) {
			return 1;
		}

		const elapsedMs = nowMs - pluck.startedAtMs;
		if (elapsedMs >= PLUCK_DURATION_MS) {
			activePlucks[rowIndex] = null;
			return 1;
		}

		const elapsedSeconds = elapsedMs * 0.001;
		const decay = Math.exp(-elapsedSeconds * PLUCK_DECAY_PER_SECOND);
		return 1 + (Math.cos(elapsedSeconds * Math.PI * 8) - 1) * decay * PLUCK_SWAY_AMOUNT;
	};

	const drawVisualization = (nowMs = performance.now()) => {
		if (!canvas) {
			return;
		}

		const context = canvas.getContext('2d');
		if (!context) {
			return;
		}

		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
		const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, width, height);
		context.scale(dpr, dpr);

		const cssWidth = canvas.clientWidth;
		const cssHeight = canvas.clientHeight;
		const plotLeft = LABEL_WIDTH;
		const plotRight = cssWidth - SIDE_PADDING;
		const plotWidth = Math.max(10, plotRight - plotLeft);
		const availableHeight = cssHeight - TOP_PADDING - BOTTOM_PADDING - ROW_GAP * (MODES.length - 1);
		const rowHeight = availableHeight / MODES.length;

		context.fillStyle = BACKGROUND_COLOR;
		context.fillRect(0, 0, cssWidth, cssHeight);

		context.lineWidth = 1;
		context.strokeStyle = 'rgba(214,255,228,0.1)';
		for (let rowIndex = 0; rowIndex <= MODES.length; rowIndex += 1) {
			const y =
				TOP_PADDING + rowIndex * (rowHeight + ROW_GAP) - Math.max(0, rowIndex - 1) * ROW_GAP;
			context.beginPath();
			context.moveTo(plotLeft, y);
			context.lineTo(plotRight, y);
			context.stroke();
		}

		let hasActivePlucks = false;
		MODES.forEach((mode, rowIndex) => {
			const rowTop = TOP_PADDING + rowIndex * (rowHeight + ROW_GAP);
			const centerY = rowTop + rowHeight * 0.5;
			const amplitude = clamp(rowHeight * 0.24, 12, 26);
			const timeFactor = getWaveSnapshot(nowMs, rowIndex);
			hasActivePlucks = hasActivePlucks || activePlucks[rowIndex] !== null;

			context.strokeStyle = 'rgba(245,235,219,0.18)';
			context.beginPath();
			context.moveTo(plotLeft, centerY);
			context.lineTo(plotRight, centerY);
			context.stroke();

			context.fillStyle = 'rgba(243,229,205,0.78)';
			context.font = '600 12px system-ui, sans-serif';
			context.textAlign = 'left';
			context.textBaseline = 'middle';
			context.fillText(`${mode} Hz`, 16, centerY);

			context.strokeStyle = 'rgba(214,255,228,0.2)';
			context.lineWidth = 1.2;
			context.beginPath();
			for (let xStep = 0; xStep <= 320; xStep += 1) {
				const ratio = xStep / 320;
				const x = plotLeft + ratio * plotWidth;
				const envelope = Math.sin(mode * Math.PI * ratio);
				const y = centerY + envelope * amplitude;
				if (xStep === 0) {
					context.moveTo(x, y);
				} else {
					context.lineTo(x, y);
				}
			}
			context.stroke();

			context.strokeStyle = 'rgba(214,255,228,0.95)';
			context.lineWidth = 2.2;
			context.beginPath();
			for (let xStep = 0; xStep <= 320; xStep += 1) {
				const ratio = xStep / 320;
				const x = plotLeft + ratio * plotWidth;
				const envelope = Math.sin(mode * Math.PI * ratio);
				const y = centerY - envelope * timeFactor * amplitude;
				if (xStep === 0) {
					context.moveTo(x, y);
				} else {
					context.lineTo(x, y);
				}
			}
			context.stroke();

			for (let nodeIndex = 0; nodeIndex <= mode; nodeIndex += 1) {
				const ratio = nodeIndex / mode;
				const x = plotLeft + ratio * plotWidth;
				context.fillStyle = 'rgba(255,244,224,0.96)';
				context.beginPath();
				context.arc(x, centerY, 2.5, 0, Math.PI * 2);
				context.fill();
			}

			for (let antinodeIndex = 0; antinodeIndex < mode; antinodeIndex += 1) {
				const ratio = (antinodeIndex + 0.5) / mode;
				const x = plotLeft + ratio * plotWidth;
				context.fillStyle = 'rgba(255,104,214,0.72)';
				context.beginPath();
				context.arc(x, centerY, 5.5, 0, Math.PI * 2);
				context.fill();
			}
		});

		context.fillStyle = 'rgba(243,229,205,0.84)';
		context.font = '600 12px system-ui, sans-serif';
		context.textAlign = 'left';
		context.textBaseline = 'alphabetic';
		context.fillText(
			'Nodes stay fixed. Antinodes oscillate with maximum amplitude.',
			16,
			cssHeight - 42
		);

		const legendY = cssHeight - 18;
		context.textBaseline = 'middle';

		context.fillStyle = 'rgba(255,244,224,0.96)';
		context.beginPath();
		context.arc(20, legendY, 3, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = 'rgba(243,229,205,0.84)';
		context.fillText('Node', 30, legendY);

		context.fillStyle = 'rgba(255,104,214,0.72)';
		context.beginPath();
		context.arc(92, legendY, 5.5, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = 'rgba(243,229,205,0.84)';
		context.fillText('Antinode', 104, legendY);

		if (hoverState) {
			const tooltipText = `${hoverState.probabilityPercent}%`;
			context.font = '600 12px system-ui, sans-serif';
			const textWidth = context.measureText(tooltipText).width;
			const tooltipWidth = textWidth + 16;
			const tooltipHeight = 24;
			const tooltipX = Math.min(
				Math.max(10, hoverState.x - tooltipWidth * 0.5),
				cssWidth - tooltipWidth - 10
			);
			const tooltipY = Math.max(10, hoverState.y - 34);

			context.fillStyle = 'rgba(8,16,23,0.92)';
			context.strokeStyle = 'rgba(214,255,228,0.24)';
			context.lineWidth = 1;
			context.beginPath();
			context.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 10);
			context.fill();
			context.stroke();

			context.fillStyle = 'rgba(243,229,205,0.96)';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText(tooltipText, tooltipX + tooltipWidth * 0.5, tooltipY + tooltipHeight * 0.5);

			context.fillStyle = 'rgba(255,104,214,0.88)';
			context.beginPath();
			context.arc(hoverState.x, hoverState.y, 4, 0, Math.PI * 2);
			context.fill();
		}

		if (hasActivePlucks) {
			frameId = requestAnimationFrame(drawVisualization);
		} else {
			frameId = 0;
		}
	};

	const getRowIndexFromPointer = (event: PointerEvent) => {
		if (!canvas) {
			return null;
		}

		const rect = canvas.getBoundingClientRect();
		const localY = event.clientY - rect.top;
		const availableHeight =
			rect.height - TOP_PADDING - BOTTOM_PADDING - ROW_GAP * (MODES.length - 1);
		const rowHeight = availableHeight / MODES.length;

		for (let rowIndex = 0; rowIndex < MODES.length; rowIndex += 1) {
			const rowTop = TOP_PADDING + rowIndex * (rowHeight + ROW_GAP);
			const rowBottom = rowTop + rowHeight;
			if (localY >= rowTop && localY <= rowBottom) {
				return rowIndex;
			}
		}

		return null;
	};

	const updateHoverState = (event: PointerEvent) => {
		if (!canvas) {
			return;
		}

		const rect = canvas.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const rowIndex = getRowIndexFromPointer(event);
		const plotLeft = LABEL_WIDTH;
		const plotRight = rect.width - SIDE_PADDING;

		if (rowIndex === null || localX < plotLeft || localX > plotRight) {
			hoverState = null;
			drawVisualization();
			return;
		}

		const availableHeight =
			rect.height - TOP_PADDING - BOTTOM_PADDING - ROW_GAP * (MODES.length - 1);
		const rowHeight = availableHeight / MODES.length;
		const rowTop = TOP_PADDING + rowIndex * (rowHeight + ROW_GAP);
		const centerY = rowTop + rowHeight * 0.5;
		const ratio = Math.min(1, Math.max(0, (localX - plotLeft) / Math.max(1, plotRight - plotLeft)));
		const mode = MODES[rowIndex];
		const amplitude = clamp(rowHeight * 0.24, 12, 26);
		const timeFactor = getWaveSnapshot(performance.now(), rowIndex);
		const envelope = Math.sin(mode * Math.PI * ratio);
		const probability = Math.abs(Math.sin(mode * Math.PI * ratio));
		const probabilityPercent = Math.round(probability * 99);

		hoverState = {
			rowIndex,
			x: localX,
			y: centerY - envelope * timeFactor * amplitude,
			probabilityPercent
		};
		drawVisualization();
	};

	const playSampleForRow = (rowIndex: number) => {
		const buffer = audioBuffers[rowIndex];
		if (!audioContext || !buffer) {
			return;
		}

		const source = audioContext.createBufferSource();
		const gainNode = audioContext.createGain();
		source.buffer = buffer;
		gainNode.gain.value = SAMPLE_GAIN;
		source.connect(gainNode);
		gainNode.connect(audioContext.destination);
		source.start(0);
	};

	const pluckWave = async (rowIndex: number) => {
		activePlucks[rowIndex] = { startedAtMs: performance.now() };
		if (audioContext?.state === 'suspended') {
			await audioContext.resume().catch(() => {
				return;
			});
		}
		playSampleForRow(rowIndex);
		if (!frameId) {
			frameId = requestAnimationFrame(drawVisualization);
		}
	};

	const onCanvasPointerDown = (event: PointerEvent) => {
		const rowIndex = getRowIndexFromPointer(event);
		if (rowIndex === null) {
			return;
		}

		void pluckWave(rowIndex);
	};

	const onCanvasPointerLeave = () => {
		hoverState = null;
		drawVisualization();
	};

	onMount(() => {
		if (!browser || !canvas) {
			return;
		}

		audioContext = new AudioContext();
		audioBuffers = MODES.map(() => null);
		void preloadAudioBuffers();

		resizeObserver = new ResizeObserver(() => {
			if (!canvas) {
				return;
			}

			canvas.width = 0;
			canvas.height = 0;
			drawVisualization();
		});
		resizeObserver.observe(canvas);
		drawVisualization();
	});

	onDestroy(() => {
		if (frameId) {
			cancelAnimationFrame(frameId);
		}

		audioBuffers = [];
		void audioContext?.close();
		audioContext = null;

		resizeObserver?.disconnect();
	});
</script>

<div class="flex h-full w-full items-center justify-center overflow-hidden bg-[#081017] p-3 sm:p-4">
	<div
		class="relative h-full w-full overflow-hidden rounded-[2rem] border border-[rgba(214,255,228,0.12)] shadow-[0_28px_80px_rgba(0,0,0,0.32)]"
		style={`background:${BACKGROUND_COLOR}`}
	>
		<canvas
			bind:this={canvas}
			onpointerdown={onCanvasPointerDown}
			onpointermove={updateHoverState}
			onpointerleave={onCanvasPointerLeave}
			class="block h-full w-full cursor-pointer"
		></canvas>
	</div>
</div>
