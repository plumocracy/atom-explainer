<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import Icon from '@iconify/svelte';
	import {
		applyToolCallMessages,
		bohrSimulationValues,
		chatMessages,
		createChatMessage,
		type Message,
		simulationValues,
		visualizationState
	} from '$lib/chat.svelte';
	import ResponseCard from './ResponseCard.svelte';
	import ChatWindowHeader from './ChatWindowHeader.svelte';
	import ChatSuggestions from './ChatSuggestions.svelte';
	import ChatComposer from './ChatComposer.svelte';
	import ChatSignInPrompt from './ChatSignInPrompt.svelte';
	import ToolCallCard from './ToolCallCard.svelte';
	import { useChatStream } from '$lib/use-chat-stream';
	import { chatHandoffState, chatUiState } from '$lib/chat-ui-state.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { showErrorToast, showToast } from '$lib/toast.svelte';
	import { getTourSummary } from '$lib/tours/tours';
	import { guidedTourState, resetGuidedTourState } from '$lib/tours/tour-state.svelte';
	import { clearGuidedTour, startGuidedTour, stopGuidedTour } from '$lib/tours/tour-runner';

	type ChatUser = {
		name?: string | null;
		image?: string | null;
	};

	let {
		user,
		do_close,
		isFirstChatSession = false
	}: {
		user: ChatUser | null | undefined;
		do_close: () => void;
		isFirstChatSession?: boolean;
	} = $props();

	let input = $state('');
	let messageSent = $state(false);
	let creatingConversation = $state(false);
	let sentFirstSessionIntro = $state(false);
	let showHistory = $state(false);
	let historyListLoading = $state(false);
	let historyListError = $state<string | null>(null);
	let historySearch = $state('');
	let historySearchLoading = $state(false);
	let historySearchResults = $state<
		Array<{
			id: string;
			conversationId: string;
			conversationTitle: string | null;
			role: 'user' | 'assistant';
			content: string;
			createdAt: string | Date;
		}>
	>([]);
	let historySearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let hasLoadedHistoryList = $state(false);
	let conversationSummaries = $state<
		Array<{
			id: string;
			title: string | null;
			messageCount: number;
			updatedAt: string | Date;
			userInputTokens: number;
			completionTokens: number;
		}>
	>([]);
	let messagesViewport = $state<HTMLDivElement | null>(null);
	let feedbackTarget = $state<Message | null>(null);
	let feedbackPreference = $state<'up' | 'down'>('up');
	let feedbackCorrectness = $state(5);
	let feedbackTone = $state(5);
	let feedbackUnderstandability = $state(5);
	let feedbackExplanation = $state('');
	let submittingFeedback = $state(false);
	let confirmDeleteConversationId = $state<string | null>(null);
	let swipedConversationId = $state<string | null>(null);
	let swipeOffsetX = $state(0);
	let swipeStartX: number | null = null;
	let swipeTrackingConversationId: string | null = null;
	const pendingDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingDeleteSummaries = new Map<string, (typeof conversationSummaries)[number]>();

	const firstSessionIntroPrompt =
		'Introduce yourself to a first-time user of this orbital exhibit. Briefly explain your core capabilities, including teaching quantum and atomic concepts, comparing Bohr and orbital views, interpreting and changing simulation state, and helping the user explore the exhibit. Do not use any tools in this response. Keep it friendly, concrete, and concise. Limit yourself to a short introduction of about 4 to 6 sentences. End with one specific, inviting guiding question that nudges the user toward a concrete topic they can ask about next, such as standing waves, orbital shapes, or quantum numbers.';
	const curatedPrompts = [
		'Explain the difference between the Bohr model and the orbital model.',
		'Show me how the quantum numbers n, l, and m change the orbital.',
		'Give me a guided introduction to what this 3D visualization is showing.',
		'Help me build intuition for why orbitals are probabilities instead of paths.'
	];
	const availableTours = getTourSummary();
	const primaryTour = availableTours[0];
	const guidedTourActive = $derived(guidedTourState.status === 'running');
	const loading = $derived(chatUiState.loading);
	const toolCalling = $derived(chatUiState.toolCalling);
	const activeHistoryConversationId = $derived(chatUiState.conversationId);
	const groupedConversationSummaries = $derived.by(() => {
		const groups: Array<{ label: string; conversations: typeof conversationSummaries }> = [];
		let currentLabel = '';
		for (const conversation of conversationSummaries) {
			const date = new Date(conversation.updatedAt);
			const label = date.toLocaleDateString(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
			if (label !== currentLabel) {
				currentLabel = label;
				groups.push({ label, conversations: [] as typeof conversationSummaries });
			}
			groups.at(-1)?.conversations.push(conversation);
		}
		return groups;
	});

	const historySearchResultsByConversation = $derived.by(() => {
		const grouped = new Map<
			string,
			{ conversationTitle: string | null; createdAt: string | Date; snippets: string[] }
		>();
		for (const result of historySearchResults) {
			const existing = grouped.get(result.conversationId);
			const snippet =
				result.content.length > 180
					? `${result.content.slice(0, 180).trimEnd()}...`
					: result.content;
			if (existing) {
				existing.snippets.push(snippet);
				continue;
			}
			grouped.set(result.conversationId, {
				conversationTitle: result.conversationTitle,
				createdAt: result.createdAt,
				snippets: [snippet]
			});
		}
		return [...grouped.entries()].map(([conversationId, value]) => ({ conversationId, ...value }));
	});

	const { sendMessage, sendSeededMessage, sendAssistantInitiatedMessage } = useChatStream({
		chatMessages,
		simulationValues,
		bohrSimulationValues,
		visualizationState,
		setLoading: (next) => {
			chatUiState.loading = next;
		},
		setToolCalling: (next) => {
			chatUiState.toolCalling = next;
		},
		getExtraBody: () => ({
			surface: 'orbital_page',
			...(chatUiState.conversationId ? { conversationId: chatUiState.conversationId } : {})
		})
	});

	const scrollToBottom = async () => {
		await tick();
		if (!messagesViewport) {
			return;
		}

		messagesViewport.scrollTop = messagesViewport.scrollHeight;
	};

	const applyLoadedConversation = (input: {
		conversationId: string | null;
		messages: Array<{
			id: string;
			role: 'user' | 'assistant';
			content: string;
			feedbackSubmitted?: boolean;
			toolCalls?: Message['toolCalls'];
			tourState?: Message['tourState'];
		}>;
		currentTour?: {
			status: 'running' | 'stopped' | 'finished';
			tourId: string;
			stepId: string | null;
			attemptCount: number;
			awaitingConfirmation?: boolean;
		} | null;
	}) => {
		chatUiState.conversationId = input.conversationId;
		chatMessages.length = 0;

		for (const msg of input.messages) {
			chatMessages.push(
				createChatMessage({
					serverId: msg.id,
					role: msg.role,
					content: msg.content,
					feedbackSubmitted: msg.feedbackSubmitted,
					live: false,
					toolCalls: msg.toolCalls,
					tourState: msg.tourState
				})
			);
		}

		const recentMessagesWithToolCalls = input.messages
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
			guidedTourState.awaitingConfirmation = currentTour.awaitingConfirmation ?? false;
		}

		messageSent = input.messages.length > 0;
	};

	const setConversationQuery = (conversationId: string | null) => {
		if (typeof window === 'undefined') {
			return;
		}

		const nextUrl = new URL(window.location.href);
		if (conversationId) {
			nextUrl.searchParams.set('conversation', conversationId);
		} else {
			nextUrl.searchParams.delete('conversation');
		}
		window.history.replaceState(window.history.state, '', nextUrl);
	};

	const insertConversationSummary = (conversation: (typeof conversationSummaries)[number]) => {
		const next = [...conversationSummaries, conversation].sort(
			(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
		);
		conversationSummaries = next;
	};

	const clearSwipeState = () => {
		swipedConversationId = null;
		swipeOffsetX = 0;
		swipeStartX = null;
		swipeTrackingConversationId = null;
	};

	$effect(() => {
		chatMessages.length;
		void scrollToBottom();
	});

	$effect(() => {
		toolCalling;
		void scrollToBottom();
	});

	$effect(() => {
		if (!chatHandoffState.active || !chatHandoffState.draft) {
			return;
		}

		const draft = chatHandoffState.draft;
		chatUiState.loading = true;
		chatUiState.toolCalling = false;
		chatHandoffState.active = false;
		chatHandoffState.draft = null;
		chatHandoffState.conversationId = null;
		sendSeededMessage(draft);
	});

	$effect(() => {
		if (!showHistory) {
			return;
		}

		const query = historySearch.trim();
		if (historySearchDebounceTimer) {
			clearTimeout(historySearchDebounceTimer);
		}

		if (!query) {
			historySearchResults = [];
			historySearchLoading = false;
			return;
		}

		historySearchDebounceTimer = setTimeout(() => {
			void searchConversationHistory(query);
		}, 250);

		return () => {
			if (historySearchDebounceTimer) {
				clearTimeout(historySearchDebounceTimer);
			}
		};
	});

	const ensureConversationForOnboarding = async (): Promise<string | null> => {
		if (chatUiState.conversationId) {
			return chatUiState.conversationId;
		}

		try {
			const response = await fetch('/api/chat/v1/conversation', {
				method: 'POST'
			});

			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				conversationId?: string;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true || !payload.conversationId) {
				showErrorToast(payload?.error, 'Could not prepare your first conversation.');
				return null;
			}

			chatUiState.conversationId = payload.conversationId;
			return payload.conversationId;
		} catch (error) {
			showErrorToast(error, 'Could not prepare your first conversation.');
			return null;
		}
	};

	$effect(() => {
		if (
			!user ||
			!isFirstChatSession ||
			sentFirstSessionIntro ||
			loading ||
			chatMessages.length > 0
		) {
			return;
		}

		sentFirstSessionIntro = true;
		messageSent = true;
		void (async () => {
			const conversationId = await ensureConversationForOnboarding();
			if (!conversationId) {
				sentFirstSessionIntro = false;
				messageSent = false;
				return;
			}

			sendAssistantInitiatedMessage(firstSessionIntroPrompt, {
				starterMode: 'assistant_intro',
				conversationId
			});
		})();
	});

	const send = async (prebakedMsg?: string) => {
		const message = prebakedMsg ?? input.trim();
		if (!message || loading) {
			return;
		}

		messageSent = true;
		input = '';
		sendMessage(message);
	};

	const startPrimaryTour = () => {
		if (loading || guidedTourActive) {
			return;
		}

		if (!primaryTour) {
			showErrorToast(
				new Error('No guided tours are available.'),
				'Could not start the guided tour.'
			);
			return;
		}

		messageSent = true;
		startGuidedTour(primaryTour.id);
	};

	const createNewConversation = async (): Promise<string | null> => {
		if (loading || creatingConversation) {
			return null;
		}

		creatingConversation = true;

		try {
			const response = await fetch('/api/chat/v1/conversation', {
				method: 'POST'
			});

			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				conversationId?: string;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true) {
				showErrorToast(payload?.error, 'Could not create a new conversation.');
				return null;
			}

			chatUiState.conversationId = payload.conversationId ?? null;
			chatMessages.length = 0;
			messageSent = false;
			input = '';
			feedbackTarget = null;
			clearGuidedTour();
			showHistory = false;
			historyListError = null;
			setConversationQuery(null);
			return payload.conversationId ?? null;
		} catch (error) {
			showErrorToast(error, 'Could not create a new conversation.');
			return null;
		} finally {
			creatingConversation = false;
		}
	};

	const sendCuratedPrompt = async (prompt: string) => {
		const conversationId = await createNewConversation();
		if (!conversationId) {
			return;
		}

		await send(prompt);
	};

	const fetchConversationSummaries = async () => {
		historyListError = null;
		historyListLoading = true;
		try {
			const response = await fetch('/api/chat/v1/conversations');
			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				conversations?: typeof conversationSummaries;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true || !payload.conversations) {
				showErrorToast(payload?.error, 'Could not load your conversation history.');
				historyListError = 'Could not load your conversation history.';
				return;
			}

			conversationSummaries = payload.conversations;
			hasLoadedHistoryList = true;
		} catch (error) {
			showErrorToast(error, 'Could not load your conversation history.');
			historyListError = 'Could not load your conversation history.';
		} finally {
			historyListLoading = false;
		}
	};

	const searchConversationHistory = async (query: string) => {
		historyListError = null;
		historySearchLoading = true;
		try {
			const response = await fetch(`/api/dashboard/search-history?q=${encodeURIComponent(query)}`);
			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				results?: typeof historySearchResults;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true || !payload.results) {
				historyListError = 'Could not search your conversation history.';
				return;
			}

			historySearchResults = payload.results;
		} catch (error) {
			historyListError = 'Could not search your conversation history.';
		} finally {
			historySearchLoading = false;
		}
	};

	const openHistory = async () => {
		showHistory = !showHistory;
		if (!showHistory) {
			return;
		}

		if (!hasLoadedHistoryList) {
			await fetchConversationSummaries();
		}
	};

	const loadConversationFromHistory = async (conversationId: string) => {
		if (loading || historyListLoading) {
			return;
		}

		historyListError = null;
		historyListLoading = true;
		try {
			const response = await fetch(
				`/api/chat/v1?conversation=${encodeURIComponent(conversationId)}`
			);
			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				conversationId?: string;
				messages?: Array<{
					id: string;
					role: 'user' | 'assistant';
					content: string;
					feedbackSubmitted?: boolean;
					toolCalls?: Message['toolCalls'];
					tourState?: Message['tourState'];
				}>;
				currentTour?: {
					status: 'running' | 'stopped' | 'finished';
					tourId: string;
					stepId: string | null;
					attemptCount: number;
					awaitingConfirmation?: boolean;
				} | null;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true || !payload.messages) {
				showErrorToast(payload?.error, 'Could not load that conversation.');
				historyListError = 'Could not load that conversation.';
				return;
			}

			applyLoadedConversation({
				conversationId: payload.conversationId ?? conversationId,
				messages: payload.messages,
				currentTour: payload.currentTour ?? null
			});
			setConversationQuery(payload.conversationId ?? conversationId);
			showHistory = false;
		} catch (error) {
			showErrorToast(error, 'Could not load that conversation.');
			historyListError = 'Could not load that conversation.';
		} finally {
			historyListLoading = false;
		}
	};

	const deleteConversation = async (conversationId: string) => {
		if (loading || historyListLoading) {
			return;
		}
		const summary = conversationSummaries.find(
			(conversation) => conversation.id === conversationId
		);
		if (!summary) {
			return;
		}

		confirmDeleteConversationId = null;
		clearSwipeState();
		pendingDeleteSummaries.set(conversationId, summary);
		conversationSummaries = conversationSummaries.filter(
			(conversation) => conversation.id !== conversationId
		);
		const previousSearchResults = historySearchResults.filter(
			(result) => result.conversationId === conversationId
		);
		historySearchResults = historySearchResults.filter(
			(result) => result.conversationId !== conversationId
		);

		const finalizeDelete = async () => {
			pendingDeleteTimers.delete(conversationId);
			pendingDeleteSummaries.delete(conversationId);
			try {
				const response = await fetch(
					`/api/chat/v1/conversation?conversation=${encodeURIComponent(conversationId)}`,
					{ method: 'DELETE' }
				);
				const payload = (await response.json().catch(() => null)) as {
					success?: boolean;
					error?: unknown;
				} | null;

				if (!response.ok || payload?.success !== true) {
					insertConversationSummary(summary);
					historySearchResults = [...historySearchResults, ...previousSearchResults];
					showErrorToast(payload?.error, 'Could not delete that conversation.');
				}
			} catch (error) {
				insertConversationSummary(summary);
				historySearchResults = [...historySearchResults, ...previousSearchResults];
				showErrorToast(error, 'Could not delete that conversation.');
			}

			if (chatUiState.conversationId === conversationId) {
				chatUiState.conversationId = null;
				chatMessages.length = 0;
				messageSent = false;
				setConversationQuery(null);
			}
		};

		const timer = setTimeout(() => {
			void finalizeDelete();
		}, 5000);
		pendingDeleteTimers.set(conversationId, timer);

		showToast({
			tone: 'warning',
			title: 'Conversation deleted',
			message: summary.title || 'Untitled conversation',
			durationMs: 5000,
			actionLabel: 'Undo',
			onAction: () => {
				const pendingTimer = pendingDeleteTimers.get(conversationId);
				if (pendingTimer) {
					clearTimeout(pendingTimer);
					pendingDeleteTimers.delete(conversationId);
				}
				const pendingSummary = pendingDeleteSummaries.get(conversationId);
				if (pendingSummary) {
					insertConversationSummary(pendingSummary);
					pendingDeleteSummaries.delete(conversationId);
				}
				historySearchResults = [...historySearchResults, ...previousSearchResults];
			}
		});
	};

	const beginSwipe = (event: PointerEvent, conversationId: string) => {
		if (event.pointerType !== 'touch') {
			return;
		}
		swipeStartX = event.clientX;
		swipeTrackingConversationId = conversationId;
		swipeOffsetX = swipedConversationId === conversationId ? -88 : 0;
	};

	const moveSwipe = (event: PointerEvent, conversationId: string) => {
		if (
			event.pointerType !== 'touch' ||
			swipeStartX === null ||
			swipeTrackingConversationId !== conversationId
		) {
			return;
		}
		const deltaX = event.clientX - swipeStartX;
		swipeOffsetX = Math.max(-88, Math.min(0, deltaX));
	};

	const endSwipe = (conversationId: string) => {
		if (swipeTrackingConversationId !== conversationId) {
			return;
		}
		if (swipeOffsetX <= -48) {
			swipedConversationId = conversationId;
			swipeOffsetX = -88;
		} else {
			clearSwipeState();
		}
		if (swipeTrackingConversationId === conversationId) {
			swipeStartX = null;
			swipeTrackingConversationId = null;
		}
	};

	$effect(() => {
		if (!user || hasLoadedHistoryList || historyListLoading) {
			return;
		}

		void fetchConversationSummaries();
	});

	const openFeedback = (message: Message, preference: 'up' | 'down') => {
		feedbackTarget = message;
		feedbackPreference = preference;
		feedbackCorrectness = preference === 'up' ? 5 : 2;
		feedbackTone = preference === 'up' ? 5 : 2;
		feedbackUnderstandability = preference === 'up' ? 5 : 2;
		feedbackExplanation = '';
	};

	const closeFeedback = () => {
		if (submittingFeedback) {
			return;
		}

		feedbackTarget = null;
	};

	const submitFeedback = async () => {
		if (!feedbackTarget?.serverId || submittingFeedback) {
			return;
		}

		submittingFeedback = true;

		try {
			const response = await fetch('/api/chat/v1/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messageId: feedbackTarget.serverId,
					preference: feedbackPreference,
					correctness: feedbackCorrectness,
					tone: feedbackTone,
					understandability: feedbackUnderstandability,
					explanation: feedbackExplanation.trim() || undefined
				})
			});

			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true) {
				showErrorToast(payload?.error, 'Could not save your feedback.');
				return;
			}

			feedbackTarget.feedbackSubmitted = true;
			showToast({
				tone: 'success',
				title: 'Thank you',
				message: 'Thanks for your feedback.',
				durationMs: 5000
			});
			feedbackTarget = null;
		} catch (error) {
			showErrorToast(error, 'Could not save your feedback.');
		} finally {
			submittingFeedback = false;
		}
	};

	const setFeedbackRating = (
		category: 'correctness' | 'tone' | 'understandability',
		rating: number
	) => {
		if (category === 'correctness') {
			feedbackCorrectness = rating;
			return;
		}

		if (category === 'tone') {
			feedbackTone = rating;
			return;
		}

		feedbackUnderstandability = rating;
	};
</script>

{#if user}
	<div
		class="relative flex h-full w-full flex-col bg-[rgba(247,241,230,0.62)] text-[var(--museum-text)]"
	>
		<ChatWindowHeader
			onClose={do_close}
			onNewConversation={createNewConversation}
			onToggleHistory={openHistory}
			newConversationDisabled={loading || creatingConversation}
			historyDisabled={loading || creatingConversation}
			historyActive={showHistory}
		/>

		{#if showHistory}
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 md:px-5 md:py-4">
				<div class="mb-3 flex items-center gap-3">
					<button
						type="button"
						class="museum-button inline-flex h-9 w-9 items-center justify-center rounded-full"
						onclick={() => {
							showHistory = false;
							historySearch = '';
						}}
						aria-label="Back to chat"
					>
						<Icon icon="material-symbols:arrow-back-rounded" class="text-lg" />
					</button>
				</div>

				{#if historyListError}
					<p class="text-sm text-[rgba(168,58,46,0.98)]">{historyListError}</p>
				{:else if historyListLoading && !hasLoadedHistoryList}
					<p class="text-sm text-[var(--museum-subtext)]">Loading conversation history...</p>
				{:else if historySearch.trim() && historySearchLoading}
					<p class="text-sm text-[var(--museum-subtext)]">Searching conversation history...</p>
				{:else if historySearch.trim() && historySearchResults.length === 0}
					<p class="text-sm text-[var(--museum-subtext)]">No conversations matched your search.</p>
				{:else if !historySearch.trim() && conversationSummaries.length === 0}
					<p class="text-sm text-[var(--museum-subtext)]">No previous conversations yet.</p>
				{:else if historySearch.trim()}
					<ul class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
						{#each historySearchResultsByConversation as result (result.conversationId)}
							<li>
								<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/45 px-3 py-3">
									<div class="flex items-start justify-between gap-3">
										<button
											type="button"
											class="min-w-0 flex-1 text-left hover:cursor-pointer"
											onclick={() => void loadConversationFromHistory(result.conversationId)}
										>
											<p class="font-semibold">
												{result.conversationTitle || 'Untitled conversation'}
											</p>
											<p class="mt-1 text-xs text-[var(--museum-subtext)]">
												Matched {new Date(result.createdAt).toLocaleString(undefined, {
													dateStyle: 'medium',
													timeStyle: 'short'
												})}
											</p>
											<div class="mt-2 space-y-2">
												{#each result.snippets.slice(0, 2) as snippet}
													<p
														class="text-sm [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
													>
														{snippet}
													</p>
												{/each}
											</div>
										</button>
										<button
											type="button"
											class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--museum-subtext)] transition hover:cursor-pointer hover:bg-[rgba(168,58,46,0.08)] hover:text-[rgba(168,58,46,0.98)]"
											onclick={() => (confirmDeleteConversationId = result.conversationId)}
											aria-label="Delete conversation"
										>
											<Icon icon="material-symbols:delete-outline-rounded" class="text-lg" />
										</button>
									</div>
									{#if confirmDeleteConversationId === result.conversationId}
										<div
											class="mt-3 rounded-lg border border-[rgba(168,58,46,0.22)] bg-[rgba(248,236,231,0.7)] p-3"
										>
											<p class="text-sm font-medium text-[var(--museum-text)]">
												Delete this conversation?
											</p>
											<div class="mt-2 flex items-center justify-end gap-2">
												<button
													type="button"
													class="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--museum-subtext)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.06)]"
													onclick={() => (confirmDeleteConversationId = null)}
												>
													Cancel
												</button>
												<button
													type="button"
													class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold"
													onclick={() => void deleteConversation(result.conversationId)}
												>
													Delete
												</button>
											</div>
										</div>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="min-h-0 flex-1 overflow-y-auto pr-1">
						{#each groupedConversationSummaries as group (group.label)}
							<div class="mb-4">
								<p
									class="mb-2 text-[11px] font-semibold tracking-[0.16em] text-[var(--museum-subtext)] uppercase"
								>
									{group.label}
								</p>
								<ul class="space-y-2">
									{#each group.conversations as conversation (conversation.id)}
										<li>
											<div
												class="relative overflow-hidden rounded-xl border border-[var(--museum-stroke)] bg-white/35 transition hover:bg-white/55"
											>
												<div
													class="relative bg-white/0 px-3 py-3 transition-transform duration-150"
													style={`transform: translateX(${swipedConversationId === conversation.id ? swipeOffsetX : 0}px);`}
													role="group"
													onpointerdown={(event) => beginSwipe(event, conversation.id)}
													onpointermove={(event) => moveSwipe(event, conversation.id)}
													onpointerup={() => endSwipe(conversation.id)}
													onpointercancel={() => clearSwipeState()}
												>
													<div class="flex items-start justify-between gap-3">
														<button
															type="button"
															class="min-w-0 flex-1 text-left hover:cursor-pointer"
															onclick={() => void loadConversationFromHistory(conversation.id)}
														>
															<p class="font-semibold">
																{conversation.title || 'Untitled conversation'}
															</p>
															<p class="mt-1 text-xs text-[var(--museum-subtext)]">
																{conversation.messageCount} messages • updated {new Date(
																	conversation.updatedAt
																).toLocaleString(undefined, { timeStyle: 'short' })}
															</p>
															<p class="mt-1.5 text-xs text-[var(--museum-subtext)]">
																Input <span
																	class="font-semibold text-[var(--museum-text)] tabular-nums"
																	>{conversation.userInputTokens}</span
																>
																• Output
																<span class="font-semibold text-[var(--museum-text)] tabular-nums"
																	>{conversation.completionTokens}</span
																>
															</p>
														</button>
														<button
															type="button"
															class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--museum-subtext)] transition hover:cursor-pointer hover:bg-[rgba(168,58,46,0.08)] hover:text-[rgba(168,58,46,0.98)]"
															onclick={() => (confirmDeleteConversationId = conversation.id)}
															aria-label="Delete conversation"
														>
															<Icon
																icon="material-symbols:delete-outline-rounded"
																class="text-lg"
															/>
														</button>
													</div>

													{#if confirmDeleteConversationId === conversation.id}
														<div
															class="mt-3 rounded-lg border border-[rgba(168,58,46,0.22)] bg-[rgba(248,236,231,0.7)] p-3"
														>
															<p class="text-sm font-medium text-[var(--museum-text)]">
																Delete this conversation?
															</p>
															<div class="mt-2 flex items-center justify-end gap-2">
																<button
																	type="button"
																	class="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--museum-subtext)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.06)]"
																	onclick={() => {
																		confirmDeleteConversationId = null;
																		clearSwipeState();
																	}}
																>
																	Cancel
																</button>
																<button
																	type="button"
																	class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold"
																	onclick={() => void deleteConversation(conversation.id)}
																>
																	Delete
																</button>
															</div>
														</div>
													{/if}
												</div>
											</div>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			{#if !messageSent && chatMessages.length === 0}
				<ChatSuggestions
					suggestions={curatedPrompts}
					onSelect={sendCuratedPrompt}
					kicker="Curated Prompts"
					title="Start from a curated prompt"
					description="Choose a prompt to begin a fresh conversation with the assistant."
				/>
			{/if}

			<div
				bind:this={messagesViewport}
				class="flex-1 space-y-3 overflow-y-auto px-3 py-3 md:px-5 md:py-4"
			>
				{#each chatMessages as msg, idx (`${msg.id}:${idx}`)}
					{#if msg.role === 'tool'}
						<ToolCallCard toolCalls={msg.toolCall ? [msg.toolCall] : []} />
					{:else}
						<ResponseCard message={msg} onOpenFeedback={openFeedback} />
					{/if}
				{/each}

				{#if toolCalling}
					<div class="flex w-full">
						<div
							class="max-w-[92%] rounded-lg border border-[rgba(44,61,75,0.08)] bg-[rgba(44,61,75,0.03)] px-3 py-2 text-[11px] text-[var(--museum-subtext)]"
						>
							<div class="flex items-center gap-2">
								<span
									class="h-3.5 w-3.5 animate-spin rounded-full border border-[rgba(44,61,75,0.18)] border-t-[rgba(44,61,75,0.7)]"
								></span>
								<p class="text-xs font-medium tracking-wide opacity-85">Tool history</p>
							</div>
							<p class="mt-1 pl-[1.35rem] opacity-75">Applying scene updates</p>
						</div>
					</div>
				{/if}
			</div>

			<ChatComposer bind:value={input} {loading} onSubmit={() => send()} />
		{/if}

		{#if feedbackTarget}
			<div class="feedback-overlay" transition:fade>
				<button
					type="button"
					class="feedback-backdrop"
					aria-label="Close feedback dialog"
					onclick={closeFeedback}
				></button>
				<div
					class="feedback-card"
					transition:fade
					role="dialog"
					aria-modal="true"
					aria-labelledby="feedback-title"
					tabindex="-1"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p
								class="text-xs font-semibold tracking-[0.18em] text-[var(--museum-subtext)] uppercase"
							>
								Response Feedback
							</p>
							<h2 id="feedback-title" class="mt-2 text-lg font-semibold text-[var(--museum-text)]">
								Help improve this answer
							</h2>
							<p class="mt-1 text-sm text-[var(--museum-subtext)]">
								Rate the response from 1 to 5 and tell us what could be better.
							</p>
						</div>
						<button type="button" class="feedback-close" onclick={closeFeedback}>Close</button>
					</div>

					<div class="mt-5 space-y-4">
						<div>
							<p class="feedback-label">Initial reaction</p>
							<p class="mt-2 inline-flex items-center gap-2 text-sm text-[var(--museum-subtext)]">
								<Icon
									icon={feedbackPreference === 'up' ? 'lucide:thumbs-up' : 'lucide:thumbs-down'}
									width="16"
									height="16"
									aria-hidden="true"
								/>
								<span>{feedbackPreference === 'up' ? 'Helpful' : 'Needs work'}</span>
							</p>
						</div>

						<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
							<label class="feedback-field">
								<span class="feedback-label">Correctness</span>
								<div class="feedback-stars" role="radiogroup" aria-label="Correctness rating">
									{#each [1, 2, 3, 4, 5] as star}
										<button
											type="button"
											class="feedback-star"
											class:feedback-star-active={star <= feedbackCorrectness}
											onclick={() => setFeedbackRating('correctness', star)}
											aria-label={`Rate correctness ${star} out of 5`}
											aria-pressed={feedbackCorrectness === star}
										>
											<Icon
												icon={star <= feedbackCorrectness
													? 'material-symbols:star-rounded'
													: 'material-symbols:star-outline-rounded'}
												class="feedback-star-icon"
												width="18"
												height="18"
												aria-hidden="true"
											/>
										</button>
									{/each}
								</div>
								<span class="feedback-score">{feedbackCorrectness}/5</span>
							</label>
							<label class="feedback-field">
								<span class="feedback-label">Tone</span>
								<div class="feedback-stars" role="radiogroup" aria-label="Tone rating">
									{#each [1, 2, 3, 4, 5] as star}
										<button
											type="button"
											class="feedback-star"
											class:feedback-star-active={star <= feedbackTone}
											onclick={() => setFeedbackRating('tone', star)}
											aria-label={`Rate tone ${star} out of 5`}
											aria-pressed={feedbackTone === star}
										>
											<Icon
												icon={star <= feedbackTone
													? 'material-symbols:star-rounded'
													: 'material-symbols:star-outline-rounded'}
												class="feedback-star-icon"
												width="18"
												height="18"
												aria-hidden="true"
											/>
										</button>
									{/each}
								</div>
								<span class="feedback-score">{feedbackTone}/5</span>
							</label>
							<label class="feedback-field">
								<span class="feedback-label">Understandability</span>
								<div class="feedback-stars" role="radiogroup" aria-label="Understandability rating">
									{#each [1, 2, 3, 4, 5] as star}
										<button
											type="button"
											class="feedback-star"
											class:feedback-star-active={star <= feedbackUnderstandability}
											onclick={() => setFeedbackRating('understandability', star)}
											aria-label={`Rate understandability ${star} out of 5`}
											aria-pressed={feedbackUnderstandability === star}
										>
											<Icon
												icon={star <= feedbackUnderstandability
													? 'material-symbols:star-rounded'
													: 'material-symbols:star-outline-rounded'}
												class="feedback-star-icon"
												width="18"
												height="18"
												aria-hidden="true"
											/>
										</button>
									{/each}
								</div>
								<span class="feedback-score">{feedbackUnderstandability}/5</span>
							</label>
						</div>

						<label class="feedback-field">
							<span class="feedback-label">What should improve?</span>
							<textarea
								bind:value={feedbackExplanation}
								rows="4"
								maxlength="4000"
								placeholder="Optional: tell us what felt incorrect, confusing, or off-tone."
							></textarea>
						</label>
					</div>

					<div class="mt-6 flex justify-end gap-2">
						<button type="button" class="feedback-secondary" onclick={closeFeedback}>
							Cancel
						</button>
						<button
							type="button"
							class="museum-button rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
							onclick={submitFeedback}
							disabled={submittingFeedback}
						>
							{submittingFeedback ? 'Submitting...' : 'Submit feedback'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<ChatSignInPrompt onSignIn={() => goto(resolve('/login'))} />
{/if}

<style>
	.feedback-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.9rem;
	}

	.feedback-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgba(20, 25, 31, 0.22);
		padding: 0;
		backdrop-filter: blur(4px);
	}

	.feedback-card {
		position: relative;
		z-index: 1;
		width: min(100%, 42rem);
		max-height: min(100dvh - 1.8rem, 48rem);
		overflow-y: auto;
		border-radius: 1.2rem;
		border: 1px solid rgba(44, 61, 75, 0.14);
		background: rgba(255, 250, 242, 0.98);
		padding: 1rem;
		box-shadow: 0 24px 70px rgba(44, 42, 38, 0.2);
	}

	@media (min-width: 768px) {
		.feedback-overlay {
			padding: 1.25rem;
		}

		.feedback-card {
			border-radius: 1.5rem;
			padding: 1.25rem;
		}
	}

	.feedback-close,
	.feedback-secondary {
		border-radius: 9999px;
		border: 1px solid rgba(44, 61, 75, 0.18);
		background: rgba(44, 61, 75, 0.05);
		padding: 0.55rem 0.95rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--museum-text);
		transition: background-color 120ms ease;
	}

	.feedback-close:hover,
	.feedback-secondary:hover {
		cursor: pointer;
		background: rgba(44, 61, 75, 0.1);
	}

	.feedback-field {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.feedback-label {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--museum-text);
	}

	.feedback-score {
		font-size: 0.8rem;
		color: var(--museum-subtext);
	}

	.feedback-stars {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}

	.feedback-star {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: transparent;
		padding: 0.1rem;
		color: rgba(44, 61, 75, 0.28);
		transition:
			color 120ms ease,
			transform 120ms ease;
	}

	.feedback-star:hover {
		cursor: pointer;
		color: rgba(201, 152, 62, 0.95);
		transform: translateY(-1px);
	}

	.feedback-star-active {
		color: rgba(201, 152, 62, 0.95);
	}

	.feedback-star-active :global(svg) {
		fill: currentColor;
	}

	textarea {
		resize: vertical;
		border-radius: 1rem;
		border: 1px solid rgba(44, 61, 75, 0.18);
		background: rgba(255, 255, 255, 0.9);
		padding: 0.8rem 0.95rem;
		font-size: 0.92rem;
		color: var(--museum-text);
	}
</style>
