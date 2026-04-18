<script lang="ts">
	import type { Message } from '$lib/chat.svelte';
	import { fade } from 'svelte/transition';

	let { message = $bindable() }: { message: Message } = $props();

	let displayed = $state('');
	let queue = '';
	let animating = false;

	function animate() {
		if (!queue.length) {
			animating = false;
			return;
		}
		displayed += queue[0];
		queue = queue.slice(1);
		requestAnimationFrame(animate);
	}

	$effect(() => {
		const incoming = message.content;
		if (!message.live) {
			displayed = message.content;
		}

		// grab only the new characters since last effect run
		const newChars = incoming.slice(displayed.length + queue.length);
		if (!newChars) {
			message.live = false;
			return;
		}
		queue += newChars;
		if (!animating) {
			animating = true;
			requestAnimationFrame(animate);
		}
	});
</script>

<div class="flex w-full">
	<button
		class="flex flex-row rounded-sm {message.role == 'user'
			? 'ml-auto max-w-2/3 bg-zinc-800 text-left shadow-lg shadow-zinc-900'
			: 'text-left'}"
		in:fade
	>
		<div class="flex flex-col rounded-lg px-4 py-2">
			<!-- {#if message.pending} -->
			<!-- 	<span class="opacity-50">...</span> -->
			<!-- {:else} -->
			<span>
				{displayed}
				{#if message.pending}
					<span class="cursor">|</span>
				{/if}
			</span>
			<!-- {/if} -->
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
