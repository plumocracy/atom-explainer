<script lang="ts">
	import { chatMessages, simulationValues } from '$lib/chat.svelte';
	import Icon from '@iconify/svelte';
	import ResponseCard from './response_card.svelte';

	let { show_chat, user, do_close } = $props();

	let input = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	async function send() {
		const message = input.trim();
		if (!message || loading) return;

		input = '';
		loading = true;
		error = null;

		const tempId = `temp-${crypto.randomUUID()}`;
		chatMessages.push({ id: tempId, role: 'user' as const, content: message });
		chatMessages.push({
			id: crypto.randomUUID(),
			role: 'assistant' as const,
			content: '',
			pending: true
		});

		const assistantIndex = chatMessages.length - 1;

		try {
			const response = await fetch('/api/chat/v1', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message, currentSimulationValues: simulationValues })
			});

			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6).trim();
					if (!data || data === '[DONE]') continue;
					try {
						const event = JSON.parse(data);

						if (event.type === 'token') {
							chatMessages[assistantIndex].content += event.token;

							// check if we have a complete params sentinel yet
							const content = chatMessages[assistantIndex].content;
							const paramsMatch = content.match(/<params>(.*?)<\/params>/s);
							if (paramsMatch) {
								// update simulation immediately
								try {
									const params = paramsMatch[1] === 'null' ? null : JSON.parse(paramsMatch[1]);
									if (params) {
										simulationValues.n = params.n;
										simulationValues.l = params.l;
										simulationValues.m = params.m;
									}
								} catch {
									/* malformed */
								}

								// strip sentinel so user never sees it
								chatMessages[assistantIndex].content = content
									.replace(/<params>.*?<\/params>/s, '')
									.trimStart();
							} else {
								// sentinel not complete yet, hide it while it's building
								chatMessages[assistantIndex].content = content.replace(/<params>.*$/s, '');
							}
						} else if (event.type === 'done') {
							const userIndex = chatMessages.findIndex((m) => m.id === tempId);
							if (userIndex !== -1) chatMessages[userIndex].id = event.userMessageId;
							chatMessages[assistantIndex].id = event.assistantMessageId;
							chatMessages[assistantIndex].content = event.message;
							chatMessages[assistantIndex].pending = false;

							if (event.params) {
								simulationValues.n = event.params.n;
								simulationValues.l = event.params.l;
								simulationValues.m = event.params.m;
							}
						} else if (event.type === 'error') {
							error = event.error;
							chatMessages.pop();
							chatMessages.pop();
						}
					} catch {
						/* skip malformed */
					}
				}
			}
		} catch (e) {
			error = String(e);
			chatMessages.pop();
			chatMessages.pop();
		} finally {
			loading = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
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
		{#each chatMessages as msg (msg.id)}
			<ResponseCard message={msg} {user} />
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
			/>
			<button onclick={send} disabled={loading || !input.trim()} class="text-5xl">
				{#if loading}
					<Icon icon="eos-icons:atom-electron" class="animate-pulse" />
				{:else}
					<Icon icon="solar:round-arrow-up-bold" class="hover:cursor-pointer hover:text-zinc-100" />
				{/if}
			</button>
		</div>
	</div>
</div>
