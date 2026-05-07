<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import Icon from '@iconify/svelte';
	import {
		bohrSimulationValues,
		chatMessages,
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
	import { guidedTourState } from '$lib/tours/tour-state.svelte';
	import { clearGuidedTour, startGuidedTour, stopGuidedTour } from '$lib/tours/tour-runner';

	type ChatUser = {
		name?: string | null;
		image?: string | null;
	};

	let {
		user,
		do_close
	}: {
		user: ChatUser | null | undefined;
		do_close: () => void;
	} = $props();

	let input = $state('');
	let messageSent = $state(false);
	let creatingConversation = $state(false);
	let messagesViewport = $state<HTMLDivElement | null>(null);
	let feedbackTarget = $state<Message | null>(null);
	let feedbackPreference = $state<'up' | 'down'>('up');
	let feedbackCorrectness = $state(5);
	let feedbackTone = $state(5);
	let feedbackUnderstandability = $state(5);
	let feedbackExplanation = $state('');
	let submittingFeedback = $state(false);

	const messageSuggestions = ['Bohr Model vs. Orbital Model'];
	const availableTours = getTourSummary();
	const primaryTour = availableTours[0];
	const guidedTourActive = $derived(guidedTourState.status === 'running');
	const loading = $derived(chatUiState.loading);
	const toolCalling = $derived(chatUiState.toolCalling);

	const { sendMessage, sendSeededMessage } = useChatStream({
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

	const createNewConversation = async () => {
		if (loading || creatingConversation) {
			return;
		}

		creatingConversation = true;

		try {
			const response = await fetch('/api/chat/v1/conversation', {
				method: 'POST'
			});

			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				error?: unknown;
			} | null;

			if (!response.ok || payload?.success !== true) {
				showErrorToast(payload?.error, 'Could not create a new conversation.');
				return;
			}

			chatUiState.conversationId = null;
			chatMessages.length = 0;
			messageSent = false;
			input = '';
			feedbackTarget = null;
			clearGuidedTour();
		} catch (error) {
			showErrorToast(error, 'Could not create a new conversation.');
		} finally {
			creatingConversation = false;
		}
	};

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

			const payload = (await response.json().catch(() => null)) as
				| { success?: boolean; error?: unknown }
				| null;

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
	<div class="relative flex h-full w-full flex-col bg-[rgba(247,241,230,0.62)] text-[var(--museum-text)]">
		<ChatWindowHeader
			onClose={do_close}
			onNewConversation={createNewConversation}
			newConversationDisabled={loading || creatingConversation}
		/>
		{#if false}
			<div class="border-b border-[var(--museum-stroke)] px-4 py-3 md:px-5">
				<div
					class="rounded-xl border border-[rgba(44,61,75,0.12)] bg-[rgba(255,255,255,0.4)] px-3 py-3"
				>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p
								class="text-[10px] font-semibold tracking-wide text-[var(--museum-subtext)] uppercase"
							>
								Guided Tour
							</p>
							<p class="mt-1 text-sm font-semibold text-[var(--museum-text)]">
								{primaryTour.title}
							</p>
							<p class="mt-1 text-xs text-[var(--museum-subtext)]">{primaryTour.description}</p>
						</div>
						{#if guidedTourActive}
							<button
								type="button"
								class="rounded-full border border-[rgba(44,61,75,0.18)] px-3 py-1.5 text-xs font-semibold text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
								onclick={stopGuidedTour}
								disabled={loading}
							>
								Stop tour
							</button>
						{:else}
							<button
								type="button"
								class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
								onclick={startPrimaryTour}
								disabled={loading}
							>
								Start tour
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		{#if !messageSent && chatMessages.length === 0}
			<ChatSuggestions suggestions={messageSuggestions} onSelect={send} />
		{/if}

		<div
			bind:this={messagesViewport}
			class="flex-1 space-y-3 overflow-y-auto px-4 py-3 md:px-5 md:py-4"
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
							<p class="text-xs font-semibold tracking-[0.18em] text-[var(--museum-subtext)] uppercase">
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

						<div class="grid gap-4 md:grid-cols-3">
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
												icon={
													star <= feedbackCorrectness
														? 'material-symbols:star-rounded'
														: 'material-symbols:star-outline-rounded'
												}
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
												icon={
													star <= feedbackTone
														? 'material-symbols:star-rounded'
														: 'material-symbols:star-outline-rounded'
												}
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
												icon={
													star <= feedbackUnderstandability
														? 'material-symbols:star-rounded'
														: 'material-symbols:star-outline-rounded'
												}
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
		padding: 1.25rem;
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
		border-radius: 1.5rem;
		border: 1px solid rgba(44, 61, 75, 0.14);
		background: rgba(255, 250, 242, 0.98);
		padding: 1.25rem;
		box-shadow: 0 24px 70px rgba(44, 42, 38, 0.2);
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
