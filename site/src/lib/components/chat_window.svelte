<script lang="ts">
	import { chatMessages, simulationValues } from '$lib/chat.svelte';
	import Icon from '@iconify/svelte';
	import ResponseCard from './response_card.svelte';
	import { EventSourcePlus } from 'event-source-plus';

	let { show_chat, user, do_close } = $props();

	let input = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	// TODO: Give prompt suggestions to user if no message's sent.
	let messageSent = $state<boolean>(false);

	async function send() {
		const message = input.trim();
		if (!message || loading) return;

		loading = true;

		chatMessages.push({
			role: 'user' as const,
			content: message,
			live: false
		});

		chatMessages.push({
			role: 'assistant' as const,
			content: '',
			pending: true,
			live: true
		});

		const botMessageIdx = chatMessages.length - 1;

		try {
			let es = new EventSourcePlus('/api/chat/v1', {
				method: 'post',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: textareaEl?.value, values: simulationValues })
			});

			textareaEl!.value = '';
			loading = true;

			es.listen({
				onMessage(msg) {
					try {
						const json = JSON.parse(msg.data);

						if (json.token) {
							console.log(json.token);
							chatMessages[botMessageIdx].content += json.token;
						} else if (json.msgId) {
						} else if (json.done) {
							chatMessages[botMessageIdx].pending = false;
							loading = false;
						}
					} catch (e) {
						console.error(`Could not parse response (sse) data: ${msg.data}`);
					}
				}
			});
		} catch (error) {
			console.error(error);
		} finally {
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (loading) {
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	function onInput() {
		if (!textareaEl) return;
		textareaEl.style.height = 'auto';
		textareaEl.style.height = `${textareaEl.scrollHeight}px`;
	}
</script>

<div class="flex h-full w-full flex-col text-zinc-300">
	<div class="flex h-14 w-full flex-row">
		<div class="mr-auto flex h-full flex-row space-x-4 pl-4">
			<img src={user.image} class="my-auto h-10 rounded-full" />
			<span class="my-auto">{user.name}</span>
		</div>
		<button
			class="my-auto pr-4 text-4xl hover:cursor-pointer hover:text-zinc-100"
			onclick={() => do_close()}
		>
			<Icon icon="material-symbols:close" />
		</button>
	</div>
	<hr />
	<div class="flex-1 space-y-4 overflow-y-auto p-4">
		{#each chatMessages as msg}
			<ResponseCard message={msg} />
		{/each}
	</div>

	{#if error}
		<p class="px-4 text-sm text-red-500">{error}</p>
	{/if}
	<div class="transition-100 mb-4 flex w-full px-4 transition-[height]">
		<div
			class="transition-[height, padding] transition-100 flex w-full gap-2 rounded-full bg-zinc-800 p-4"
		>
			<textarea
				bind:this={textareaEl}
				bind:value={input}
				rows="1"
				disabled={loading}
				oninput={onInput}
				onkeydown={onKeydown}
				placeholder="Ask about atomic orbitals..."
				class="transition-100 my-auto flex-1 resize-none border-0 bg-zinc-800 ring-0 transition-[height] focus:border-0 focus:ring-0"
			></textarea>
			<button onclick={send} disabled={loading || !input.trim()} class="text-5xl">
				{#if loading}
					<Icon
						icon="eos-icons:atom-electron"
						class="animate-pulse {loading
							? 'opacity-100'
							: 'opacity-o'} transiton-100 transition-opacity"
					/>
				{:else}
					<Icon
						icon="solar:round-arrow-up-bold"
						class="hover:cursor-pointer hover:text-zinc-100 {loading
							? 'opacity-0'
							: 'opacity-100'} transition-100 transition-opacity"
					/>
				{/if}
			</button>
		</div>
	</div>
</div>
