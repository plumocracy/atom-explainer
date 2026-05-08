<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import { Atom, LogOut } from '@lucide/svelte';
	import { signOut } from '$lib/auth-client';
	import ControlsBar from '$lib/components/ControlsBar.svelte';
	import OrbitalCanvas from '$lib/components/OrbitalCanvas.svelte';
	import BohrCanvas from '$lib/components/BohrCanvas.svelte';
	import ChatWindow from '$lib/components/ChatWindow.svelte';
	import {
		applyToolCallMessages,
		chatMessages,
		createChatMessage,
		visualizationState
	} from '$lib/chat.svelte';
	import { chatHandoffState, chatUiState } from '$lib/chat-ui-state.svelte';
	import { guidedTourState, resetGuidedTourState } from '$lib/tours/tour-state.svelte';

	let { data }: PageProps = $props();
	let show_chat = $state<boolean>(false);
	let profileMenuOpen = $state(false);

	const user = $derived(data.user);
	const chatEnabled = $derived(data.chatEnabled);
	const mobileDevice = $derived(data.mobileDevice);
	const isAdmin = $derived(data.isAdmin ?? false);

	let panelWidth = $state(600);
	let dragging = $state(false);
	let viewportWidth = $state(0);
	let profileMenuRef = $state<HTMLElement | null>(null);
	const visualizationMode = $derived(visualizationState.mode);

	const panelMinWidth = 450;
	const mobileBreakpoint = 1024;
	const ACTIVE_CONVERSATION_STORAGE_KEY = 'my-atom.active-conversation-id';
	let didHydrateServerMessages = false;

	const isMobile = $derived(viewportWidth < mobileBreakpoint);
	const chatPanelWidth = $derived(show_chat ? (isMobile ? viewportWidth : panelWidth) : 0);

	type HydratedMessage = (typeof data.messages)[number];

	const applyConversationPayload = (input: {
		conversationId: string | null;
		messages: HydratedMessage[];
		currentTour: typeof data.currentTour;
	}) => {
		chatUiState.conversationId = input.conversationId;
		chatMessages.length = 0;

		for (const msg of input.messages ?? []) {
			chatMessages.push(
				createChatMessage({
					serverId: msg.id,
					role: msg.role,
					content: msg.content,
					feedbackSubmitted: msg.feedbackSubmitted,
					live: false,
					toolCall: msg.toolCall,
					toolCalls: msg.toolCalls,
					buttons: msg.buttons,
					visualizations: msg.visualizations,
					tourState: msg.tourState
				})
			);
		}

		const recentMessagesWithToolCalls = (input.messages ?? [])
			.filter((message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0)
			.slice(-2);
		for (const recentMessage of recentMessagesWithToolCalls) {
			applyToolCallMessages(recentMessage.toolCalls ?? []);
		}

		const currentTour = input.currentTour;
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
	};

	$effect(() => {
		if (data.openChat || chatHandoffState.active) {
			show_chat = true;
		}
	});

	$effect(() => {
		if (didHydrateServerMessages) {
			return;
		}

		if (
			chatHandoffState.active &&
			(!data.conversationId || chatHandoffState.conversationId === data.conversationId)
		) {
			chatUiState.conversationId = data.conversationId ?? chatHandoffState.conversationId;
			didHydrateServerMessages = true;
			return;
		}

		applyConversationPayload({
			conversationId: data.conversationId ?? null,
			messages: data.messages ?? [],
			currentTour: data.currentTour
		});
		didHydrateServerMessages = true;
	});

	$effect(() => {
		if (!browser || !user) {
			return;
		}

		if (chatUiState.conversationId) {
			sessionStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, chatUiState.conversationId);
		} else {
			sessionStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
		}
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

		if (user) {
			const explicitConversationId = new URL(window.location.href).searchParams.get('conversation');
			const storedConversationId = sessionStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
			if (
				!explicitConversationId &&
				storedConversationId &&
				storedConversationId !== data.conversationId
			) {
				void (async () => {
					const response = await fetch(
						`/api/chat/v1?conversation=${encodeURIComponent(storedConversationId)}`
					);
					const payload = (await response.json().catch(() => null)) as
						| {
							success: true;
							conversationId?: string;
							messages: HydratedMessage[];
							currentTour?: typeof data.currentTour;
						  }
						| null;

					if (!response.ok || !payload?.success) {
						return;
					}

					applyConversationPayload({
						conversationId: payload.conversationId ?? storedConversationId,
						messages: payload.messages ?? [],
						currentTour: payload.currentTour ?? null
					});
				})();
			}
		}
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
				<div class="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
					<div class="flex items-center gap-3">
						<a
							href={resolve('/about')}
							class="text-xs font-semibold tracking-wide text-[var(--museum-subtext)] uppercase transition hover:text-[var(--museum-text)]"
						>
							About
						</a>
					</div>

					<div class="flex flex-wrap items-center gap-2 md:gap-3">
						{#if chatEnabled}
							{#if user}
								<div class="relative" bind:this={profileMenuRef}>
									<button
										type="button"
										class="block rounded-full transition hover:cursor-pointer focus:ring-2 focus:ring-[rgba(44,61,75,0.2)] focus:outline-none"
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
											class="absolute top-[calc(100%+0.5rem)] left-1/2 z-30 min-w-[11rem] -translate-x-1/2 rounded-2xl border border-[var(--museum-stroke)] bg-[rgba(247,241,230,0.98)] p-1.5 shadow-[0_18px_50px_rgba(44,61,75,0.16)]"
											role="menu"
										>
									{#if isAdmin}
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
									{/if}
										<button
											type="button"
											class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
											onclick={() => {
												profileMenuOpen = false;
												void goto(resolve('/about'));
											}}
											role="menuitem"
										>
											About
										</button>
										<button
											type="button"
											class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
											onclick={() => {
												profileMenuOpen = false;
												void goto(resolve('/privacy'));
											}}
											role="menuitem"
										>
											Privacy
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
											<LogOut class="text-base" />
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
								<Atom class="text-base" />
								{show_chat ? 'Hide chat' : 'Open chat'}
							</button>
						{/if}
					</div>
				</div>
			</header>

			<ControlsBar />

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
						<div
							style="width: {isMobile ? chatPanelWidth : panelWidth}px"
							class="h-full max-w-full"
						>
							<ChatWindow {user} do_close={() => (show_chat = false)} isFirstChatSession={data.isFirstChatSession} />
						</div>
					</aside>
				{/if}
			</div>
		</section>
	</div>
