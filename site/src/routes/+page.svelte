<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import Icon from '@iconify/svelte';
	import { signOut } from '$lib/auth-client';
	import OrbitalCanvas from '$lib/components/OrbitalCanvas.svelte';
	import BohrCanvas from '$lib/components/BohrCanvas.svelte';
	import ChatWindow from '$lib/components/ChatWindow.svelte';
	import {
		applyToolCallMessages,
		chatMessages,
		createChatMessage,
		visualizationState
	} from '$lib/chat.svelte';
	import { guidedTourState, resetGuidedTourState } from '$lib/tours/tour-state.svelte';

	let { data }: PageProps = $props();
	let show_chat = $state<boolean>(false);
	let profileMenuOpen = $state(false);

	const user = $derived(data.user);
	const chatEnabled = $derived(data.chatEnabled);

	let panelWidth = $state(600);
	let dragging = $state(false);
	let viewportWidth = $state(0);
	let profileMenuRef = $state<HTMLElement | null>(null);
	const visualizationMode = $derived(visualizationState.mode);

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
					toolCall: msg.toolCall,
					toolCalls: msg.toolCalls,
					buttons: msg.buttons,
					tourState: msg.tourState
				})
			);
		}

		const recentMessagesWithToolCalls = (data.messages ?? [])
			.filter((message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0)
			.slice(-2);
		for (const recentMessage of recentMessagesWithToolCalls) {
			applyToolCallMessages(recentMessage.toolCalls ?? []);
		}

		const currentTour = data.currentTour;
		if (!currentTour || currentTour.status === 'stopped') {
			resetGuidedTourState();
		} else if (currentTour.status === 'finished') {
			guidedTourState.status = 'finished';
			guidedTourState.activeTourId = currentTour.tourId;
			guidedTourState.activeStepId = null;
			guidedTourState.attemptCount = currentTour.attemptCount;
			guidedTourState.awaitingConfirmation = false;
		} else {
			guidedTourState.status = 'running';
			guidedTourState.activeTourId = currentTour.tourId;
			guidedTourState.activeStepId = currentTour.stepId;
			guidedTourState.attemptCount = currentTour.attemptCount;
			guidedTourState.awaitingConfirmation = currentTour.awaitingConfirmation;
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

	const onWindowPointerDown = (event: PointerEvent) => {
		if (!profileMenuOpen || !profileMenuRef) {
			return;
		}

		if (!profileMenuRef.contains(event.target as Node)) {
			profileMenuOpen = false;
		}
	};

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
		window.addEventListener('pointerdown', onWindowPointerDown);
	});

	onDestroy(() => {
		if (!browser) {
			return;
		}

		window.removeEventListener('resize', syncViewport);
		window.removeEventListener('pointerdown', onWindowPointerDown);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- TODO: Add aria to this -->
<div class="museum-shell" onpointermove={onDragMove} onpointerup={onDragEnd}>
	<section class="museum-frame">
		<header class="museum-panel border-x-0 border-t-0 px-4 py-2.5 md:px-5 md:py-3">
			<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div class="flex items-center gap-3">
					<p class="text-xs font-semibold tracking-wide text-[var(--museum-subtext)] uppercase">
						Select Visualization
					</p>
					<div
						class="inline-flex overflow-hidden rounded-full border border-[var(--museum-stroke-strong)]"
					>
						<button
							type="button"
							class="px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition hover:cursor-pointer {visualizationMode ===
							'orbital'
								? 'bg-[rgba(44,61,75,0.92)] text-[rgba(245,235,219,0.98)]'
								: 'bg-transparent text-[var(--museum-text)] hover:bg-[rgba(44,61,75,0.08)]'}"
							onclick={() => (visualizationState.mode = 'orbital')}
						>
							Orbital
						</button>
						<button
							type="button"
							class="px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition hover:cursor-pointer {visualizationMode ===
							'bohr'
								? 'bg-[rgba(44,61,75,0.92)] text-[rgba(245,235,219,0.98)]'
								: 'bg-transparent text-[var(--museum-text)] hover:bg-[rgba(44,61,75,0.08)]'}"
							onclick={() => (visualizationState.mode = 'bohr')}
						>
							Bohr
						</button>
					</div>
				</div>

				<div class="flex items-center gap-3">
					{#if chatEnabled}
						{#if user}
							<div class="relative" bind:this={profileMenuRef}>
								<button
									type="button"
									class="block rounded-full transition hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-[rgba(44,61,75,0.2)]"
									onclick={() => (profileMenuOpen = !profileMenuOpen)}
									aria-haspopup="menu"
									aria-expanded={profileMenuOpen}
								>
									{#if user.image}
										<img
											src={user.image}
											alt="profile"
											class="h-9 w-9 rounded-full border border-[var(--museum-stroke)] object-cover"
										/>
									{:else}
										<div
											class="h-9 w-9 rounded-full border border-[var(--museum-stroke)] bg-[rgba(202,186,164,0.45)]"
										></div>
									{/if}
								</button>

								{#if profileMenuOpen}
									<div
										class="absolute left-1/2 top-[calc(100%+0.5rem)] z-30 min-w-[11rem] -translate-x-1/2 rounded-2xl border border-[var(--museum-stroke)] bg-[rgba(247,241,230,0.98)] p-1.5 shadow-[0_18px_50px_rgba(44,61,75,0.16)]"
										role="menu"
									>
										<button
											type="button"
											class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
											onclick={() => {
												profileMenuOpen = false;
												void goto(resolve('/dashboard'));
											}}
											role="menuitem"
										>
											Dashboard
										</button>
										<button
											type="button"
											class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-[rgba(168,58,46,0.98)] transition hover:cursor-pointer hover:bg-[rgba(168,58,46,0.08)]"
											onclick={async () => {
												profileMenuOpen = false;
												await signOut();
												location.reload();
											}}
											role="menuitem"
										>
											<Icon icon="material-symbols:logout-rounded" class="text-base" />
											Logout
										</button>
									</div>
								{/if}
							</div>
						{:else}
							<button
								type="button"
								class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold hover:cursor-pointer"
								onclick={() => void goto(resolve('/login'))}
							>
								Log in
							</button>
						{/if}
						<button
							type="button"
							class="museum-button inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
							onclick={() => (show_chat = !show_chat)}
						>
							<Icon icon="hugeicons:atomic-power" class="text-base" />
							{show_chat ? 'Hide chat' : 'Open chat'}
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
