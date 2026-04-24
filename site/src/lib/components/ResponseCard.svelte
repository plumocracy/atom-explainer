<script lang="ts">
	import type { Message } from '$lib/chat.svelte';
	import { fade } from 'svelte/transition';

	let { message }: { message: Message } = $props();

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
			return;
		}
		queue += newChars;
		if (!animating) {
			animating = true;
			requestAnimationFrame(animate);
		}
	});
</script>

<div class="flex w-full" in:fade>
	<article
		class="rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-sm {message.role === 'user'
			? 'ml-auto max-w-[82%] border-[rgba(39,80,86,0.36)] bg-[rgba(39,80,86,0.14)] text-[var(--museum-text)]'
			: 'max-w-[92%] border-[var(--museum-stroke)] bg-[rgba(255,255,255,0.62)] text-[var(--museum-text)]'}"
	>
		<p>
			{displayed}
			{#if message.pending}
				<span class="cursor">|</span>
			{/if}
		</p>
	</article>
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
