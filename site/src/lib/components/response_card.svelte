<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Message } from '$lib/chat.svelte';
	import { fade } from 'svelte/transition';

	let { message }: { message: Message } = $props();

	let displayed = $state('');
	let typing = $state(false);

	let interval: ReturnType<typeof setInterval> | null = null;

	let committedLength = 0;
	let initialized = false;

	onMount(() => {
		initialized = true;

		displayed = message.role === 'user' ? message.content : '';
		committedLength = message.role === 'user' ? message.content.length : 0;
	});

	$effect(() => {
		if (!message.content) return;

		if (message.role === 'user') {
			stopTyping();
			displayed = message.content;
			committedLength = message.content.length;
			return;
		}

		if (message.content.length > committedLength) {
			startTyping(message.content);
		}
	});

	function startTyping(full: string) {
		if (typing) return;

		typing = true;

		interval = setInterval(() => {
			if (committedLength < full.length) {
				displayed += full[committedLength];
				committedLength++;
			} else {
				stopTyping();
			}
		}, 15);
	}

	function stopTyping() {
		typing = false;
		if (interval) clearInterval(interval);
		interval = null;
	}

	onDestroy(stopTyping);
</script>

<div class="flex w-full">
	<button
		class="flex flex-row rounded-sm {message.role == 'user'
			? 'ml-auto max-w-2/3 bg-zinc-800 text-left'
			: 'text-left'}"
		in:fade
	>
		<div class="flex flex-col rounded-lg px-4 py-2">
			{#if message.pending && !displayed}
				<span class="opacity-50">...</span>
			{:else}
				<span>
					{displayed}
					{#if message.pending || typing}
						<span class="cursor">|</span>
					{/if}
				</span>
			{/if}
		</div>
	</button>
</div>

<style>
	.cursor {
		display: inline-block;
		margin-left: 2px;
		animation: blink 1s steps(2, start) infinite;
	}

	@keyframes blink {
		to {
			visibility: hidden;
		}
	}
</style>
