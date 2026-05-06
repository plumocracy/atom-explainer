<script lang="ts">
	import { tick } from 'svelte';
	import {
		bohrSimulationValues,
		chatMessages,
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
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { showErrorToast } from '$lib/toast.svelte';
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
	let loading = $state(false);
	let toolCalling = $state(false);
	let messageSent = $state(false);
	let creatingConversation = $state(false);
	let messagesViewport = $state<HTMLDivElement | null>(null);

	const messageSuggestions = ['Bohr Model vs. Orbital Model'];
	const availableTours = getTourSummary();
	const primaryTour = availableTours[0];
	const guidedTourActive = $derived(guidedTourState.status === 'running');

	const { sendMessage } = useChatStream({
		chatMessages,
		simulationValues,
		bohrSimulationValues,
		visualizationState,
		setLoading: (next) => {
			loading = next;
		},
		setToolCalling: (next) => {
			toolCalling = next;
		}
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

			chatMessages.length = 0;
			messageSent = false;
			input = '';
			clearGuidedTour();
		} catch (error) {
			showErrorToast(error, 'Could not create a new conversation.');
		} finally {
			creatingConversation = false;
		}
	};
</script>

{#if user}
	<div class="flex h-full w-full flex-col bg-[rgba(247,241,230,0.62)] text-[var(--museum-text)]">
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
					<ResponseCard message={msg} />
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
	</div>
{:else}
	<ChatSignInPrompt onSignIn={() => goto(resolve('/login'))} />
{/if}
