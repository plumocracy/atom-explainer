<script lang="ts">
	import { chatMessages, simulationValues } from '$lib/chat.svelte';
	import ResponseCard from './ResponseCard.svelte';
	import ChatWindowHeader from './ChatWindowHeader.svelte';
	import ChatSuggestions from './ChatSuggestions.svelte';
	import ChatComposer from './ChatComposer.svelte';
	import ChatSignInPrompt from './ChatSignInPrompt.svelte';
	import ToolCallCard from './ToolCallCard.svelte';
	import { useChatStream } from '$lib/use-chat-stream';
	import { goto } from '$app/navigation';

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

	const messageSuggestions = ['What are your capabilities?', 'What am I looking at?'];

	const { sendMessage } = useChatStream({
		chatMessages,
		simulationValues,
		setLoading: (next) => {
			loading = next;
		},
		setToolCalling: (next) => {
			toolCalling = next;
		}
	});

	const send = async (prebakedMsg?: string) => {
		const message = prebakedMsg ?? input.trim();
		if (!message || loading) {
			return;
		}

		messageSent = true;
		sendMessage(message);
		input = '';
	};
</script>

{#if user}
	<div class="flex h-full w-full flex-col bg-[rgba(247,241,230,0.62)] text-[var(--museum-text)]">
		<ChatWindowHeader {user} onClose={do_close} />

		{#if !messageSent && chatMessages.length === 0}
			<ChatSuggestions suggestions={messageSuggestions} onSelect={send} />
		{/if}

		<div class="flex-1 space-y-3 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
			{#each chatMessages as msg, idx (`${msg.id}:${idx}`)}
				{#if msg.role === 'tool'}
					<ToolCallCard message={msg} />
				{:else}
					<ResponseCard message={msg} />
				{/if}
			{/each}

			{#if toolCalling}
				<div class="flex w-full">
					<div class="max-w-[88%] rounded-xl border border-[rgba(184,138,71,0.4)] bg-[rgba(184,138,71,0.12)] px-3 py-2 text-xs text-[var(--museum-text)]">
						<p class="font-semibold tracking-wide uppercase">Calling tools...</p>
						<p class="mt-1 text-[var(--museum-subtext)]">Applying simulation updates</p>
					</div>
				</div>
			{/if}
		</div>

		<ChatComposer bind:value={input} {loading} onSubmit={() => send()} />
	</div>
{:else}
	<ChatSignInPrompt onSignIn={() => goto('/login')} />
{/if}
