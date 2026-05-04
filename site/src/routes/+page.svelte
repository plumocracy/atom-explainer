<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import type { PageProps } from './$types';
	import Icon from '@iconify/svelte';
	import OrbitalCanvas from '$lib/components/OrbitalCanvas.svelte';
	import BohrCanvas from '$lib/components/BohrCanvas.svelte';
	import ChatWindow from '$lib/components/ChatWindow.svelte';
	import { chatMessages, createChatMessage, visualizationState } from '$lib/chat.svelte';

	type VisualizationMode = 'orbital' | 'bohr';

	let { data }: PageProps = $props();
	let show_chat = $state<boolean>(false);

	const user = $derived(data.user);
	const chatEnabled = $derived(data.chatEnabled);

	let panelWidth = $state(600);
	let dragging = $state(false);
	let viewportWidth = $state(0);
	let visualizationMode = $state<VisualizationMode>('orbital');

	$effect(() => {
		visualizationState.mode = visualizationMode;
	});

	const panelMinWidth = 450;
	const mobileBreakpoint = 1024;
	let didHydrateServerMessages = false;

	const isMobile = $derived(viewportWidth < mobileBreakpoint);
	const chatPanelWidth = $derived(show_chat ? (isMobile ? viewportWidth : panelWidth) : 0);

	$effect(() => {
		if (didHydrateServerMessages) {
			return;
		}

		chatMessages.length = 0;

		for (const msg of data.messages ?? []) {
			chatMessages.push(
				createChatMessage({
					role: msg.role,
					content: msg.content,
					live: false,
					toolCall: msg.toolCall
				})
			);
		}

		didHydrateServerMessages = true;
	});

	function onDragStart(e: PointerEvent) {
		if (isMobile) return;
		dragging = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDragMove(e: PointerEvent) {
		if (!dragging || isMobile) return;
		// Subtract from window width since panel is on the right
		panelWidth = Math.min(
			Math.max(panelMinWidth, window.innerWidth - e.clientX),
			window.innerWidth * 0.4
		);
	}

	function onDragEnd() {
		dragging = false;
	}

	const syncViewport = () => {
		const nextWidth = window.innerWidth;
		viewportWidth = nextWidth;
		if (nextWidth >= mobileBreakpoint && panelWidth < panelMinWidth) {
			panelWidth = panelMinWidth;
		}
	};

	onMount(() => {
		if (!browser) {
			return;
		}

		syncViewport();
		window.addEventListener('resize', syncViewport);
	});

	onDestroy(() => {
		if (!browser) {
			return;
		}

		window.removeEventListener('resize', syncViewport);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- TODO: Add aria to this -->
<div class="museum-shell" onpointermove={onDragMove} onpointerup={onDragEnd}>
	<section class="museum-frame">
		<header class="museum-panel border-x-0 border-t-0 px-4 py-2.5 md:px-5 md:py-3">
			<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 class="mt-0.5 text-[1.55rem] leading-none md:text-[1.8rem]">
						Atomic Orbitals Gallery
					</h1>
					<p class="mt-1 hidden text-xs text-[var(--museum-subtext)] md:block">
						A guided exhibit pairing live orbital simulations with curator-style academic
						commentary.
					</p>
				</div>

				<div class="flex items-center gap-3">
					<div
						class="inline-flex overflow-hidden rounded-full border border-[var(--museum-stroke-strong)]"
					>
						<button
							type="button"
							class="px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition hover:cursor-pointer {visualizationMode ===
							'orbital'
								? 'bg-[rgba(44,61,75,0.92)] text-[rgba(245,235,219,0.98)]'
								: 'bg-transparent text-[var(--museum-text)] hover:bg-[rgba(44,61,75,0.08)]'}"
							onclick={() => (visualizationMode = 'orbital')}
						>
							Orbital
						</button>
						<button
							type="button"
							class="px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition hover:cursor-pointer {visualizationMode ===
							'bohr'
								? 'bg-[rgba(44,61,75,0.92)] text-[rgba(245,235,219,0.98)]'
								: 'bg-transparent text-[var(--museum-text)] hover:bg-[rgba(44,61,75,0.08)]'}"
							onclick={() => (visualizationMode = 'bohr')}
						>
							Bohr
						</button>
					</div>

					<div
						class="museum-chip rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
					>
						Exhibit B-01
					</div>
					{#if chatEnabled}
						<button
							type="button"
							class="museum-button inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
							onclick={() => (show_chat = !show_chat)}
						>
							<Icon icon="hugeicons:atomic-power" class="text-base" />
							{show_chat ? 'Hide commentary' : 'Open commentary'}
						</button>
					{/if}
				</div>
			</div>
		</header>

		<div class="relative flex min-h-0 flex-1 overflow-hidden">
			<div
				class="museum-panel relative min-h-0 flex-1 overflow-hidden border-x-0 border-b-0 bg-[#0b141d]"
			>
				{#if visualizationMode === 'orbital'}
					<div
						in:fade={{ duration: 240, delay: 90 }}
						out:fade={{ duration: 150 }}
						class="absolute inset-0"
					>
						<OrbitalCanvas />
					</div>
				{:else}
					<div
						in:fade={{ duration: 240, delay: 90 }}
						out:fade={{ duration: 150 }}
						class="absolute inset-0"
					>
						<BohrCanvas />
					</div>
				{/if}
			</div>

			{#if chatEnabled}
				<div
					class="hidden w-1 cursor-col-resize touch-none bg-[var(--museum-stroke)] transition-colors hover:bg-[var(--museum-stroke-strong)] lg:block {show_chat
						? 'opacity-100'
						: 'pointer-events-none w-0 opacity-0'}"
					onpointerdown={onDragStart}
				></div>

				<aside
					class="museum-panel absolute inset-y-0 right-0 z-20 overflow-hidden border-y-0 border-r-0 lg:static lg:inset-y-auto"
					class:transition-[width,opacity,transform]={!dragging}
					class:duration-200={!dragging}
					class:opacity-0={!show_chat}
					class:pointer-events-none={!show_chat}
					class:translate-y-2={isMobile && !show_chat}
					style="width: {chatPanelWidth}px"
				>
					<div style="width: {isMobile ? chatPanelWidth : panelWidth}px" class="h-full max-w-full">
						<ChatWindow {user} do_close={() => (show_chat = false)} />
					</div>
				</aside>
			{/if}
		</div>
	</section>
</div>
