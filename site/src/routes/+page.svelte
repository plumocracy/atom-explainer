<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import type { PageProps } from './$types';
	import ControlsBar from '$lib/components/ControlsBar.svelte';
	import OrbitalCanvas from '$lib/components/OrbitalCanvas.svelte';
	import { cancelActiveChatStream } from '$lib/chat-stream-cancel';
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

	const user = $derived(data.user);
	const chatEnabled = $derived(data.chatEnabled);
	const mobileDevice = $derived(data.mobileDevice);
	const isAdmin = $derived(data.isAdmin ?? false);

	let panelWidth = $state(600);
	let dragging = $state(false);
	let viewportWidth = $state(0);
	let BohrCanvasComponent = $state<
		null | typeof import('$lib/components/BohrCanvas.svelte').default
	>(null);
	let ChatWindowComponent = $state<
		null | typeof import('$lib/components/ChatWindow.svelte').default
	>(null);
	let bohrCanvasLoad: Promise<void> | null = null;
	let chatWindowLoad: Promise<void> | null = null;
	const visualizationMode = $derived(visualizationState.mode);

	const panelMinWidth = 450;
	const mobileBreakpoint = 1024;
	const ACTIVE_CONVERSATION_STORAGE_KEY = 'my-atom.active-conversation-id';
	let didHydrateServerMessages = false;

	const isMobile = $derived(viewportWidth < mobileBreakpoint);
	const chatPanelWidth = $derived(show_chat ? (isMobile ? viewportWidth : panelWidth) : 0);

	const ensureBohrCanvas = () => {
		if (!bohrCanvasLoad) {
			bohrCanvasLoad = import('$lib/components/BohrCanvas.svelte').then((mod) => {
				BohrCanvasComponent = mod.default;
			});
		}

		return bohrCanvasLoad;
	};

	const ensureChatWindow = () => {
		if (!chatWindowLoad) {
			chatWindowLoad = import('$lib/components/ChatWindow.svelte').then((mod) => {
				ChatWindowComponent = mod.default;
			});
		}

		return chatWindowLoad;
	};

	type HydratedMessage = (typeof data.messages)[number];

	const applyConversationPayload = (input: {
		conversationId: string | null;
		messages: HydratedMessage[];
		currentTour: typeof data.currentTour;
	}) => {
		chatUiState.conversationId = input.conversationId;
		cancelActiveChatStream();
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
		if (visualizationMode === 'bohr') {
			void ensureBohrCanvas();
		}
	});

	$effect(() => {
		if (show_chat) {
			void ensureChatWindow();
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
					const payload = (await response.json().catch(() => null)) as {
						success: true;
						conversationId?: string;
						messages: HydratedMessage[];
						currentTour?: typeof data.currentTour;
					} | null;

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
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- TODO: Add aria to this -->
<div class="museum-shell" onpointermove={onDragMove} onpointerup={onDragEnd}>
	<section class="museum-frame">
		<div class="relative flex min-h-0 flex-1 overflow-hidden">
			<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<ControlsBar
					{chatEnabled}
					{user}
					{isAdmin}
					showChat={show_chat}
					openChat={() => (show_chat = true)}
				/>

				<div
					class="relative min-h-0 flex-1 overflow-hidden border border-x-0 border-b-0 border-[var(--museum-stroke)] bg-black"
				>
					{#if visualizationMode === 'orbital'}
						<div in:fade={{ duration: 180 }} out:fade={{ duration: 150 }} class="absolute inset-0">
							<OrbitalCanvas />
						</div>
					{:else}
						<div
							in:fade={{ duration: 240, delay: 90 }}
							out:fade={{ duration: 150 }}
							class="absolute inset-0"
						>
							{#if BohrCanvasComponent}
								<BohrCanvasComponent />
							{/if}
						</div>
					{/if}
				</div>
			</div>

			{#if chatEnabled}
				<div
					class="museum-divider hidden touch-none lg:block {show_chat
						? 'opacity-100'
						: 'pointer-events-none w-0 opacity-0'}"
					onpointerdown={onDragStart}
				></div>

				<aside
					class="museum-panel absolute inset-y-0 right-0 z-30 min-h-0 overflow-hidden border-y-0 border-r-0 lg:static lg:z-auto"
					class:transition-[width,opacity,transform]={!dragging}
					class:duration-200={!dragging}
					class:opacity-0={!show_chat}
					class:pointer-events-none={!show_chat}
					class:translate-x-full={isMobile && !show_chat}
					class:translate-y-2={!isMobile && !show_chat}
					style="width: {isMobile ? viewportWidth : chatPanelWidth}px"
				>
					<div style="width: {isMobile ? viewportWidth : panelWidth}px" class="h-full max-w-full">
						{#if show_chat && ChatWindowComponent}
							<ChatWindowComponent
								{user}
								do_close={() => (show_chat = false)}
								isFirstChatSession={data.isFirstChatSession}
							/>
						{/if}
					</div>
				</aside>
			{/if}
		</div>
	</section>
</div>
